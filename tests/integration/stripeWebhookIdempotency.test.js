import { beforeEach, describe, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ state: null, draft: null, event: null, failOrder: false,
    failTransaction: false, sendEmail: vi.fn(), notify: vi.fn(), options: [], transactions: 0 }));
vi.mock('stripe', () => ({ default: class {
    webhooks = { constructEvent: () => f.event };
    paymentIntents = { retrieve: async () => ({}) };
} }));
const dbSession = vi.hoisted(() => ({
    withTransaction: async (callback) => {
        f.transactions++;
        if (f.failTransaction) throw new Error('Transactions unavailable');
        f.draft = structuredClone(f.state);
        try { await callback(); f.state = f.draft; } finally { f.draft = null; }
    }, endSession: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ connectToDatabase: async () => ({ startSession: async () => dbSession }) }));
vi.mock('@/models/CheckoutSession', () => ({ default: {
    findOne: async () => structuredClone(f.state.checkout),
    findOneAndUpdate: async (_filter, _update, options) => {
        f.options.push(options);
        if (!f.draft.checkout || f.draft.checkout.status === 'completed') return null;
        f.draft.checkout.status = 'completed';
        return structuredClone(f.draft.checkout);
    },
    updateOne: async (_filter, update, options) => { f.options.push(options); Object.assign(f.draft.checkout, update.$set); },
} }));
vi.mock('@/models/User', () => ({ default: {
    findOne: ({ userId }) => ({ session: async () => {
        if (!f.draft.user || f.draft.user.userId !== userId) return null;
        const user = structuredClone(f.draft.user);
        user.save = async options => { f.options.push(options); const { save, ...data } = user; f.draft.user = structuredClone(data); };
        return user;
    } }),
} }));
vi.mock('@/models/Product', () => ({ default: {
    findById: id => ({ session: async () => structuredClone(f.draft.products[id] || null) }),
    updateOne: async (filter, update, options) => {
        f.options.push(options);
        const product = f.draft.products[filter._id];
        if (!product || (filter.stock && product.stock < filter.stock.$gte)) return { matchedCount: 0 };
        if (update.$inc?.stock) product.stock += update.$inc.stock;
        product.sales.push(update.$push.sales);
        return { matchedCount: 1 };
    },
} }));
vi.mock('@/models/Order', () => ({ default: class {
    constructor(data) { Object.assign(this, data); }
    async save(options) {
        f.options.push(options);
        if (f.failOrder) { f.failOrder = false; throw new Error('Order write failed'); }
        f.draft.orders.push(structuredClone({ ...this }));
    }
} }));
vi.mock('@/models/CustomPrintRequest', () => ({ default: {
    findOne: ({ requestId, userId }) => ({ session: async () => {
        const request = f.draft.requests[requestId];
        if (!request || request.userId !== userId) return null;
        const doc = structuredClone(request);
        doc.save = async options => { f.options.push(options); const { save, ...data } = doc; f.draft.requests[requestId] = structuredClone(data); };
        return doc;
    } }),
    create: async (requests, options) => { f.options.push(options); for (const request of requests) f.draft.requests[request.requestId] = structuredClone(request); return requests; },
} }));
vi.mock('@/models/DigitalProductTransaction', () => ({ default: {
    updateOne: async (filter, update, options) => { f.options.push(options); f.draft.assets.push({ ...filter, ...update.$setOnInsert }); },
} }));
vi.mock('@/lib/email', () => ({ sendEmail: f.sendEmail }));
vi.mock('@/lib/notifications/customPrint', () => ({ notifyCustomPrintEvent: f.notify }));
vi.mock('@clerk/nextjs/server', () => ({ clerkClient: async () => ({ users: { getUser: async () => ({ emailAddresses: [] }) } }) }));
import { POST } from '@/app/api/webhook/stripe/route';

const req = () => ({ text: async () => '{}', headers: { get: () => 'valid-signature' } });
const originalCart = () => ({ _id: 'cart1', productId: 'product1', quantity: 2, selectedVariants: {}, chosenDeliveryType: 'shipping', orderNote: '' });
function setup() {
    f.event = { type: 'checkout.session.completed', data: { object: { id: 'cs_paid', mode: 'payment', payment_status: 'paid',
        amount_total: 2500, currency: 'sgd', metadata: { userId: 'buyer' }, payment_intent: 'pi_paid', customer_details: { email: 'buyer@example.test' } } } };
    const item = { cartItemId: 'cart1', sourceCart: originalCart(), productId: 'product1', productName: 'Paid original', productSlug: 'original',
        quantity: 2, selectedVariants: {}, variantInfo: [], chosenDeliveryType: 'shipping', orderNote: '', basePrice: 10,
        priceBeforeDiscount: 10, unitAmount: 1000, deliveryAmount: 500, totalAmount: 2500, currency: 'sgd',
        paidAssets: ['private/original.stl'], requestId: null };
    f.state = { checkout: { sessionId: 'cs_paid', userId: 'buyer', snapshotVersion: 1, items: [item], totalAmount: 2500, currency: 'sgd',
        customerEmail: 'buyer@example.test', status: 'pending', processed: false },
        user: { userId: 'buyer', cart: [originalCart()], orderHistory: [] },
        products: { product1: { _id: 'product1', name: 'Changed after checkout', basePrice: { presentmentAmount: 999 },
            paidAssets: ['private/replacement.stl'], stock: 10, infiniteStock: false, variantTypes: [], sales: [] } },
        requests: {}, orders: [], assets: [] };
    f.failOrder = false; f.failTransaction = false; f.options = []; f.transactions = 0;
    f.sendEmail.mockReset(); f.notify.mockReset();
}
beforeEach(setup);

describe('Stripe paid checkout snapshots', () => {
    it('fulfils original prices, files and quantity when the cart and catalogue change', async () => {
        f.state.user.cart = [{ _id: 'new', productId: 'expensive-unpaid', quantity: 5, chosenDeliveryType: 'digital' }];
        expect((await POST(req())).status).toBe(200);
        expect(f.state.orders[0]).toMatchObject({ totalAmount: 25, subtotal: 20, totalDelivery: 5 });
        expect(f.state.orders[0].items[0]).toMatchObject({ productId: 'product1', productName: 'Paid original', quantity: 2, finalPrice: 10, totalPrice: 25 });
        expect(f.state.assets[0].assets).toEqual(['private/original.stl']);
        expect(f.state.products.product1.stock).toBe(8);
        expect(f.state.user.orderHistory[0].cartItem.price * f.state.user.orderHistory[0].cartItem.quantity).toBe(25);
        expect(f.state.user.cart[0].productId).toBe('expensive-unpaid');
    });
    it('preserves additional quantities and later cart lines', async () => {
        f.state.user.cart[0].quantity = 5;
        f.state.user.cart.push({ _id: 'later', productId: 'product2', quantity: 1, chosenDeliveryType: 'digital' });
        await POST(req());
        expect(f.state.user.cart.map(item => [item._id, item.quantity])).toEqual([['cart1', 3], ['later', 1]]);
    });
    it('preserves a later configuration edit on the same cart line', async () => {
        f.state.user.cart[0].selectedVariants = { Colour: 'Blue' };
        await POST(req());
        expect(f.state.user.cart[0].selectedVariants).toEqual({ Colour: 'Blue' });
    });
    it('removes only the unchanged purchased line', async () => {
        await POST(req()); expect(f.state.user.cart).toEqual([]);
    });
    it.each([
        ['amount', { amount_total: 2499 }], ['currency', { currency: 'usd' }],
        ['owner', { metadata: { userId: 'attacker' } }], ['mode', { mode: 'subscription' }],
    ])('rejects a mismatched %s before fulfilment', async (_name, patch) => {
        Object.assign(f.event.data.object, patch);
        expect((await POST(req())).status).toBe(409);
        expect(f.transactions).toBe(0); expect(f.state.orders).toEqual([]); expect(f.state.assets).toEqual([]);
        expect(f.state.products.product1.stock).toBe(10); expect(f.sendEmail).not.toHaveBeenCalled();
    });
    it('defers unpaid completion and fulfils only the later paid asynchronous event', async () => {
        f.event.data.object.payment_status = 'unpaid';
        expect(await (await POST(req())).json()).toMatchObject({ awaitingPayment: true });
        expect(f.transactions).toBe(0);
        f.event.type = 'checkout.session.async_payment_succeeded'; f.event.data.object.payment_status = 'paid';
        expect((await POST(req())).status).toBe(200); expect(f.state.orders).toHaveLength(1);
    });
    it('rejects a legacy session without an immutable snapshot', async () => {
        delete f.state.checkout.snapshotVersion;
        expect((await POST(req())).status).toBe(409); expect(f.state.orders).toEqual([]);
    });
    it('rejects corrupt snapshot arithmetic even when the stored total matches Stripe', async () => {
        f.state.checkout.items[0].quantity = 99;
        expect((await POST(req())).status).toBe(409); expect(f.transactions).toBe(0);
    });
    it('acknowledges repeated completed/async events without duplicating stock, assets, order or email', async () => {
        await POST(req());
        f.event.type = 'checkout.session.async_payment_succeeded';
        expect(await (await POST(req())).json()).toMatchObject({ duplicate: true });
        expect(f.state.orders).toHaveLength(1); expect(f.state.assets).toHaveLength(1);
        expect(f.state.products.product1.stock).toBe(8); expect(f.state.products.product1.sales).toHaveLength(1);
        expect(f.sendEmail).toHaveBeenCalledTimes(1);
    });
    it('does not repeat fulfilment if an admin clears the legacy processed flag', async () => {
        await POST(req()); f.state.checkout.processed = false;
        expect(await (await POST(req())).json()).toMatchObject({ duplicate: true }); expect(f.state.orders).toHaveLength(1);
    });
    it('still fulfils payment when an admin previously marked the review flag processed', async () => {
        f.state.checkout.processed = true;
        expect((await POST(req())).status).toBe(200); expect(f.state.orders).toHaveLength(1);
        expect(f.state.checkout.status).toBe('completed');
    });
    it('rolls back failed order persistence and lets a retry fulfil once', async () => {
        f.failOrder = true;
        expect((await POST(req())).status).toBe(500);
        expect(f.state.checkout.processed).toBe(false); expect(f.state.assets).toHaveLength(0);
        expect(f.state.products.product1.stock).toBe(10); expect(f.sendEmail).not.toHaveBeenCalled();
        expect((await POST(req())).status).toBe(200);
        expect(f.state.orders).toHaveLength(1); expect(f.state.products.product1.stock).toBe(8);
        expect(f.options.every(options => options.session === dbSession)).toBe(true);
    });
    it('fails safely when Mongo transactions are unavailable', async () => {
        f.failTransaction = true;
        expect((await POST(req())).status).toBe(500); expect(f.state.orders).toHaveLength(0);
        expect(f.state.checkout.processed).toBe(false);
    });
    it('preserves committed orders when confirmation delivery fails', async () => {
        f.sendEmail.mockRejectedValue(new Error('Email unavailable'));
        expect((await POST(req())).status).toBe(200);
        expect(f.state.checkout.status).toBe('completed'); expect(f.state.orders).toHaveLength(1);
    });
    it('returns a retryable not-found response when checkout persistence has not arrived', async () => {
        f.state.checkout = null;
        expect((await POST(req())).status).toBe(404); expect(f.transactions).toBe(0);
    });
});

// Ownership and inventory checks use the same transactional model fixture.
describe('Stripe custom printing and stock', () => {
    function customRequest(userId = 'buyer', status = 'quoted') {
        const item = f.state.checkout.items[0];
        item.requestId = 'request1'; item.quantity = 1; item.unitAmount = 2000;
        item.customRequest = { modelFile: { s3Key: 'original-model' }, printConfiguration: { isConfigured: true }, basePrice: 20 };
        f.state.requests.request1 = { requestId: 'request1', userId, status, modelFile: { s3Key: 'changed-model' }, statusHistory: [] };
    }
    it('does not fulfil another customer\'s custom print request', async () => {
        customRequest('other-buyer');
        expect((await POST(req())).status).toBe(409);
        expect(f.state.requests.request1.status).toBe('quoted'); expect(f.state.orders).toHaveLength(0);
    });
    it('fulfils the owner\'s request using its purchased model and configuration', async () => {
        customRequest();
        expect((await POST(req())).status).toBe(200);
        expect(f.state.requests.request1).toMatchObject({ status: 'paid', stripeSessionId: 'cs_paid', modelFile: { s3Key: 'original-model' } });
        expect(f.notify).toHaveBeenCalledTimes(1);
    });
    it('holds a second payment for a custom request already fulfilled by another checkout', async () => {
        customRequest('buyer', 'paid'); f.state.requests.request1.stripeSessionId = 'cs_previous';
        expect((await POST(req())).status).toBe(409);
        expect(f.state.requests.request1.stripeSessionId).toBe('cs_previous'); expect(f.notify).not.toHaveBeenCalled();
    });
    it('does not record a sale or produce an order if stock was exhausted after checkout', async () => {
        f.state.products.product1.stock = 1;
        expect((await POST(req())).status).toBe(409);
        expect(f.state.products.product1.stock).toBe(1); expect(f.state.products.product1.sales).toHaveLength(0);
        expect(f.state.orders).toHaveLength(0); expect(f.state.checkout.processed).toBe(false);
    });
    it('creates one print job per purchased unit from the saved print specification', async () => {
        f.state.checkout.items[0].productPrintInput = { userId: 'buyer', userEmail: 'buyer@example.test', userName: 'Buyer',
            source: 'product', modelFile: { s3Key: 'original-product-model' }, printConfiguration: { printSettings: { layerHeight: 0.2 } } };
        expect((await POST(req())).status).toBe(200);
        expect(Object.values(f.state.requests)).toHaveLength(2);
        expect(Object.values(f.state.requests).every(request => request.modelFile.s3Key === 'original-product-model')).toBe(true);
        expect(f.notify.mock.calls.map(([call]) => call.breakdown.total)).toEqual([15, 10]);
    });
});
