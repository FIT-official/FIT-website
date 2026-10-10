import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
    assign: vi.fn(), updateOwner: vi.fn(), auth: vi.fn(), customer: vi.fn(), user: vi.fn(), product: vi.fn(), request: vi.fn(),
    legacy: [], events: [], fulfilled: vi.fn(), attempts: new Map(), retrieve: vi.fn(), createSession: vi.fn(), expire: vi.fn(), saveSnapshot: vi.fn(), isAdmin: vi.fn(), preflight: vi.fn(),
}));
vi.mock('stripe', () => ({ default: class { checkout = { sessions: { create: m.createSession, retrieve: m.retrieve, expire: m.expire } }; } }));
vi.mock('@clerk/nextjs/server', () => ({ auth: m.auth, clerkClient: async () => ({ users: { getUser: m.customer } }) }));
vi.mock('@/lib/db', () => ({ connectToDatabase: async () => {} }));
vi.mock('@/lib/checkoutTransactionReadiness', async importOriginal => ({
    ...await importOriginal(), verifyCheckoutTransactions: m.preflight,
}));
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: m.isAdmin }));
vi.mock('@/models/User', () => ({ default: { findOne: m.user, findOneAndUpdate: m.assign, updateOne: m.updateOwner } }));
vi.mock('@/models/Product', () => ({ default: { findById: (...args) => ({ select: () => ({ lean: () => m.product(...args) }) }), findOne: (...args) => ({ lean: () => m.product(...args) }) } }));
vi.mock('@/models/Event', () => ({ default: { find: () => ({ lean: async () => m.events }) } }));
vi.mock('@/models/CustomPrintRequest', () => ({ default: { findOne: (...args) => ({ lean: () => m.request(...args) }) } }));
vi.mock('@/models/CheckoutSession', () => ({ default: {
    find: () => ({ limit: async () => m.legacy }), findOne: m.fulfilled,
    updateOne: (_filter, update) => m.saveSnapshot(update.$setOnInsert),
} }));
vi.mock('@/models/CheckoutAttempt', () => ({ default: {
    findById: async id => m.attempts.get(id) || null,
    findOneAndUpdate: async ({ _id }, update) => {
        if (!m.attempts.has(_id)) m.attempts.set(_id, structuredClone({ _id, ...update.$setOnInsert, createdAt: new Date() }));
        return m.attempts.get(_id);
    },
    updateOne: async ({ _id }, update) => { Object.assign(m.attempts.get(_id), update.$set); },
} }));
import { POST, DELETE } from '@/app/api/checkout/session/route';
import { GET as getBreakdown } from '@/app/api/checkout/breakdown/route';
import { CheckoutTransactionUnavailableError } from '@/lib/checkoutTransactionReadiness';

let user, product;
beforeEach(() => {
    vi.clearAllMocks();
    m.attempts.clear(); m.legacy = []; m.events = []; m.fulfilled.mockResolvedValue(null);
    vi.stubEnv('STRIPE_SESSION_COMPLETE_SIGNING_SECRET', 'whsec_test');
    m.auth.mockResolvedValue({ userId: 'buyer' });
    m.isAdmin.mockResolvedValue(false);
    m.preflight.mockResolvedValue();
    m.assign.mockImplementation(async (_filter, update) => {
        if (user.checkoutIntent) return null;
        Object.assign(user, update.$set); return user;
    });
    m.updateOwner.mockResolvedValue({ matchedCount: 1 });
    m.customer.mockResolvedValue({ emailAddresses: [{ emailAddress: 'buyer@example.test' }], firstName: 'Buyer', publicMetadata: {} });
    user = { userId: 'buyer', checkoutIntent: '00000000-0000-4000-8000-000000000001', contact: { address: { country: 'SG', street: 'Original street', city: 'Singapore', postalCode: '123456' } },
        cart: [{ _id: 'cart1', productId: 'p1', quantity: 2, chosenDeliveryType: 'shipping', selectedVariants: {}, price: .01 }], save: vi.fn() };
    product = { _id: 'p1', name: 'Product', slug: 'product', creatorUserId: 'creator', listing: 'fit',
        basePrice: { presentmentAmount: 10, presentmentCurrency: 'SGD' }, variantTypes: [],
        paidAssets: ['private/original.stl'], delivery: { deliveryTypes: [{ type: 'shipping', price: 5 }] } };
    m.user.mockImplementation(async () => user); m.product.mockImplementation(async () => product);
    m.createSession.mockResolvedValue({ id: 'cs_created', status: 'open', payment_status: 'unpaid', client_secret: 'secret_for_buyer' });
    m.retrieve.mockResolvedValue({ id: 'cs_created', status: 'open', payment_status: 'unpaid', client_secret: 'secret_for_buyer' });
    m.saveSnapshot.mockResolvedValue({}); m.expire.mockResolvedValue({});
});
afterEach(() => vi.unstubAllEnvs());

describe('Checkout session purchase contract', () => {
    it.each([
        [null, 0, 3000], ['hcsr04-ultrasonic-sensor', 200, 3365],
        ['bambu-lab-3d-printing-filament-1kg-pla-basic', 620, 5810],
    ])('keeps a repair service outside the parcel in breakdown and Stripe with %s', async (goodsSlug, deliveryAmount, totalAmount) => {
        Object.assign(product, { productType: 'shop', slug: '3d-printer-repair-maintenance', paidAssets: [],
            basePrice: { presentmentAmount: 30, presentmentCurrency: 'SGD' },
            delivery: { deliveryTypes: [{ type: 'pick-up', price: 0 }] } });
        user.cart = [{ _id: 'repair', productId: 'p1', quantity: 1, chosenDeliveryType: 'pick-up', selectedVariants: {} }];
        if (goodsSlug) {
            const goods = { ...product, _id: 'p2', slug: goodsSlug,
                basePrice: { presentmentAmount: goodsSlug === 'hcsr04-ultrasonic-sensor' ? 1.65 : 21.9, presentmentCurrency: 'SGD' },
                delivery: { deliveryTypes: [{ type: 'standard-shipping', price: 6.2 }] } };
            m.product.mockImplementation(async id => id === 'p2' ? goods : product);
            user.cart.push({ _id: 'goods', productId: 'p2', quantity: 1, chosenDeliveryType: 'standard-shipping', selectedVariants: {} });
        }
        const { cartBreakdown } = await (await getBreakdown()).json();
        expect(cartBreakdown.map(item => item.deliveryFee)).toEqual(goodsSlug ? [0, deliveryAmount / 100] : [0]);
        expect(cartBreakdown[0].standardShipping).toBeUndefined();
        expect((await POST()).status).toBe(200);
        expect(m.saveSnapshot.mock.calls[0][0].totalAmount).toBe(totalAmount);
        expect(m.saveSnapshot.mock.calls[0][0].items.map(item => item.deliveryAmount)).toEqual(goodsSlug ? [0, deliveryAmount] : [0]);
        expect(m.createSession.mock.calls[0][0].line_items.reduce((sum, item) => sum + item.price_data.unit_amount * item.quantity, 0)).toBe(totalAmount);
    });
    it.each([[205, 200, 620], [205.01, 200.01, 620]])('keeps delivery paid across the former S$200 boundary after a S$5 discount on %s in breakdown and Stripe', async (base, price, deliveryAmount) => {
        Object.assign(product, { productType: 'shop', slug: 'hcsr04-ultrasonic-sensor', paidAssets: [],
            basePrice: { presentmentAmount: base, presentmentCurrency: 'SGD' },
            discounts: [{ percentage: 5 / base * 100 }],
            delivery: { deliveryTypes: [{ type: 'standard-shipping', price: 999 }] } });
        Object.assign(user.cart[0], { quantity: 1, chosenDeliveryType: 'standard-shipping', price: 9999, deliveryFee: 0, freeDeliveryApplied: true });
        const { cartBreakdown } = await (await getBreakdown()).json();
        expect(cartBreakdown[0]).toMatchObject({ price, deliveryFee: deliveryAmount / 100, freeDeliveryApplied: deliveryAmount === 0 });
        expect((await POST()).status).toBe(200);
        const totalAmount = Math.round(price * 100) + deliveryAmount;
        expect(m.saveSnapshot.mock.calls[0][0]).toMatchObject({ totalAmount, items: [expect.objectContaining({ deliveryAmount })] });
        expect(m.createSession.mock.calls[0][0].line_items.reduce((sum, item) => sum + item.price_data.unit_amount * item.quantity, 0)).toBe(totalAmount);
    });
    it.each([0, 0.01, -100, 999])('ignores client shipping %s and charges one combined server tier in breakdown and Stripe', async clientFee => {
        Object.assign(product, { productType: 'shop', slug: 'hcsr04-ultrasonic-sensor', paidAssets: [],
            basePrice: { presentmentAmount: 1.65, presentmentCurrency: 'SGD' },
            delivery: { deliveryTypes: [{ type: 'standard-shipping', price: 999 }] } });
        const filament = { ...product, _id: 'p2', slug: 'bambu-lab-3d-printing-filament-1kg-pla-basic',
            basePrice: { presentmentAmount: 21.9, presentmentCurrency: 'SGD' } };
        m.product.mockImplementation(async id => id === 'p2' ? filament : product);
        user.cart = ['p1', 'p2'].map(productId => ({ _id: `cart-${productId}`, productId, quantity: 1, selectedVariants: {}, chosenDeliveryType: 'standard-shipping',
            deliveryFee: clientFee, shippingAmount: clientFee, price: 0, shippingWeightG: 1, shippingDims: { L: 1, W: 1, H: 1 } }));
        const { cartBreakdown } = await (await getBreakdown()).json();
        expect(cartBreakdown.map(line => line.deliveryFee)).toEqual([6.2, 0]);
        const request = { headers: new Headers(), json: vi.fn(async () => ({ shippingAmount: clientFee, deliveryFee: clientFee })) };
        expect((await POST(request)).status).toBe(200);
        const params = m.createSession.mock.calls[0][0];
        expect(params.line_items.reduce((sum, item) => sum + item.price_data.unit_amount * item.quantity, 0)).toBe(2975);
        expect(m.saveSnapshot.mock.calls[0][0].items.map(item => item.deliveryAmount)).toEqual([620, 0]);
        expect(request.json).not.toHaveBeenCalled();
    });
    it('uses the letterbox tier at both endpoints and recalculates a changed quantity', async () => {
        Object.assign(product, { productType: 'shop', slug: 'hcsr04-ultrasonic-sensor', paidAssets: [],
            basePrice: { presentmentAmount: 1.65, presentmentCurrency: 'SGD' },
            delivery: { deliveryTypes: [{ type: 'standard-shipping', price: 6.2 }] } });
        Object.assign(user.cart[0], { quantity: 1, chosenDeliveryType: 'standard-shipping' });
        expect((await (await getBreakdown()).json()).cartBreakdown[0].deliveryFee).toBe(2);
        user.cart[0].quantity = 16; // Stack is 480 mm; with padding it exceeds 324 mm even when rotated.
        expect((await POST()).status).toBe(200);
        expect(m.saveSnapshot.mock.calls[0][0].items[0].deliveryAmount).toBe(620);
    });
    it('returns a blocked breakdown and rejects payment for an overweight standard parcel; pickup works', async () => {
        product.basePrice.presentmentAmount = 250;
        Object.assign(product, { productType: 'shop', shippingWeightG: 31000, shippingDims: { L: 100, W: 100, H: 100 },
            delivery: { deliveryTypes: [{ type: 'standard-shipping', price: 6.2 }, { type: 'pick-up', price: 0 }] } });
        Object.assign(user.cart[0], { quantity: 1, chosenDeliveryType: 'standard-shipping' });
        const data = await (await getBreakdown()).json();
        expect(data).toMatchObject({ shippingBlocked: true, cartBreakdown: [{ shippingBlocked: true, deliveryFee: null, total: null }] });
        const response = await POST();
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ error: 'Contact us for a delivery quote', code: 'shipping_quote_required' });
        expect(m.createSession).not.toHaveBeenCalled();
        expect(m.saveSnapshot).not.toHaveBeenCalled();
        user.cart[0].chosenDeliveryType = 'pick-up';
        expect((await POST()).status).toBe(200);
        expect(m.saveSnapshot.mock.calls[0][0].items[0].deliveryAmount).toBe(0);
    });
    it.each([true, false])('charges the table rate in the cart and Stripe (known costs: %s)', async known => {
        product.productType = 'shop';
        product.basePrice.presentmentAmount = 30;
        product.delivery.deliveryTypes = [{ type: 'standard-shipping', price: 0 }];
        if (known) product.shippingCosts = { unitCost: 2, packingCost: 1, deliveryCost: 6.2, confirmed: true };
        user.cart[0].quantity = 1;
        user.cart[0].chosenDeliveryType = 'standard-shipping';
        user.cart[0].deliveryFee = 0; // Untrusted browser value cannot waive the charge.
        const cartResponse = await getBreakdown();
        expect(cartResponse.status).toBe(200);
        const { cartBreakdown } = await cartResponse.json();
        expect(cartBreakdown[0].deliveryFee).toBe(6.2);
        expect(JSON.stringify(cartBreakdown)).not.toContain('unitCost');
        const response = await POST();
        expect(response.status).toBe(200);
        const checkout = m.saveSnapshot.mock.calls[0][0];
        expect(checkout.items[0].deliveryAmount).toBe(620);
        expect(checkout.totalAmount).toBe(Math.round(cartBreakdown[0].total * 100));
        const stripeTotal = m.createSession.mock.calls[0][0].line_items.reduce((sum, item) => sum + item.price_data.unit_amount * item.quantity, 0);
        expect(stripeTotal).toBe(checkout.totalAmount);
    });
    it('preserves active global discounts without waiving delivery at either endpoint', async () => {
        product.productType = 'shop';
        product.basePrice.presentmentAmount = 25;
        product.shippingCosts = { unitCost: 1, packingCost: 0, deliveryCost: 2, confirmed: true };
        product.delivery.deliveryTypes = [{ type: 'standard-shipping', price: 0 }];
        user.cart[0].quantity = 1;
        user.cart[0].chosenDeliveryType = 'standard-shipping';
        m.events = [{ percentage: 20 }];
        const { cartBreakdown } = await (await getBreakdown()).json();
        expect(cartBreakdown[0]).toMatchObject({ price: 20, deliveryFee: 6.2, freeDeliveryApplied: false });
        expect((await POST()).status).toBe(200);
        expect(m.saveSnapshot.mock.calls[0][0].totalAmount).toBe(2620);
    });
    it.each([2, 6.2, 30])('ignores the configured Standard rate %s and client flags at S$200', async fee => {
        product.productType = 'shop';
        product.basePrice.presentmentAmount = 100;
        product.shippingCosts = { unitCost: 0, packingCost: 0, deliveryCost: 0, confirmed: true };
        product.delivery.deliveryTypes = [{ type: 'standard-shipping', price: fee }];
        Object.assign(user.cart[0], { quantity: 2, chosenDeliveryType: 'standard-shipping', deliveryFee: 0, freeDeliveryApplied: true });
        const { cartBreakdown } = await (await getBreakdown()).json();
        expect(cartBreakdown[0]).toMatchObject({ deliveryFee: 6.2, total: 206.2, freeDeliveryApplied: false });
        expect((await POST()).status).toBe(200);
        const checkout = m.saveSnapshot.mock.calls[0][0];
        expect(checkout.items[0].deliveryAmount).toBe(620);
        expect(checkout.totalAmount).toBe(20620);
        const stripeTotal = m.createSession.mock.calls[0][0].line_items.reduce((sum, item) => sum + item.price_data.unit_amount * item.quantity, 0);
        expect(stripeTotal).toBe(checkout.totalAmount);
    });
    it('preserves zero-price collection in the cart and payment snapshot', async () => {
        product.productType = 'shop';
        product.basePrice.presentmentAmount = 100;
        product.delivery.deliveryTypes = [{ type: 'selfCollect', price: 0 }];
        Object.assign(user.cart[0], { quantity: 1, chosenDeliveryType: 'selfCollect' });
        const { cartBreakdown } = await (await getBreakdown()).json();
        expect(cartBreakdown[0]).toMatchObject({ deliveryFee: 0, total: 100 });
        expect((await POST()).status).toBe(200);
        expect(m.saveSnapshot.mock.calls[0][0]).toMatchObject({ totalAmount: 10000, items: [expect.objectContaining({ deliveryAmount: 0 })] });
    });
    it('does not start a payment for an item that now requires a quote', async () => {
        product.quoteOnly = true;
        const response = await POST();
        expect(response.status).toBe(409);
        expect((await response.json()).error).toMatch(/confirm the price/);
        expect(m.createSession).not.toHaveBeenCalled();
        expect(m.saveSnapshot).not.toHaveBeenCalled();
    });
    it('expires an unpaid session before rotating its intent for edits', async () => {
        await POST();
        const originalIntent = user.checkoutIntent;
        m.expire.mockResolvedValue({ id: 'cs_created', status: 'expired', payment_status: 'unpaid' });
        m.updateOwner.mockImplementation(async (filter, update) => {
            if (filter.checkoutIntent === user.checkoutIntent) Object.assign(user, update.$set);
            return { matchedCount: 1 };
        });
        const response = await DELETE(new Request('https://x/api/checkout/session', { method: 'DELETE', headers: { 'X-Checkout-Attempt': originalIntent } }));
        expect(response.status).toBe(200);
        expect(m.expire).toHaveBeenCalledWith('cs_created');
        expect((await response.json()).attemptId).not.toBe(originalIntent);
        expect(m.expire.mock.invocationCallOrder[0]).toBeLessThan(m.updateOwner.mock.invocationCallOrder[0]);
        expect(m.createSession).toHaveBeenCalledTimes(1);
    });
    it.each([
        { status: 'complete', payment_status: 'paid' },
        { status: 'complete', payment_status: 'unpaid' },
    ])('refuses edits when a payment is already processing: %j', async status => {
        await POST();
        m.retrieve.mockResolvedValue({ id: 'cs_created', ...status });
        const response = await DELETE(new Request('https://x/api/checkout/session', { method: 'DELETE', headers: { 'X-Checkout-Attempt': user.checkoutIntent } }));
        expect(response.status).toBe(409);
        expect(m.expire).not.toHaveBeenCalled();
        expect(m.updateOwner).not.toHaveBeenCalled();
    });
    it('blocks edits after an uncertain expiry and reuses the original contract', async () => {
        await POST();
        m.expire.mockRejectedValue(new Error('Lost expiry response'));
        const response = await DELETE(new Request('https://x/api/checkout/session', { method: 'DELETE', headers: { 'X-Checkout-Attempt': user.checkoutIntent } }));
        expect(response.status).toBe(409);
        expect(m.updateOwner).not.toHaveBeenCalled();
        await POST();
        expect(m.createSession).toHaveBeenCalledTimes(1);
    });
    it('recovers a lost expiry response only after the provider confirms expiry', async () => {
        await POST();
        m.expire.mockRejectedValueOnce(new Error('Lost response'));
        m.retrieve.mockResolvedValueOnce({ id: 'cs_created', status: 'open', payment_status: 'unpaid' })
            .mockResolvedValueOnce({ id: 'cs_created', status: 'expired', payment_status: 'unpaid' });
        const response = await DELETE(new Request('https://x/api/checkout/session', { method: 'DELETE', headers: { 'X-Checkout-Attempt': user.checkoutIntent } }));
        expect(response.status).toBe(200);
        expect(m.updateOwner).toHaveBeenCalledOnce();
    });
    it('cannot expire another customer checkout', async () => {
        await POST();
        m.auth.mockResolvedValue({ userId: 'other_buyer' });
        const response = await DELETE(new Request('https://x/api/checkout/session', { method: 'DELETE', headers: { 'X-Checkout-Attempt': user.checkoutIntent } }));
        expect(response.status).toBe(403);
        expect(m.expire).not.toHaveBeenCalled();
        expect(m.updateOwner).not.toHaveBeenCalled();
    });
    it.each(['street', 'city', 'postalCode', 'country'])('never creates payment when a shipping address lacks %s', async field => {
        delete user.contact.address[field];
        const response = await POST();
        expect(response.status).toBe(400);
        expect(m.createSession).not.toHaveBeenCalled();
    });
    it('allocates one durable intent for concurrent calls from an older account cart', async () => {
        delete user.checkoutIntent;
        const results = await Promise.all(Array.from({ length: 5 }, () => POST()));
        expect(results.every(result => result.status === 200)).toBe(true);
        expect(m.attempts.size).toBe(1);
        expect(new Set(m.createSession.mock.calls.map(call => call[1].idempotencyKey)).size).toBe(1);
    });
    it('adopts an older payable session instead of creating a second session for that cart', async () => {
        await POST();
        const original = m.saveSnapshot.mock.calls[0][0];
        m.legacy = [{ ...original, attemptId: undefined, sessionId: 'cs_older' }];
        m.attempts.clear(); m.createSession.mockClear();
        m.retrieve.mockResolvedValue({ id: 'cs_older', status: 'open', payment_status: 'unpaid', client_secret: 'older_secret' });
        product.basePrice.presentmentAmount = 99;
        const result = await (await POST()).json();
        expect(result).toMatchObject({ sessionId: 'cs_older', clientSecret: 'older_secret', cartBreakdown: [{ price: 10 }] });
        expect(m.createSession).not.toHaveBeenCalled();
    });
    it('blocks a new checkout when several older sessions may still be paid', async () => {
        m.legacy = [{ sessionId: 'cs_one' }, { sessionId: 'cs_two' }];
        const result = await POST();
        expect(result.status).toBe(409);
        expect(await result.json()).toMatchObject({ code: 'checkout_review_required' });
        expect(m.createSession).not.toHaveBeenCalled();
    });
    it('rotates an expired intent only after Stripe confirms expiry', async () => {
        await POST();
        m.retrieve.mockRejectedValueOnce(new Error('Stripe unavailable'));
        expect((await POST()).status).toBe(503);
        expect(m.updateOwner).not.toHaveBeenCalled();
        m.retrieve.mockResolvedValue({ id: 'cs_created', status: 'expired', payment_status: 'unpaid' });
        const result = await POST();
        expect(result.status).toBe(409);
        expect(await result.json()).toMatchObject({ code: 'checkout_expired' });
        expect(m.updateOwner).toHaveBeenCalledWith({ userId: 'buyer', checkoutIntent: user.checkoutIntent }, expect.any(Object));
        expect(m.createSession).toHaveBeenCalledTimes(1);
    });
    it('uses one Stripe session for concurrent checkout submissions, including different cart versions', async () => {
        const sessions = new Map();
        m.createSession.mockImplementation(async (params, { idempotencyKey }) => {
            if (!sessions.has(idempotencyKey)) sessions.set(idempotencyKey, { id: `cs_${sessions.size + 1}`, status: 'open', payment_status: 'unpaid', client_secret: 'same_secret' });
            return sessions.get(idempotencyKey);
        });
        const responses = await Promise.all(Array.from({ length: 8 }, () => POST()));
        expect(responses.every(response => response.status === 200)).toBe(true);
        const results = await Promise.all(responses.map(response => response.json()));
        expect(new Set(results.map(result => result.sessionId)).size).toBe(1);
        expect(sessions.size).toBe(1);
        expect(m.attempts.size).toBe(1);
        user.cart[0].quantity = 8;
        m.retrieve.mockResolvedValue({ ...[...sessions.values()][0], client_secret: 'same_secret' });
        const replay = await (await POST()).json();
        expect(replay.cartBreakdown[0].quantity).toBe(2);
        expect(sessions.size).toBe(1);
    });
    it.each(['timeout', 'gateway 502'])('recovers a lost %s response using identical parameters and the original Stripe key', async failure => {
        const accepted = new Map();
        let loseResponse = true;
        m.createSession.mockImplementation(async (params, { idempotencyKey }) => {
            if (!accepted.has(idempotencyKey)) accepted.set(idempotencyKey, { params: structuredClone(params), session: { id: 'cs_accepted', status: 'open', payment_status: 'unpaid', client_secret: 'secret' } });
            expect(params).toEqual(accepted.get(idempotencyKey).params);
            if (loseResponse) { loseResponse = false; throw new Error(failure); }
            return accepted.get(idempotencyKey).session;
        });
        expect((await POST()).status).toBe(503);
        product.basePrice.presentmentAmount = 99;
        user.cart[0].quantity = 3;
        const replay = await (await POST()).json();
        expect(replay.sessionId).toBe('cs_accepted');
        expect(replay.cartBreakdown[0]).toMatchObject({ quantity: 2, price: 10 });
        expect(accepted.size).toBe(1);
        expect(m.createSession.mock.calls[0]).toEqual(m.createSession.mock.calls[1]);
    });
    it('keeps a cached Stripe 500 on the same durable attempt instead of creating a fresh payment', async () => {
        // Stripe also caches error results for an idempotency key. A retry is
        // safe, but that does not mean the original error will become success.
        m.createSession.mockRejectedValue(new Error('Stripe cached 500'));
        for (let retry = 0; retry < 3; retry++) {
            expect((await POST()).status).toBe(503);
            user.cart[0].quantity++;
        }
        expect(m.attempts.size).toBe(1);
        expect(m.createSession).toHaveBeenCalledTimes(3);
        expect(m.createSession.mock.calls[1]).toEqual(m.createSession.mock.calls[0]);
        expect(m.createSession.mock.calls[2]).toEqual(m.createSession.mock.calls[0]);
        expect(m.updateOwner).not.toHaveBeenCalled();
    });
    it('returns already paid on back/refresh even after the webhook emptied the cart and rotated its intent', async () => {
        const initial = await (await POST()).json();
        user.cart = []; user.checkoutIntent = '00000000-0000-4000-8000-000000000002';
        m.retrieve.mockResolvedValue({ id: initial.sessionId, status: 'complete', payment_status: 'paid' });
        const replay = await POST(new Request('https://fit.example/api/checkout/session', { method: 'POST', headers: { 'X-Checkout-Attempt': initial.attemptId } }));
        expect(await replay.json()).toMatchObject({ alreadyPaid: true, sessionId: initial.sessionId });
        expect(m.createSession).toHaveBeenCalledTimes(1);
    });
    it('keeps pending asynchronous payment locked to its existing session', async () => {
        await POST();
        m.retrieve.mockResolvedValue({ id: 'cs_created', status: 'complete', payment_status: 'unpaid' });
        const replay = await (await POST()).json();
        expect(replay).toMatchObject({ pending: true, alreadyPaid: false });
        expect(replay.clientSecret).toBeUndefined();
        expect(m.createSession).toHaveBeenCalledTimes(1);
    });
    it('fails closed for unresolved attempts after the Stripe idempotency retention window', async () => {
        m.createSession.mockRejectedValueOnce(new Error('lost response'));
        await POST();
        [...m.attempts.values()][0].createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
        const replay = await POST();
        expect(replay.status).toBe(409);
        expect(await replay.json()).toMatchObject({ code: 'checkout_review_required' });
        expect(m.createSession).toHaveBeenCalledTimes(1);
    });
    it('rejects replay from another cart owner before returning any client secret', async () => {
        const original = await (await POST()).json();
        m.auth.mockResolvedValue({ userId: 'other_buyer' });
        const replay = await POST(new Request('https://fit.example/api/checkout/session', { method: 'POST', headers: { 'X-Checkout-Attempt': original.attemptId } }));
        expect(replay.status).toBe(403);
        expect(m.retrieve).not.toHaveBeenCalled();
        expect(m.createSession).toHaveBeenCalledTimes(1);
    });
    it('creates a Stripe session for a guest with a Mongo cart and contact details', async () => {
        m.auth.mockResolvedValue({ userId: null });
        user.guestContact = { name: 'Guest', email: 'guest@example.test', address: { country: 'SG', street: 'Guest street', city: 'Singapore', postalCode: '123456' } };
        product.productType = 'shop';
        const response = await POST(new Request('https://fit.example/api/checkout/session', { method: 'POST',
            headers: { cookie: `fit_guest_cart=${'a'.repeat(64)}` } }));
        expect(response.status).toBe(200);
        expect(m.customer).not.toHaveBeenCalled();
        expect(m.createSession.mock.calls[0][0]).toMatchObject({ customer_email: 'guest@example.test', metadata: { userId: expect.stringMatching(/^guest_/) } });
    });
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
    it('retains the same Stripe session if saving its contract fails', async () => {
        m.saveSnapshot.mockRejectedValueOnce(new Error('Database unavailable'));
        expect((await POST()).status).toBe(503); expect(m.expire).not.toHaveBeenCalled();
        expect((await POST()).status).toBe(200); expect(m.createSession).toHaveBeenCalledTimes(1);
    });
    it('refuses a shipping cart without a complete delivery address', async () => {
        user.contact = {};
        const response = await POST();
        expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ code: 'checkout_address_required' });
        expect(m.createSession).not.toHaveBeenCalled();
    });
    it('does not require an address when nothing in the cart ships', async () => {
        user.contact = {};
        user.cart[0].chosenDeliveryType = 'digital';
        user.cart[0].quantity = 1;
        product.delivery = { deliveryTypes: [{ type: 'digital', price: 0 }] };
        const response = await POST();
        expect(response.status).toBe(200);
        expect(m.saveSnapshot).toHaveBeenCalledWith(expect.objectContaining({ shippingAddress: null, totalAmount: 1000 }));
    });
    it('accepts an address with no unit number and no state', async () => {
        user.contact.address = { street: '1 Test St', city: 'Singapore', postalCode: '123456', country: 'SG' };
        expect((await POST()).status).toBe(200);
    });
    it('answers 409 with a cart hint when a line holds a delivery option the product no longer offers', async () => {
        user.cart[0].chosenDeliveryType = 'drone';
        const response = await POST();
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: 'Pick a delivery option for Product in the cart.' });
        expect(m.createSession).not.toHaveBeenCalled();
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

it('refuses a guided enquiry at the final payment boundary without exact-file review',async()=>{
  user.cart[0]={_id:'cart1',productId:'custom-print:guided-test',quantity:1,chosenDeliveryType:'shipping'}
  m.request.mockResolvedValue({requestId:'guided-test',userId:'buyer',status:'quoted',guidedBrief:{version:1},guidedFingerprint:'fp',guidedReview:{status:'pending'},basePrice:20,printFee:5})
  const response=await POST();expect(response.status).toBe(409);expect((await response.json()).error).toMatch(/paid-print permission/);expect(m.createSession).not.toHaveBeenCalled()
})
it('preserves the reviewed whole-batch brief and remarks in the immutable payment fixture',async()=>{
  user.cart[0]={_id:'cart1',productId:'custom-print:guided-test',quantity:1,chosenDeliveryType:'shipping'}
  m.request.mockResolvedValue({requestId:'guided-test',userId:'buyer',status:'quoted',quoteMode:'manual',basePrice:20,printFee:5,delivery:{deliveryTypes:[{type:'shipping',price:5}]},guidedBrief:{version:1,purpose:'Desk box',quantity:3,sizeMode:'longest',size:10,unit:'cm',sizeMm:100,material:'pla',colour:'Blue',rights:'unknown'},guidedFingerprint:'fp',guidedReview:{status:'approved',fingerprint:'fp',exactFile:'part-v2.stl',licenceEvidence:'Permission for this paid print service',scopeConfirmed:true,reviewedBy:'staff'}})
  expect((await POST()).status).toBe(200);const item=m.saveSnapshot.mock.calls[0][0].items[0]
  expect(item.customRequest.guidedBrief.quantity).toBe(3);expect(item.orderNote).toMatch(/Quantity: 3/);expect(item.totalAmount).toBe(3000)
})