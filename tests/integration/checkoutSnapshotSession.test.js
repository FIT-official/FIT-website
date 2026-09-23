import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
    auth: vi.fn(), customer: vi.fn(), user: vi.fn(), product: vi.fn(), request: vi.fn(),
    createSession: vi.fn(), expire: vi.fn(), saveSnapshot: vi.fn(), isAdmin: vi.fn(), preflight: vi.fn(),
}));
vi.mock('stripe', () => ({ default: class { checkout = { sessions: { create: m.createSession, expire: m.expire } }; } }));
vi.mock('@clerk/nextjs/server', () => ({ auth: m.auth, clerkClient: async () => ({ users: { getUser: m.customer } }) }));
vi.mock('@/lib/db', () => ({ connectToDatabase: async () => {} }));
vi.mock('@/lib/checkoutTransactionReadiness', async importOriginal => ({
    ...await importOriginal(), verifyCheckoutTransactions: m.preflight,
}));
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: m.isAdmin }));
vi.mock('@/models/User', () => ({ default: { findOne: m.user } }));
vi.mock('@/models/Product', () => ({ default: { findById: (...args) => ({ lean: () => m.product(...args) }), findOne: (...args) => ({ lean: () => m.product(...args) }) } }));
vi.mock('@/models/CustomPrintRequest', () => ({ default: { findOne: (...args) => ({ lean: () => m.request(...args) }) } }));
vi.mock('@/models/CheckoutSession', () => ({ default: { create: m.saveSnapshot } }));
import { POST } from '@/app/api/checkout/session/route';
import { CheckoutTransactionUnavailableError } from '@/lib/checkoutTransactionReadiness';

let user, product;
beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('STRIPE_SESSION_COMPLETE_SIGNING_SECRET', 'whsec_test');
    m.auth.mockResolvedValue({ userId: 'buyer' });
    m.isAdmin.mockResolvedValue(false);
    m.preflight.mockResolvedValue();
    m.customer.mockResolvedValue({ emailAddresses: [{ emailAddress: 'buyer@example.test' }], firstName: 'Buyer', publicMetadata: {} });
    user = { userId: 'buyer', contact: { address: { country: 'SG', street: 'Original street' } },
        cart: [{ _id: 'cart1', productId: 'p1', quantity: 2, chosenDeliveryType: 'shipping', selectedVariants: {}, price: .01 }], save: vi.fn() };
    product = { _id: 'p1', name: 'Product', slug: 'product', creatorUserId: 'creator', listing: 'fit',
        basePrice: { presentmentAmount: 10, presentmentCurrency: 'SGD' }, variantTypes: [],
        paidAssets: ['private/original.stl'], delivery: { deliveryTypes: [{ type: 'shipping', price: 5 }] } };
    m.user.mockImplementation(async () => user); m.product.mockImplementation(async () => product);
    m.createSession.mockResolvedValue({ id: 'cs_created', client_secret: 'secret_for_buyer' });
    m.saveSnapshot.mockResolvedValue({}); m.expire.mockResolvedValue({});
});
afterEach(() => vi.unstubAllEnvs());

describe('Checkout session purchase contract', () => {
    it.each(['', '   '])('does not create a payment when the checkout webhook verifier is missing (%j)', async secret => {
        vi.stubEnv('STRIPE_SESSION_COMPLETE_SIGNING_SECRET', secret);
        const response = await POST();
        expect(response.status).toBe(503);
        expect(await response.json()).toMatchObject({ code: 'checkout_webhook_not_configured' });
        expect(m.preflight).not.toHaveBeenCalled();
        expect(m.createSession).not.toHaveBeenCalled();
        expect(m.saveSnapshot).not.toHaveBeenCalled();
    });
    it('waits for the transaction preflight before creating a payable session', async () => {
        let finish;
        m.preflight.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const pending = POST();
        await vi.waitFor(() => expect(m.preflight).toHaveBeenCalledTimes(1));
        expect(m.createSession).not.toHaveBeenCalled();
        expect(m.saveSnapshot).not.toHaveBeenCalled();
        finish();
        expect((await pending).status).toBe(200);
        expect(m.preflight.mock.invocationCallOrder[0]).toBeLessThan(m.createSession.mock.invocationCallOrder[0]);
    });
    it('fails before a payment can be created when MongoDB transactions are unavailable', async () => {
        m.preflight.mockRejectedValueOnce(new CheckoutTransactionUnavailableError());
        const response = await POST();
        expect(response.status).toBe(503);
        expect(await response.json()).toMatchObject({ code: 'checkout_transaction_unavailable' });
        expect(m.createSession).not.toHaveBeenCalled();
        expect(m.expire).not.toHaveBeenCalled();
        expect(m.saveSnapshot).not.toHaveBeenCalled();
    });
    it('uses server prices and private asset references without calling the public product API', async () => {
        const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No public fetch allowed'));
        const res = await POST();
        expect(res.status).toBe(200); expect(fetch).not.toHaveBeenCalled(); fetch.mockRestore();
        expect(m.saveSnapshot).toHaveBeenCalledWith(expect.objectContaining({ snapshotVersion: 1, totalAmount: 2500,
            items: [expect.objectContaining({ unitAmount: 1000, quantity: 2, deliveryAmount: 500, totalAmount: 2500,
                paidAssets: ['private/original.stl'] })] }));
        expect(m.createSession.mock.calls[0][0].line_items.map(line => [line.price_data.unit_amount, line.quantity])).toEqual([[1000, 2], [500, 1]]);
        expect(user.save).not.toHaveBeenCalled(); expect(user.cart[0].price).toBe(.01);
    });
    it('does not let later cart, address or product edits mutate the saved contract', async () => {
        await POST(); const saved = m.saveSnapshot.mock.calls[0][0];
        user.cart[0].quantity = 99; user.contact.address.street = 'New street'; product.paidAssets.push('new-private-file');
        expect(saved.items[0].quantity).toBe(2); expect(saved.shippingAddress.street).toBe('Original street');
        expect(saved.items[0].paidAssets).toEqual(['private/original.stl']);
    });
    it('expires a Stripe session if saving its contract fails', async () => {
        m.saveSnapshot.mockRejectedValueOnce(new Error('Database unavailable'));
        expect((await POST()).status).toBe(500); expect(m.expire).toHaveBeenCalledWith('cs_created');
    });
    it('rejects an empty cart before creating a Stripe session', async () => {
        user.cart = []; expect((await POST()).status).toBe(400); expect(m.createSession).not.toHaveBeenCalled();
    });
    it.each([0, -1, 1.5, 101])('rejects invalid quantity %s', async quantity => {
        user.cart[0].quantity = quantity; expect((await POST()).status).toBe(400); expect(m.createSession).not.toHaveBeenCalled();
    });
    it('rejects hidden products held in an older cart', async () => {
        product.hidden = true; expect((await POST()).status).toBe(409); expect(m.createSession).not.toHaveBeenCalled();
    });
    it('does not collect platform money for an independent creator product', async () => {
        product.listing = 'creator';
        expect((await POST()).status).toBe(409); expect(m.createSession).not.toHaveBeenCalled();
    });
    it('recognises a legacy FIT product by its verified admin owner', async () => {
        delete product.listing; m.isAdmin.mockResolvedValue(true);
        expect((await POST()).status).toBe(200); expect(m.isAdmin).toHaveBeenCalledWith('creator');
    });
    it('rejects known insufficient stock before taking payment', async () => {
        product.stock = 1;
        expect((await POST()).status).toBe(409); expect(m.createSession).not.toHaveBeenCalled();
    });
    it('aggregates stock across multiple cart lines for the same product', async () => {
        product.stock = 3; user.cart.push({ ...user.cart[0], _id: 'cart2' });
        expect((await POST()).status).toBe(409); expect(m.createSession).not.toHaveBeenCalled();
    });
    it('rejects removed variants rather than undercharging the base price', async () => {
        user.cart[0].selectedVariants = { Size: 'Unlisted' };
        expect((await POST()).status).toBe(409); expect(m.createSession).not.toHaveBeenCalled();
    });
    it('rejects missing variant choices rather than bypassing their fees', async () => {
        product.variantTypes = [{ name: 'Size', options: [{ name: 'Large', additionalFee: 20 }] }];
        expect((await POST()).status).toBe(400); expect(m.createSession).not.toHaveBeenCalled();
    });
    it('does not pretend zero-price products have been fulfilled', async () => {
        product.basePrice.presentmentAmount = 0; product.delivery.deliveryTypes[0].price = 0;
        expect((await POST()).status).toBe(409); expect(m.createSession).not.toHaveBeenCalled(); expect(m.saveSnapshot).not.toHaveBeenCalled();
    });
    it('does not collect FIT payment for a creator-managed custom print job', async () => {
        user.cart[0] = { _id: 'cart1', productId: 'custom-print:req', quantity: 1, chosenDeliveryType: 'shipping' };
        m.request.mockResolvedValue({ requestId: 'req', userId: 'buyer', status: 'quoted', creatorUserId: 'independent-maker' });
        expect((await POST()).status).toBe(409); expect(m.createSession).not.toHaveBeenCalled();
    });
    it('uses a fixed custom quote only when it belongs to the customer and is payable', async () => {
        user.cart[0] = { _id: 'cart1', productId: 'custom-print:req', quantity: 1, chosenDeliveryType: 'shipping' };
        m.request.mockResolvedValue({ requestId: 'req', userId: 'buyer', status: 'quoted', basePrice: 20, printFee: 5,
            delivery: { deliveryTypes: [{ type: 'shipping', price: 5 }] }, modelFile: { s3Key: 'paid-model' } });
        expect((await POST()).status).toBe(200);
        expect(m.request).toHaveBeenCalledWith({ requestId: 'req', userId: 'buyer' });
        expect(m.saveSnapshot.mock.calls[0][0]).toMatchObject({ totalAmount: 3000,
            items: [{ requestId: 'req', customRequest: { modelFile: { s3Key: 'paid-model' } } }] });
    });
    it('rejects an already-paid custom request before charging it again', async () => {
        user.cart[0] = { _id: 'cart1', productId: 'custom-print:req', quantity: 1 };
        m.request.mockResolvedValue({ requestId: 'req', status: 'paid' });
        expect((await POST()).status).toBe(409); expect(m.createSession).not.toHaveBeenCalled();
    });
});
