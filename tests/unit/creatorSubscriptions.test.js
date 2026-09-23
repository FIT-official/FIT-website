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

import { CREATOR_PLANS, getCreatorPlan, getCreatorBillingPlan } from '@/lib/creatorPlans';
import { LEGACY_CREATOR_PLANS } from '@/lib/legacyCreatorPlans';
import { getCreatorEntitlements, getPlanForSubscription, getPlanForPriceId, isPriceValidForPlan } from '@/lib/creatorEntitlements';
import { requireCreator } from '@/lib/requireCreator';
import { requireFabricationPro } from '@/lib/fabrication/serverAccess';
import { POST as edit } from '@/app/api/user/subscription/edit/route';
import { POST as webhook } from '@/app/api/user/subscription/webhook/route';
import { POST as cancel } from '@/app/api/user/subscription/cancel/route';
import { GET as read } from '@/app/api/user/subscription/route';
import { GET as info } from '@/app/api/subscription/info/route';
import { updateRoleFromStripe } from '@/app/onboarding/_actions';
import middleware from '@/middleware';

let user;
const price = (id = 'price_standard', extra = {}) => ({
    id, active: true, unit_amount: { price_standard: 3900, price_pro: 9900, price_standard_yearly: 39000, price_pro_yearly: 99000 }[id],
    currency: 'sgd', recurring: { interval: id.endsWith('_yearly') ? 'year' : 'month', interval_count: 1, usage_type: 'licensed' },
    product: { active: true }, ...extra,
});
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
    vi.stubEnv('STRIPE_STANDARD_YEARLY_PRICE_ID', 'price_standard_yearly');
    vi.stubEnv('STRIPE_PRO_MONTHLY_PRICE_ID', 'price_pro');
    vi.stubEnv('STRIPE_PRO_YEARLY_PRICE_ID', 'price_pro_yearly');
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
            ['free', 0, 3, 10], ['student', 0, 10, 30], ['standard', 39, 50, 100], ['pro', 99, 5000, 500],
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
    it.each(LEGACY_CREATOR_PLANS)('preserves the existing $name plan without making its price available for new sales', plan => {
        const legacyPrice = price(plan.priceId, { unit_amount: plan.amount * 100 });
        expect(getPlanForSubscription(subscription({ items: { data: [{ quantity: 1, price: legacyPrice }] } }))).toMatchObject({
            id: 'legacy', legacy: true, name: plan.name, amount: plan.amount, limits: { products: null, monthlyPrintRequests: null },
        });
        expect(getPlanForPriceId(plan.priceId)).toBe(null);
    });
    it.each(['past_due', 'unpaid', 'paused', 'incomplete', 'incomplete_expired', 'canceled'])('does not preserve legacy paid capacity for %s', status => {
        const plan = LEGACY_CREATOR_PLANS[0];
        const legacyPrice = price(plan.priceId, { unit_amount: plan.amount * 100 });
        expect(getPlanForSubscription(subscription({ status, items: { data: [{ quantity: 1, price: legacyPrice }] } })).id).toBe('free');
    });
    it('preserves a verified legacy trial with an archived price and scheduled cancellation', () => {
        const plan = LEGACY_CREATOR_PLANS[0];
        expect(getPlanForSubscription(subscription({ status: 'trialing', cancel_at_period_end: true,
            items: { data: [{ quantity: 1, price: price(plan.priceId, { unit_amount: 2400, active: false }) }] },
        })).id).toBe('legacy');
    });
    it.each([
        { unit_amount: 2300 }, { currency: 'usd' },
        { recurring: { interval: 'year', interval_count: 1, usage_type: 'licensed' } },
        { recurring: { interval: 'month', interval_count: 1, usage_type: 'metered' } },
    ])('rejects a legacy ID with unverified price terms %j', extra => {
        const legacyPrice = price(LEGACY_CREATOR_PLANS[0].priceId, { unit_amount: 2400, ...extra });
        expect(getPlanForSubscription(subscription({ items: { data: [{ quantity: 1, price: legacyPrice }] } })).id).toBe('free');
    });
    it('verifies legacy ownership live even when all new-sale prices are unset', async () => {
        for (const name of ['STRIPE_STANDARD_MONTHLY_PRICE_ID', 'STRIPE_STANDARD_YEARLY_PRICE_ID', 'STRIPE_PRO_MONTHLY_PRICE_ID', 'STRIPE_PRO_YEARLY_PRICE_ID']) vi.stubEnv(name, '');
        user.publicMetadata = { stripeCustomerId: 'cus_owner', stripeSubscriptionId: 'sub_current' };
        mocks.subscriptionRetrieve.mockResolvedValue(subscription({ items: { data: [{ quantity: 1,
            price: price(LEGACY_CREATOR_PLANS[0].priceId, { unit_amount: 2400 }) }] } }));
        expect(await getCreatorEntitlements(user.id)).toMatchObject({ planId: 'legacy', status: 'active', isAdmin: false });
        user.publicMetadata.stripeCustomerId = 'cus_other';
        expect(await getCreatorEntitlements(user.id)).toMatchObject({ planId: 'free', subscription: null });
    });
    it('does not grant new Pro fabrication access to a legacy paid subscription', async () => {
        user.publicMetadata = { stripeCustomerId: 'cus_owner', stripeSubscriptionId: 'sub_current' };
        mocks.subscriptionRetrieve.mockResolvedValue(subscription({ items: { data: [{ quantity: 1,
            price: price(LEGACY_CREATOR_PLANS[0].priceId, { unit_amount: 2400 }) }] } }));
        await expect(requireFabricationPro(user.id)).rejects.toMatchObject({ status: 403, code: 'pro_required' });
    });
    it.each(['standard', 'pro'])('recognises %s annual billing with unchanged monthly quotas', planId => {
        const selected = price(`price_${planId}_yearly`);
        const result = getPlanForSubscription(subscription({ items: { data: [{ quantity: 1, price: selected }] } }));
        expect(result).toMatchObject({ id: planId, interval: 'year', amount: planId === 'standard' ? 390 : 990 });
        expect(result.limits).toEqual(getCreatorPlan(planId).limits);
    });
    it('rejects duplicate price IDs across monthly and annual mappings', () => {
        vi.stubEnv('STRIPE_STANDARD_YEARLY_PRICE_ID', 'price_standard');
        expect(getPlanForPriceId('price_standard')).toBe(null);
        expect(getPlanForSubscription(subscription()).id).toBe('free');
    });
    it.each([
        { unit_amount: 3900 }, { unit_amount: 46800 }, { currency: 'usd' },
        { recurring: { interval: 'month', interval_count: 12, usage_type: 'licensed' } },
        { recurring: { interval: 'year', interval_count: 2, usage_type: 'licensed' } },
        { recurring: { interval: 'year', interval_count: 1, usage_type: 'metered' } },
        { recurring: { interval: 'year', interval_count: 1 } },
        { recurring: { interval: 'year', usage_type: 'licensed' } },
        { transform_quantity: { divide_by: 10, round: 'down' } },
    ])('rejects annual price terms that do not match the published plan: %j', extra => {
        const selected = price('price_standard_yearly', extra);
        expect(isPriceValidForPlan(selected, getCreatorBillingPlan('standard', 'year'))).toBe(false);
        expect(getPlanForSubscription(subscription({ items: { data: [{ quantity: 1, price: selected }] } })).id).toBe('free');
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
    it('rejects creation of a legacy subscription before any payment mutation', async () => {
        expect((await edit(request({ priceId: LEGACY_CREATOR_PLANS[0].priceId, cardToken: 'tok_valid' }))).status).toBe(400);
        expect(mocks.pricesRetrieve).not.toHaveBeenCalled();
        expect(mocks.paymentCreate).not.toHaveBeenCalled();
        expect(mocks.subscriptionCreate).not.toHaveBeenCalled();
    });
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
    it.each([
        ['price_standard', 'price_standard_yearly', 'year'],
        ['price_standard_yearly', 'price_standard', 'month'],
        ['price_pro', 'price_pro_yearly', 'year'],
    ])('switches the same tier from %s to %s', async (currentPrice, nextPrice, interval) => {
        user.publicMetadata = { stripeCustomerId: 'cus_owner', stripeSubscriptionId: 'sub_current' };
        mocks.subscriptionRetrieve.mockResolvedValue(subscription({ items: { data: [{ id: 'si_current', price: price(currentPrice) }] } }));
        mocks.pricesRetrieve.mockResolvedValue(price(nextPrice));
        mocks.subscriptionUpdate.mockResolvedValue(subscription({ items: { data: [{ id: 'si_current', price: price(nextPrice) }] } }));
        const response = await edit(request({ priceId: nextPrice, cardToken: 'tok_valid' }));
        expect(await response.json()).toMatchObject({ success: true, interval, priceId: nextPrice, pending_update: false });
        expect(mocks.subscriptionUpdate).toHaveBeenCalledWith('sub_current', {
            items: [{ id: 'si_current', price: nextPrice, quantity: 1 }],
            proration_behavior: 'always_invoice', payment_behavior: 'pending_if_incomplete', expand: ['latest_invoice.payment_intent'],
        }, { idempotencyKey: 'fit-plan:user_owner:tok_valid' });
        expect(mocks.subscriptionCreate).not.toHaveBeenCalled();
    });
    it('reuses the preview proration time for a Standard to Pro upgrade', async () => {
        user.publicMetadata = { stripeCustomerId: 'cus_owner', stripeSubscriptionId: 'sub_current' };
        mocks.pricesRetrieve.mockResolvedValue(price('price_pro'));
        mocks.subscriptionUpdate.mockResolvedValue(subscription({ items: { data: [{ id: 'si_current', price: price('price_pro') }] } }));
        const prorationDate = Math.floor(Date.now() / 1000) - 10;
        expect((await edit(request({ priceId: 'price_pro', cardToken: 'tok_valid', prorationDate }))).status).toBe(200);
        expect(mocks.subscriptionUpdate).toHaveBeenCalledWith('sub_current', expect.objectContaining({ proration_date: prorationDate,
            proration_behavior: 'always_invoice', payment_behavior: 'pending_if_incomplete' }), expect.anything());
        mocks.subscriptionUpdate.mockClear();
        expect((await edit(request({ priceId: 'price_pro', cardToken: 'tok_valid', prorationDate: prorationDate - 600 }))).status).toBe(409);
        expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
    });
    it('does not confirm an interval switch when Stripe still returns the previous price', async () => {
        user.publicMetadata = { stripeCustomerId: 'cus_owner', stripeSubscriptionId: 'sub_current' };
        mocks.pricesRetrieve.mockResolvedValue(price('price_standard_yearly'));
        expect(await (await edit(request({ priceId: 'price_standard_yearly', cardToken: 'tok_valid' }))).json()).toMatchObject({
            success: false, planId: 'standard', interval: 'month', priceId: 'price_standard',
        });
    });
    it('keeps monthly entitlements while an annual payment awaits authentication and safely resumes it', async () => {
        user.publicMetadata = { stripeCustomerId: 'cus_owner', stripeSubscriptionId: 'sub_current' };
        mocks.pricesRetrieve.mockResolvedValue(price('price_standard_yearly'));
        mocks.subscriptionRetrieve.mockResolvedValue(subscription({ pending_update: { subscription_items: [{ price: 'price_standard_yearly' }] },
            latest_invoice: { payment_intent: { status: 'requires_action', client_secret: 'annual_owner_secret' } } }));
        expect(await (await edit(request({ priceId: 'price_standard_yearly' }))).json()).toMatchObject({
            success: false, planId: 'standard', interval: 'month', pending_update: true, requires_action: true, clientSecret: 'annual_owner_secret',
        });
        expect(mocks.paymentCreate).not.toHaveBeenCalled();
        expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
        expect(mocks.subscriptionCreate).not.toHaveBeenCalled();
    });
    it('blocks another interval selection until a pending annual payment is resolved', async () => {
        user.publicMetadata = { stripeCustomerId: 'cus_owner', stripeSubscriptionId: 'sub_current' };
        mocks.subscriptionRetrieve.mockResolvedValue(subscription({ pending_update: { subscription_items: [{ price: 'price_standard_yearly' }] } }));
        expect((await edit(request())).status).toBe(409);
        expect(mocks.paymentCreate).not.toHaveBeenCalled();
        expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
    });
    it('treats an exact paid annual selection as a no-op without requiring a new card', async () => {
        user.publicMetadata = { stripeCustomerId: 'cus_owner', stripeSubscriptionId: 'sub_current' };
        mocks.pricesRetrieve.mockResolvedValue(price('price_standard_yearly'));
        mocks.subscriptionRetrieve.mockResolvedValue(subscription({ items: { data: [{ id: 'si_current', price: price('price_standard_yearly') }] } }));
        expect(await (await edit(request({ priceId: 'price_standard_yearly' }))).json()).toMatchObject({ success: true, interval: 'year', priceId: 'price_standard_yearly' });
        expect(mocks.paymentCreate).not.toHaveBeenCalled();
        expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
    });
    it('creates annual subscriptions with the existing duplicate-submission protection', async () => {
        mocks.pricesRetrieve.mockResolvedValue(price('price_pro_yearly'));
        mocks.subscriptionCreate.mockResolvedValue(subscription({ items: { data: [{ id: 'si_current', price: price('price_pro_yearly') }] } }));
        expect(await (await edit(request({ priceId: 'price_pro_yearly', cardToken: 'tok_valid' }))).json()).toMatchObject({ success: true, planId: 'pro', interval: 'year' });
        expect(mocks.subscriptionCreate).toHaveBeenCalledWith(expect.objectContaining({ items: [{ price: 'price_pro_yearly', quantity: 1 }] }),
            { idempotencyKey: 'fit-subscription:user_owner:cus_owner:first' });
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
    it('returns annual billing information and monthly usage limits', async () => {
        user.publicMetadata = { stripeCustomerId: 'cus_owner', stripeSubscriptionId: 'sub_current' };
        mocks.pricesRetrieve.mockResolvedValue(price('price_standard_yearly'));
        mocks.subscriptionRetrieve.mockResolvedValue(subscription({ items: { data: [{ price: price('price_standard_yearly') }] } }));
        expect(await (await info(new Request('https://fit.example/api/subscription/info?priceId=price_standard_yearly'))).json()).toMatchObject({
            planId: 'standard', price: '390.00', interval: 'year', monthlyEquivalent: 32.5, annualSavings: 78,
            limits: { products: 50, monthlyPrintRequests: 100 },
        });
        expect(await (await read()).json()).toMatchObject({
            planId: 'standard', price: 39000, priceId: 'price_standard_yearly', interval: 'year', monthlyEquivalent: 32.5, annualSavings: 78,
            limits: { products: 50, monthlyPrintRequests: 100 },
        });
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
    it('keeps annual Pro allowances until the paid year ends after cancellation is scheduled', async () => {
        user.publicMetadata = { stripeCustomerId: 'cus_owner', stripeSubscriptionId: 'sub_current' };
        const annual = subscription({ current_period_end: 1821657600, items: { data: [{ quantity: 1, price: price('price_pro_yearly') }] } });
        mocks.subscriptionRetrieve.mockResolvedValue(annual);
        mocks.subscriptionUpdate.mockResolvedValue({ ...annual, cancel_at_period_end: true });
        expect(await (await cancel()).json()).toMatchObject({ success: true, cancel_at_period_end: true, current_period_end: 1821657600 });
        expect(mocks.subscriptionUpdate).toHaveBeenCalledWith('sub_current', { cancel_at_period_end: true });
        mocks.subscriptionRetrieve.mockResolvedValue({ ...annual, cancel_at_period_end: true });
        expect(await getCreatorEntitlements(user.id)).toMatchObject({ planId: 'pro', status: 'active',
            plan: { interval: 'year', limits: { products: 5000, monthlyPrintRequests: 500 } } });
        mocks.subscriptionRetrieve.mockResolvedValue({ ...annual, status: 'canceled' });
        expect(await getCreatorEntitlements(user.id)).toMatchObject({ planId: 'free' });
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
