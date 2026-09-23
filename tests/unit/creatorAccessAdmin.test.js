// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(), getUser: vi.fn(), getUserList: vi.fn(), updateUserMetadata: vi.fn(),
    retrieveSubscription: vi.fn(), retrievePrice: vi.fn(), createPreview: vi.fn(),
}));
vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth, clerkClient: async () => ({ users: {
    getUser: mocks.getUser, getUserList: mocks.getUserList, updateUserMetadata: mocks.updateUserMetadata,
} }) }));
vi.mock('stripe', () => ({ default: class Stripe {
    subscriptions = { retrieve: mocks.retrieveSubscription };
    prices = { retrieve: mocks.retrievePrice };
    invoices = { createPreview: mocks.createPreview };
} }));

import { GET as list, POST as update } from '@/app/api/admin/creator-subscriptions/route';
import { GET as preview } from '@/app/api/user/subscription/preview/route';
import { getCreatorEntitlements } from '@/lib/creatorEntitlements';

const admin = { id: 'user_admin', publicMetadata: { role: 'admin' } };
let target;
const post = body => new Request('https://fit.example/api/admin/creator-subscriptions', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: target.id, ...body }),
});
const future = '2027-12-31T23:59:59.000Z';

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_unit');
    vi.stubEnv('STRIPE_PRO_MONTHLY_PRICE_ID', 'price_pro');
    target = { id: 'user_creator', firstName: 'Ari', lastName: 'Tan', emailAddresses: [{ emailAddress: 'ari@example.test' }], publicMetadata: {}, privateMetadata: {} };
    mocks.auth.mockResolvedValue({ userId: admin.id });
    mocks.getUser.mockImplementation(async id => id === admin.id ? admin : target);
    mocks.getUserList.mockImplementation(async () => ({ data: [target], totalCount: 1 }));
    mocks.updateUserMetadata.mockImplementation(async (_id, data) => {
        target.privateMetadata = { ...target.privateMetadata, creatorAccess: { ...(target.privateMetadata.creatorAccess || {}), ...data.privateMetadata.creatorAccess } };
        return target;
    });
    mocks.retrievePrice.mockResolvedValue({ id: 'price_pro', active: true, currency: 'sgd', unit_amount: 9900,
        recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' }, product: { active: true } });
    mocks.retrieveSubscription.mockResolvedValue({ id: 'sub_current', customer: 'cus_creator', status: 'active', metadata: { clerkUserId: target.id },
        items: { data: [{ id: 'si_current', quantity: 1, price: { id: 'price_standard', active: true, currency: 'sgd', unit_amount: 3900,
            recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } } }] } });
});

describe('owner-managed creator access', () => {
    it('grants free Standard with expiry and applies individual quotas', async () => {
        const grant = await update(post({ action: 'grant', planId: 'standard', expiresAt: future }));
        expect(grant.status).toBe(200);
        expect((await grant.json()).row).toMatchObject({ planId: 'standard', source: 'complimentary', limits: { products: 50, monthlyPrintRequests: 100 } });
        expect(target.privateMetadata.creatorAccess.grant.expiresAt).toBe(future);
        const quota = await update(post({ action: 'quota', quota: { products: 75, monthlyPrintRequests: 120 } }));
        expect((await quota.json()).row.limits).toEqual({ products: 75, monthlyPrintRequests: 120 });
        expect((await getCreatorEntitlements(target.id)).plan.limits).toEqual({ products: 75, monthlyPrintRequests: 120 });
        expect((await (await list(new Request('https://fit.example/api/admin/creator-subscriptions'))).json()).rows[0].email).toBe('ari@example.test');
    });
    it('expires a grant automatically and permits extending it', async () => {
        target.privateMetadata.creatorAccess = { grant: { planId: 'pro', expiresAt: '2020-01-01T00:00:00.000Z' } };
        expect((await getCreatorEntitlements(target.id)).planId).toBe('free');
        const response = await update(post({ action: 'extend', expiresAt: future }));
        expect((await response.json()).row).toMatchObject({ planId: 'pro', source: 'complimentary', limits: { products: 5000 } });
        expect((await update(post({ action: 'extend', expiresAt: '2027-01-01T00:00:00.000Z' }))).status).toBe(400);
    });
    it('does not grant free access while Stripe billing is open', async () => {
        target.publicMetadata = { stripeCustomerId: 'cus_creator', stripeSubscriptionId: 'sub_current' };
        const response = await update(post({ action: 'grant', planId: 'pro', expiresAt: future }));
        expect(response.status).toBe(409);
        expect(mocks.updateUserMetadata).not.toHaveBeenCalled();
    });
    it('keeps the owner route private', async () => {
        mocks.auth.mockResolvedValue({ userId: target.id });
        expect((await list(new Request('https://fit.example/api/admin/creator-subscriptions'))).status).toBe(403);
        expect((await update(post({ action: 'grant', planId: 'pro', expiresAt: future }))).status).toBe(403);
    });
    it('previews the exact paid switch and rejects another customer', async () => {
        target.publicMetadata = { stripeCustomerId: 'cus_creator', stripeSubscriptionId: 'sub_current' };
        mocks.auth.mockResolvedValue({ userId: target.id });
        mocks.createPreview.mockResolvedValue({ amount_due: 2300, currency: 'sgd' });
        const response = await preview(new Request('https://fit.example/api/user/subscription/preview?priceId=price_pro'));
        expect(await response.json()).toMatchObject({ amountDue: 2300, currency: 'SGD', priceId: 'price_pro' });
        expect(mocks.createPreview).toHaveBeenCalledWith(expect.objectContaining({
            subscription: 'sub_current', subscription_details: expect.objectContaining({
                items: [{ id: 'si_current', price: 'price_pro', quantity: 1 }], proration_behavior: 'always_invoice',
            }),
        }));
        target.publicMetadata.stripeCustomerId = 'cus_someone_else';
        expect((await preview(new Request('https://fit.example/api/user/subscription/preview?priceId=price_pro'))).status).toBe(403);
    });
});
