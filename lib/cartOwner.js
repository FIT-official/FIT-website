import { createHash, randomBytes } from 'node:crypto';
import { auth } from '@clerk/nextjs/server';
import User from '@/models/User';
import { storeDeadline } from '@/lib/storeDeadline';

const COOKIE = 'fit_guest_cart';

// The browser holds a random capability, never a Mongo ID or a Clerk user ID.
// Reuse the existing Mongo cart/order schema so guest fulfilment uses the same
// transaction and purchase snapshots as account checkout.
export async function cartIdentity(req, { create = false } = {}) {
    const { userId } = await storeDeadline(auth()); // An auth outage must not change cart ownership.
    if (userId) return { userId, guest: false };
    const raw = req?.cookies?.get(COOKIE)?.value ||
        req?.headers?.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    let token = /^[a-f0-9]{64}$/.test(raw || '') ? raw : null;
    const fresh = !token && create;
    if (fresh) token = randomBytes(32).toString('hex');
    return { guest: true, token: fresh ? token : null,
        userId: token ? `guest_${createHash('sha256').update(token).digest('hex')}` : null };
}

export async function cartOwner(identity, { create = false } = {}) {
    if (!identity.userId) return null;
    if (identity.guest && create) {
        return User.findOneAndUpdate({ userId: identity.userId },
            { $setOnInsert: { userId: identity.userId, cart: [] } },
            { upsert: true, new: true, setDefaultsOnInsert: true });
    }
    return User.findOne({ userId: identity.userId });
}

export function withCartCookie(response, identity) {
    if (identity?.token) response.cookies.set(COOKIE, identity.token, {
        httpOnly: true, secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30,
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
}
