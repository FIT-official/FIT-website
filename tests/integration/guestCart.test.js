import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), upsert: vi.fn(), product: vi.fn(), db: vi.fn(), attempts: new Map(), snapshots: [], create: vi.fn(), retrieve: vi.fn() }));
vi.mock('@clerk/nextjs/server', () => ({ auth: m.auth }));
vi.mock('@/lib/db', () => ({ connectToDatabase: m.db }));
vi.mock('@/models/User', () => ({ default: { findOne: m.find, findOneAndUpdate: m.upsert } }));
vi.mock('@/models/Product', () => ({ default: { findById: () => ({ lean: m.product }) } }));
vi.mock('stripe', () => ({ default: class { checkout = { sessions: { create: m.create, retrieve: m.retrieve } }; } }));
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: async () => false }));
vi.mock('@/lib/checkoutTransactionReadiness', () => ({ verifyCheckoutTransactions: async () => {}, CheckoutTransactionUnavailableError: class extends Error {} }));
vi.mock('@/models/CheckoutAttempt', () => ({ default: {
    findById: async id => m.attempts.get(id),
    findOneAndUpdate: async ({ _id }, update) => {
        if (!m.attempts.has(_id)) m.attempts.set(_id, { _id, ...update.$setOnInsert, createdAt: new Date() });
        return m.attempts.get(_id);
    },
    updateOne: async ({ _id }, update) => Object.assign(m.attempts.get(_id), update.$set),
} }));
vi.mock('@/models/CheckoutSession', () => ({ default: {
    find: () => ({ limit: async () => [] }),
    updateOne: async (_filter, update) => { m.snapshots.push(update.$setOnInsert); },
} }));
import { GET, POST, DELETE } from '@/app/api/user/cart/route';
import { PUT } from '@/app/api/user/cart/contact/route';
import { POST as createGuestCheckout } from '@/app/api/checkout/session/route';

const productId = '000000000000000000000001';
let users;
function request(method = 'GET', body, cookie = '') {
    return new Request('https://fit.example/api/user/cart', { method,
        headers: { cookie, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
beforeEach(() => {
    vi.clearAllMocks(); users = new Map(); m.auth.mockResolvedValue({ userId: null });
    m.attempts.clear(); m.snapshots = [];
    m.create.mockResolvedValue({ id: 'cs_guest', status: 'open', payment_status: 'unpaid', client_secret: 'guest_secret' });
    m.retrieve.mockResolvedValue({ id: 'cs_guest', status: 'open', payment_status: 'unpaid', client_secret: 'guest_secret' });
    m.db.mockResolvedValue();
    m.find.mockImplementation(async ({ userId }) => users.get(userId));
    m.upsert.mockImplementation(async ({ userId }) => {
        if (!users.has(userId)) users.set(userId, { userId, checkoutIntent: '00000000-0000-4000-8000-000000000001', cart: [], save: vi.fn() });
        return users.get(userId);
    });
    m.product.mockResolvedValue({ productType: 'shop', listing: 'fit', delivery: { deliveryTypes: [{ type: 'shipping' }] } });
});
describe('Mongo guest cart', () => {
    it.each([null, 'account_buyer'])('rejects a quote-only item for buyer %s before saving the cart', async (userId) => {
        m.auth.mockResolvedValue({ userId });
        if (userId) users.set(userId, { userId, cart: [], save: vi.fn() });
        m.product.mockResolvedValue({ productType: 'shop', listing: 'fit', quoteOnly: true });
        const response = await POST(request('POST', { cartItem: { productId, quantity: 1, chosenDeliveryType: 'shipping' } }));
        expect(response.status).toBe(409);
        expect((await response.json()).error).toMatch(/confirm the price/);
        for (const owner of users.values()) expect(owner.save).not.toHaveBeenCalled();
    });
    it('runs guest add, schema-valid contact save, cart reload and Stripe session recovery end to end', async () => {
        const first = await GET(request());
        const cookie = first.headers.get('set-cookie').split(';')[0];
        expect(await first.json()).toMatchObject({ guest: true, contactReady: false });
        m.product.mockResolvedValue({ _id: productId, slug: '1kg-pla-3d-printing-filament-lanbo', name: 'Lanbo PLA',
            productType: 'shop', listing: 'fit', creatorUserId: 'fit_seller', infiniteStock: true, variantTypes: [],
            basePrice: { presentmentAmount: 14.9, presentmentCurrency: 'SGD' }, delivery: { deliveryTypes: [{ type: 'shipping', price: 5 }] } });
        expect((await POST(request('POST', { cartItem: { productId, quantity: 1, chosenDeliveryType: 'shipping' } }, cookie))).status).toBe(200);
        // Real Mongoose casting and validation catch differences hidden by API mocks.
        const { default: MongoUser } = await vi.importActual('@/models/User');
        const owner = [...users.values()][0];
        const doc = new MongoUser({ userId: owner.userId, checkoutIntent: owner.checkoutIntent, cart: owner.cart });
        doc.save = vi.fn(async () => { await doc.validate(); });
        users.set(owner.userId, doc);
        const contact = await PUT(request('PUT', { name: 'Guest Buyer', email: 'guest@example.test', address: {
            street: '1 Example Road', city: 'Singapore', state: 'Singapore', country: 'SG', postalCode: '123456', unitNumber: '' } }, cookie));
        expect(contact.status).toBe(200);
        expect(doc.guestContact.address.street).toBe('1 Example Road');
        const ready = await (await GET(request('GET', null, cookie))).json();
        expect(ready).toMatchObject({ contactReady: true, checkoutAttemptId: owner.checkoutIntent });
        vi.stubEnv('STRIPE_SESSION_COMPLETE_SIGNING_SECRET', 'whsec_test');
        try {
            const firstCheckout = await createGuestCheckout(new Request('https://fit.example/api/checkout/session', { method: 'POST', headers: { cookie, 'X-Checkout-Attempt': ready.checkoutAttemptId } }));
            expect(firstCheckout.status).toBe(200);
            expect(await firstCheckout.json()).toMatchObject({ clientSecret: 'guest_secret', sessionId: 'cs_guest', cartBreakdown: [{ price: 14.9, deliveryFee: 5 }] });
            expect(m.snapshots[0]).toMatchObject({ totalAmount: 1990, customerEmail: 'guest@example.test', shippingAddress: { street: '1 Example Road' } });
            await createGuestCheckout(new Request('https://fit.example/api/checkout/session', { method: 'POST', headers: { cookie, 'X-Checkout-Attempt': ready.checkoutAttemptId } }));
            expect(m.create).toHaveBeenCalledTimes(1);
        } finally { vi.unstubAllEnvs(); }
    });
    it('creates an opaque HttpOnly cookie, persists filament and isolates another guest', async () => {
        const first = await GET(request());
        const cookie = first.headers.get('set-cookie').split(';')[0];
        expect(first.headers.get('set-cookie')).toMatch(/HttpOnly/i);
        expect(first.headers.get('set-cookie')).toMatch(/SameSite=lax/i);
        expect(cookie.split('=')[1]).toMatch(/^[a-f0-9]{64}$/);
        const added = await POST(request('POST', { cartItem: { productId, quantity: 1, chosenDeliveryType: 'shipping' } }, cookie));
        expect(added.status).toBe(200);
        expect((await (await GET(request('GET', null, cookie))).json()).cart).toHaveLength(1);
        expect((await (await GET(request())).json()).cart).toEqual([]);
        const removed = await DELETE(request('DELETE', { productId, selectedVariants: {} }, cookie));
        expect((await removed.json()).cart).toEqual([]);
    });
    it('saves guest contact details without a Clerk account', async () => {
        const cart = await GET(request()); const cookie = cart.headers.get('set-cookie').split(';')[0];
        const response = await PUT(request('PUT', { name: 'Buyer', email: 'buyer@example.test', address: {
            street: '1 Example Road', city: 'Singapore', state: 'Singapore', country: 'SG', postalCode: '123456' } }, cookie));
        expect(response.status).toBe(200);
        expect([...users.values()][0].guestContact.email).toBe('buyer@example.test');
    });
    it('preserves the signed-in cart even when a guest cookie is supplied', async () => {
        m.auth.mockResolvedValue({ userId: 'account_buyer' });
        users.set('account_buyer', { checkoutIntent: '00000000-0000-4000-8000-000000000001', cart: [{ productId }], save: vi.fn() });
        const response = await GET(request('GET', null, `fit_guest_cart=${'a'.repeat(64)}`));
        expect(await response.json()).toMatchObject({ guest: false, cart: [{ productId }] });
        expect(m.upsert).not.toHaveBeenCalled();
    });
    it('does not turn an auth service failure into a different guest cart', async () => {
        m.auth.mockRejectedValue(new Error('Clerk unavailable'));
        expect((await GET(request())).status).toBeGreaterThanOrEqual(500);
        expect(m.upsert).not.toHaveBeenCalled();
    });
});
