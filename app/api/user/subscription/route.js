import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getCreatorEntitlements } from '@/lib/creatorEntitlements';

export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const { plan, planId, isAdmin, subscription, status, source, grant } = await getCreatorEntitlements(userId);
        const item = subscription?.items?.data?.[0];
        const paid = source === 'stripe';
        const billingRecord = source !== 'complimentary' && Boolean(subscription && !['canceled', 'incomplete_expired'].includes(subscription.status));
        return NextResponse.json({
            plan, planId, limits: plan.limits, status, source,
            complimentaryExpiry: grant?.expiresAt || null,
            subscriptionId: billingRecord ? subscription.id : null,
            priceId: billingRecord ? item?.price?.id || null : null,
            price: billingRecord ? item?.price?.unit_amount ?? 0 : 0,
            currency: item?.price?.currency?.toUpperCase() || plan.currency,
            interval: item?.price?.recurring?.interval || plan.interval,
            monthlyEquivalent: plan.monthlyEquivalent ?? plan.amount,
            annualSavings: plan.annualSavings ?? 0,
            current_period_end: paid ? subscription?.current_period_end ?? item?.current_period_end ?? null : null,
            created: subscription?.created || null,
            cancelled_at: subscription?.canceled_at || null,
            cancel_at_period_end: Boolean(subscription?.cancel_at_period_end),
            pending_update: Boolean(subscription?.pending_update),
            pending_update_expiry: subscription?.pending_update?.expires_at || null,
            days_until_due: subscription?.days_until_due ?? null,
            trial_end: subscription?.trial_end || null,
            role: isAdmin ? 'admin' : 'user',
        });
    } catch (error) {
        console.error('Unable to read subscription:', error?.code || error?.type || 'provider_error');
        return NextResponse.json({ error: 'Unable to load your subscription.' }, { status: error.status || 500 });
    }
}
