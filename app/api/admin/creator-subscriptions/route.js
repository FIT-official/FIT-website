import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getCreatorEntitlementsForUser } from '@/lib/creatorEntitlements';
import { GRANT_PLANS, QUOTA_KEYS } from '@/lib/creatorAccess';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function adminClient() {
    const { userId } = await auth();
    if (!userId) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    const client = await clerkClient();
    const actor = await client.users.getUser(userId);
    if (actor?.publicMetadata?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    return { client, userId };
}

async function rowFor(user) {
    const access = await getCreatorEntitlementsForUser(user);
    return {
        userId: user.id,
        name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'Unnamed account',
        email: user.emailAddresses?.find(item => item.id === user.primaryEmailAddressId)?.emailAddress || user.emailAddresses?.[0]?.emailAddress || '',
        planId: access.planId,
        source: access.source,
        status: access.status,
        expiry: access.grant?.expiresAt || null,
        billingPeriodEnd: access.subscription?.current_period_end || access.subscription?.items?.data?.[0]?.current_period_end || null,
        cancelAtPeriodEnd: Boolean(access.subscription?.cancel_at_period_end),
        hasOpenSubscription: Boolean(access.subscription && !['canceled', 'incomplete_expired'].includes(access.subscription.status)),
        limits: access.plan.limits,
        quota: access.quota,
        grant: user.privateMetadata?.creatorAccess?.grant || null,
        isAdmin: access.isAdmin,
    };
}

function failure(error) {
    console.error('Creator subscriptions admin request failed:', error?.code || error?.type || 'provider_error');
    return NextResponse.json({ error: 'Unable to load or update creator access.' }, { status: 500 });
}

export async function GET(request) {
    try {
        const { client, error } = await adminClient();
        if (error) return error;
        const url = new URL(request.url);
        const offset = Math.max(0, Math.min(100000, Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0));
        const query = (url.searchParams.get('q') || '').trim().slice(0, 100);
        const { data, totalCount } = await client.users.getUserList({ limit: 20, offset, ...(query ? { query } : {}) });
        // Keep the page bounded; each paid row must be checked against Stripe live.
        const rows = [];
        for (let index = 0; index < data.length; index += 5) {
            rows.push(...await Promise.all(data.slice(index, index + 5).map(rowFor)));
        }
        return NextResponse.json({ rows, totalCount, offset, pageSize: 20 }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) { return failure(error); }
}

export async function POST(request) {
    try {
        const { client, userId: adminId, error } = await adminClient();
        if (error) return error;
        const origin = request.headers.get('origin');
        if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        if (!request.headers.get('content-type')?.includes('application/json')) return NextResponse.json({ error: 'Use a JSON request.' }, { status: 415 });
        let body;
        try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
        const targetId = typeof body?.userId === 'string' ? body.userId.trim() : '';
        if (!/^user_[A-Za-z0-9]+$/.test(targetId)) return NextResponse.json({ error: 'Choose an existing account.' }, { status: 400 });
        let user;
        try { user = await client.users.getUser(targetId); }
        catch (error) { if (error?.status === 404) return NextResponse.json({ error: 'Account not found.' }, { status: 404 }); throw error; }
        if (user.publicMetadata?.role === 'admin') return NextResponse.json({ error: 'Admin accounts already have full access.' }, { status: 409 });
        const current = user.privateMetadata?.creatorAccess || {};
        const now = new Date();
        const next = { ...current };
        const action = body.action;
        if (action === 'grant' || action === 'extend') {
            const planId = action === 'extend' ? current.grant?.planId : body.planId;
            const expiry = new Date(body.expiresAt);
            if (!GRANT_PLANS.includes(planId) || !Number.isFinite(expiry.getTime()) ||
                expiry <= now || expiry.getTime() > now.getTime() + 10 * 366 * 86400000) {
                return NextResponse.json({ error: 'Choose Student, Standard or Pro and a future expiry within ten years.' }, { status: 400 });
            }
            if (action === 'extend' && (!current.grant || expiry <= new Date(current.grant.expiresAt))) {
                return NextResponse.json({ error: 'The new expiry must be later than the existing one.' }, { status: 400 });
            }
            const access = await getCreatorEntitlementsForUser(user);
            if (access.status === 'unavailable' || (user.publicMetadata?.stripeSubscriptionId && !access.subscription) ||
                (access.subscription && !['canceled', 'incomplete_expired'].includes(access.subscription.status))) {
                return NextResponse.json({ error: 'This account has a Stripe subscription. End or resolve its billing before granting free access.' }, { status: 409 });
            }
            next.grant = { planId, expiresAt: expiry.toISOString(), grantedBy: current.grant?.grantedBy || adminId, updatedBy: adminId, updatedAt: now.toISOString() };
        } else if (action === 'revoke') {
            next.grant = null;
        } else if (action === 'quota') {
            if (!body.quota || typeof body.quota !== 'object' || Array.isArray(body.quota) || Object.keys(body.quota).some(key => !QUOTA_KEYS.includes(key))) {
                return NextResponse.json({ error: 'Invalid quota values.' }, { status: 400 });
            }
            const quota = { ...(current.quota || {}) };
            for (const key of QUOTA_KEYS) {
                if (!(key in body.quota)) continue;
                const value = body.quota[key];
                if (value === null) quota[key] = null;
                else if (Number.isSafeInteger(value) && value >= 0 && value <= 100000) quota[key] = value;
                else return NextResponse.json({ error: 'Quotas must be whole numbers from 0 to 100,000.' }, { status: 400 });
            }
            next.quota = quota;
        } else return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
        next.updatedBy = adminId;
        next.updatedAt = now.toISOString();
        next.history = [...(Array.isArray(current.history) ? current.history.slice(-24) : []), { action, by: adminId, at: now.toISOString(), ...(next.grant ? { planId: next.grant.planId, expiresAt: next.grant.expiresAt } : {}) }];
        const updated = await client.users.updateUserMetadata(targetId, { privateMetadata: { creatorAccess: next } });
        return NextResponse.json({ row: await rowFor(updated) });
    } catch (error) { return failure(error); }
}
