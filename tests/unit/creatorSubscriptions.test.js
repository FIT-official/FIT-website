import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(), getUser: vi.fn(), updateUser: vi.fn(), updateUserMetadata: vi.fn(), getUserList: vi.fn(),
    pricesRetrieve: vi.fn(), subscriptionRetrieve: vi.fn(), subscriptionList: vi.fn(),
    subscriptionCreate: vi.fn(), subscriptionUpdate: vi.fn(),
    customerCreate: vi.fn(), customerRetrieve: vi.fn(), customerUpdate: vi.fn(),
    paymentCreate: vi.fn(), paymentAttach: vi.fn(), paymentUpdate: vi.fn(), constructEvent: vi.fn(),
}));
vi.mock('@clerk/nextjs/server', () => ({
    auth: mocks.auth,
    clerkClient: async () => ({ users: { getUser: mocks.getUser, updateUser: mocks.updateUser, updateUserMetadata: mocks.updateUserMetadata, getUserList: mocks.getUserList } }),
    clerkMiddleware: handler => handler,
    createRouteMatcher: patterns => req => patterns.some(pattern => new RegExp(`^${pattern}$`).test(new URL(req.url).pathname)),
}));
vi.mock('stripe', () => ({ default: class Stripe {
    prices = { retrieve: mocks.pricesRetrieve };
    subscriptions = { retrieve: mocks.subscriptionRetrieve, list: mocks.subscriptionList, create: mocks.subscriptionCreate, update: mocks.subscriptionUpdate };
    customers = { create: mocks.customerCreate, retrieve: mocks.customerRetrieve, update: mocks.customerUpdate };
    paymentMethods = { create: mocks.paymentCreate, attach: mocks.paymentAttach };
    paymentIntents = { update: mocks.paymentUpdate };
    webhooks = { constructEvent: mocks.constructEvent };
} }));
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn() }));
vi.mock('@/models/User', () => ({ default: {} }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { CREATOR_PLANS, getCreatorPlan } from '@/lib/creatorPlans';
import { getCreatorEntitlements, getPlanForSubscription, getPlanForPriceId, isPriceValidForPlan } from '@/lib/creatorEntitlements';
import { requireCreator } from '@/lib/requireCreator';
import { POST as edit } from '@/app/api/user/subscription/edit/route';
import { POST as webhook } from '@/app/api/user/subscription/webhook/route';
import { POST as cancel } from '@/app/api/user/subscription/cancel/route';
import { GET as read } from '@/app/api/user/subscription/route';
import { GET as info } from '@/app/api/subscription/info/route';
import { updateRoleFromStripe } from '@/app/onboarding/_actions';
import middleware from '@/middleware';

let user;
const price = (id = 'price_standard', extra = {}) => ({ id, active: true, unit_amount: id === 'price_pro' ? 9900 : 3900, currency: 'sgd', recurring: { interval: 'month', interval_count: 1 }, product: { active: true }, ...extra });
const subscription = (extra = {}) => ({
    id: 'sub_current', customer: 'cus_owner', status: 'active', metadata: { clerkUserId: 'user_owner' },
    items: { data: [{ id: 'si_current', price: price() }] }, ...extra,
});
const request = (body = { priceId: 'price_standard', cardToken: 'tok_valid' }) => new Request('https://fit.example/api/user/subscription/edit', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const eventRequest = () => new Request('https://fit.example/api/user/subscription/webhook', { method: 'POST', headers: { 'stripe-signature': 'test_signature' }, body: '{}' });

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_unit');
    vi.stubEnv('STRIPE_STANDARD_MONTHLY_PRICE_ID', 'price_standard');
    vi.stubEnv('STRIPE_PRO_MONTHLY_PRICE_ID', 'price_pro');
    vi.stubEnv('STRIPE_SUBSCRIPTION_SIGNING_SECRET', 'whsec_unit');
    user = { id: 'user_owner', publicMetadata: { role: 'user' }, unsafeMetadata: {}, emailAddresses: [{ emailAddress: 'owner@example.test' }] };
    mocks.auth.mockResolvedValue({ userId: user.id });
    mocks.getUser.mockImplementation(async () => user);
    mocks.updateUser.mockImplementation(async (_id, values) => { user = { ...user, ...values }; return user; });
    mocks.updateUserMetadata.mockImplementation(async (_id, values) => {
        for (const [field, metadata] of Object.entries(values)) {
            user[field] = { ...user[field], ...metadata };
            for (const [key, value] of Object.entries(user[field])) if (value === null) delete user[field][key];
        }
        return user;
    });
    mocks.getUserList.mockResolvedValue({ data: [] });
    mocks.pricesRetrieve.mockResolvedValue(price());
    mocks.subscriptionRetrieve.mockResolvedValue(subscription());
    mocks.subscriptionList.mockResolvedValue({ data: [], has_more: false });
    mocks.subscriptionCreate.mockResolvedValue(subscription());
    mocks.subscriptionUpdate.mockResolvedValue(subscription());
    mocks.customerCreate.mockResolvedValue({ id: 'cus_owner' });
    mocks.customerRetrieve.mockResolvedValue({ id: 'cus_owner', metadata: { clerkUserId: user.id } });
    mocks.paymentCreate.mockResolvedValue({ id: 'pm_unit' });
});

describe('creator entitlement contract', () => {
    it('provides one usable free plan and two bounded SGD monthly plans', () => {
        expect(CREATOR_PLANS.map(({ id, amount, limits }) => [id, amount, limits.products, limits.monthlyPrintRequests])).toEqual([
            ['free', 0, 3, 10], ['standard', 39, 25, 100], ['pro', 99, 100, 500],
        ]);
    });
    it('allows an authenticated free creator without a Stripe credential', async () => {
        vi.stubEnv('STRIPE_SECRET_KEY', '');
        expect(await requireCreator(user.id)).toBe(true);
        expect(await getCreatorEntitlements(user.id)).toMatchObject({ planId: 'free', status: 'free' });
        expect(mocks.subscriptionRetrieve).not.toHaveBeenCalled();
    });
    it('does not authorise an absent user', async () => {
        expect(await requireCreator(null)).toBe(false);
        await expect(getCreatorEntitlements(null)).rejects.toMatchObject({ status: 401 });
    });
    it.each(['incomplete', 'incomplete_expired', 'past_due', 'unpaid', 'canceled', 'paused'])('does not uplift quotas for %s', status => {
        expect(getPlanForSubscription(subscription({ status })).id).toBe('free');
    });
    it.each(['active', 'trialing'])('recognises live %s trusted prices', status => {
        expect(getPlanForSubscription(subscription({ status })).id).toBe('standard');
    });
    it('preserves minimum access for active legacy plans', () => {
        expect(getPlanForSubscription(subscription({ items: { data: [{ price: { id: 'price_legacy' } }] } })).id).toBe('free');
    });
    it('keeps an existing paid subscription when its price is archived', () => {
        expect(getPlanForSubscription(subscription({ items: { data: [{ quantity: 1, price: price('price_standard', { active: false }) }] } })).id).toBe('standard');
    });
    it('does not uplift a live subscription with a trusted ID but the wrong price terms', () => {
        expect(getPlanForSubscription(subscription({ items: { data: [{ quantity: 1, price: price('price_standard', { unit_amount: 100 }) }] } })).id).toBe('free');
        expect(getPlanForSubscription(subscription({ items: { data: [{ quantity: 2, price: price() }] } })).id).toBe('free');
    });
    it('does not grant a paid plan for a mismatched customer', async () => {
        user.publicMetadata = { stripeCustomerId: 'cus_someone_else', stripeSubscriptionId: 'sub_current' };
        expect(await getCreatorEntitlements(user.id)).toMatchObject({ planId: 'free', subscription: null });
    });
    it('rejects duplicate price mappings', () => {
        vi.stubEnv('STRIPE_PRO_MONTHLY_PRICE_ID', 'price_standard');
        expect(getPlanForPriceId('price_standard')).toBe(null);
    });
    it.each([
        { unit_amount: 390 }, { currency: 'usd' }, { recurring: { interval: 'year' } },
        { recurring: { interval: 'month', interval_count: 12 } }, { active: false }, { product: { active: false } },
    ])('rejects misconfigured checkout price %j', extra => {
        expect(isPriceValidForPlan(price('price_standard', extra), getCreatorPlan('standard'))).toBe(false);
    });
});

describe('subscription checkout', () => {
    it('rejects client metadata arbitrary price before any provider or card mutation', async () => {
        user.unsafeMetadata = { priceId: 'price_attacker', cardToken: 'tok_valid' };
        const response = await edit(new Request('https://fit.example/api/user/subscription/edit', { method: 'POST' }));
        expect(response.status).toBe(400);
        expect(mocks.pricesRetrieve).not.toHaveBeenCalled();
        expect(mocks.paymentCreate).not.toHaveBeenCalled();
    });
    it('rejects a trusted ID with the wrong amount before creating a customer/card', async () => {
        mocks.pricesRetrieve.mockResolvedValue(price('price_standard', { unit_amount: 100 }));
        expect((await edit(request())).status).toBe(503);
        expect(mocks.customerCreate).not.toHaveBeenCalled();
        expect(mocks.paymentCreate).not.toHaveBeenCalled();
    });
    it('never reports incomplete SCA as a successful plan upgrade', async () => {
        mocks.subscriptionCreate.mockResolvedValue(subscription({ status: 'incomplete', latest_invoice: { payment_intent: { status: 'requires_action', client_secret: 'secret_for_owner' } } }));
        const response = await edit(request());
        expect(await response.json()).toMatchObject({ success: false, status: 'incomplete', planId: 'free', requires_action: true, clientSecret: 'secret_for_owner' });
        expect(user.publicMetadata).toMatchObject({ creatorPlanId: 'free', stripeSubscriptionStatus: 'incomplete', stripeSubscriptionId: 'sub_current' });
    });
    it('persists a verified successful paid plan while retaining role', async () => {
        user.publicMetadata.role = 'admin';
        expect(await (await edit(request())).json()).toMatchObject({ success: true, planId: 'standard' });
        expect(user.publicMetadata).toMatchObject({ role: 'admin', creatorPlanId: 'standard' });
        expect(mocks.subscriptionCreate.mock.calls[0][1]).toEqual({ idempotencyKey: 'fit-subscription:user_owner:cus_owner:first' });
    });
    it('does not open a second subscription during a retry requiring authentication', async () => {
        user.publicMetadata = { stripeCustomerId: 'cus_owner', stripeSubscriptionId: 'sub_current' };
        mocks.subscriptionRetrieve.mockResolvedValue(subscription({ status: 'incomplete', latest_invoice: { payment_intent: { status: 'requires_action', client_secret: 'secret_for_owner' } } }));
        expect(await (await edit(request())).json()).toMatchObject({ success: false, requires_action: true });
        expect(mocks.subscriptionCreate).not.toHaveBeenCalled();
        expect(mocks.paymentCreate).not.toHaveBeenCalled();
    });
    it('does not replace an existing subscription belonging to another customer', async () => {
        user.publicMetadata = { stripeCustomerId: 'cus_other', stripeSubscriptionId: 'sub_current' };
        expect((await edit(request())).status).toBe(403);
        expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
        expect(mocks.paymentCreate).not.toHaveBeenCalled();
    });
    it('retains Standard limits when a Pro update is pending', async () => {
        user.publicMetadata = { stripeCustomerId: 'cus_owner', stripeSubscriptionId: 'sub_current' };
        mocks.pricesRetrieve.mockResolvedValue(price('price_pro'));
        mocks.subscriptionUpdate.mockResolvedValue(subscription({ pending_update: { subscription_items: [{ price: 'price_pro' }] }, latest_invoice: { payment_intent: { status: 'requires_action', client_secret: 'secret_upgrade' } } }));
        expect(await (await edit(request({ priceId: 'price_pro', cardToken: 'tok_valid' }))).json()).toMatchObject({ success: false, planId: 'standard', pending_update: true, requires_action: true });
    });
});

describe('subscription lifecycle and routing', () => {
    it('returns a real Free plan instead of a missing-subscription error', async () => {
        const response = await read();
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ planId: 'free', priceId: null, limits: { products: 3, monthlyPrintRequests: 10 } });
    });
    it('does not reveal arbitrary Stripe product information', async () => {
        expect((await info(new Request('https://fit.example/api/subscription/info?priceId=price_unlisted'))).status).toBe(400);
        expect(mocks.pricesRetrieve).not.toHaveBeenCalled();
    });
    it('ignores cancellation of an older subscription for the same customer', async () => {
        user.publicMetadata = { stripeCustomerId: 'cus_owner', stripeSubscriptionId: 'sub_replacement' };
        mocks.constructEvent.mockReturnValue({ type: 'customer.subscription.deleted', data: { object: subscription({ status: 'canceled' }) } });
        expect(await (await webhook(eventRequest())).json()).toMatchObject({ matched: false });
        expect(mocks.updateUser).not.toHaveBeenCalled();
        expect(mocks.updateUserMetadata).not.toHaveBeenCalled();
    });
    it('falls back to Free after exact current subscription cancellation', async () => {
        user.publicMetadata = { role: 'admin', stripeCustomerId: 'cus_owner', stripeSubscriptionId: 'sub_current' };
        mocks.constructEvent.mockReturnValue({ type: 'customer.subscription.deleted', data: { object: subscription({ status: 'canceled' }) } });
        expect(await (await webhook(eventRequest())).json()).toMatchObject({ matched: true });
        expect(user.publicMetadata).toMatchObject({ role: 'admin', creatorPlanId: 'free', stripeSubscriptionStatus: 'canceled' });
        expect(user.publicMetadata.stripeSubscriptionId).toBeUndefined();
    });
    it('uses current Stripe status for a stale update event', async () => {
        user.publicMetadata = { stripeCustomerId: 'cus_owner', stripeSubscriptionId: 'sub_current' };
        mocks.constructEvent.mockReturnValue({ type: 'customer.subscription.updated', data: { object: subscription() } });
        mocks.subscriptionRetrieve.mockResolvedValue(subscription({ status: 'past_due' }));
        expect((await webhook(eventRequest())).status).toBe(200);
        expect(user.publicMetadata).toMatchObject({ creatorPlanId: 'free', stripeSubscriptionStatus: 'past_due' });
        expect(mocks.updateUserMetadata).toHaveBeenCalledWith('user_owner', { publicMetadata: {
            creatorPlanId: 'free', stripeSubscriptionStatus: 'past_due',
        } });
    });
    it('does not write an old update when a replacement appears during Stripe lookup', async () => {
        user.publicMetadata = { stripeCustomerId: 'cus_owner', stripeSubscriptionId: 'sub_current' };
        mocks.constructEvent.mockReturnValue({ type: 'customer.subscription.updated', data: { object: subscription() } });
        mocks.subscriptionRetrieve.mockImplementationOnce(async () => {
            user = { ...user, publicMetadata: { ...user.publicMetadata, stripeSubscriptionId: 'sub_replacement', creatorPlanId: 'pro' } };
            return subscription({ status: 'past_due' });
        });
        expect(await (await webhook(eventRequest())).json()).toMatchObject({ matched: false });
        expect(mocks.updateUserMetadata).not.toHaveBeenCalled();
        expect(user.publicMetadata).toMatchObject({ stripeSubscriptionId: 'sub_replacement', creatorPlanId: 'pro' });
    });
    it('retries webhook processing on provider failure', async () => {
        mocks.constructEvent.mockReturnValue({ type: 'customer.subscription.updated', data: { object: subscription() } });
        mocks.getUser.mockRejectedValueOnce(new Error('Provider unavailable'));
        expect((await webhook(eventRequest())).status).toBe(500);
    });
    it('verifies subscription ownership before scheduling cancellation', async () => {
        user.publicMetadata = { stripeCustomerId: 'cus_other', stripeSubscriptionId: 'sub_current' };
        expect((await cancel()).status).toBe(403);
        expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
    });
    it('cannot replace an admin role with a billing product name', async () => {
        user.publicMetadata = { role: 'admin', stripeCustomerId: 'cus_owner', stripeSubscriptionId: 'sub_current' };
        expect(await updateRoleFromStripe('sub_current')).toMatchObject({ role: 'admin', planId: 'standard' });
        expect(user.publicMetadata.role).toBe('admin');
    });
    it('never redirects API/webhook requests to onboarding', async () => {
        const auth = vi.fn();
        const response = await middleware(auth, new Request('https://fit.example/api/user/subscription/webhook'));
        expect(response.status).toBe(200);
        expect(response.headers.get('location')).toBe(null);
        expect(auth).not.toHaveBeenCalled();
    });
    it('allows a Free account through dashboard middleware', async () => {
        const auth = vi.fn(async () => ({ userId: user.id, sessionClaims: { metadata: { onboardingComplete: true } } }));
        const response = await middleware(auth, new Request('https://fit.example/dashboard'));
        expect(response.status).toBe(200);
        expect(response.headers.get('location')).toBe(null);
    });
});
