// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import Stripe from 'stripe';
const f = vi.hoisted(() => ({ state: null, draft: null, event: null, failOrder: false,
    secret: '', failTransaction: false, sendEmail: vi.fn(), notify: vi.fn(), options: [], transactions: 0 }));
vi.hoisted(async () => {
    const { randomBytes } = await import('node:crypto');
    process.env.STRIPE_SECRET_KEY = 'sk_test_' + randomBytes(16).toString('hex');
    process.env.STRIPE_SESSION_COMPLETE_SIGNING_SECRET = 'whsec_' + randomBytes(16).toString('hex');
});
vi.mock('stripe', async importOriginal => {
    const { default: Stripe } = await importOriginal();
    return { default: class extends Stripe { paymentIntents = { retrieve: async () => ({}) }; } };
});
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
    static findOne(filter) { return { session: async () => { const row = f.draft.orders.find(o => o.stripePaymentIntentId === filter.stripePaymentIntentId && o.creatorDashboard); if (!row) return null; return { ...row, save: async () => Object.assign(row, { status: 'refunded' }) }; } }; }
    constructor(data) { Object.assign(this, { _id: '200000000000000000000001' }, data); }
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

const signingStripe = new Stripe('sk_test_' + randomBytes(16).toString('hex'));
const req = (valid = true) => {
    const payload = JSON.stringify(f.event);
    return new Request('https://fit.test/api/webhook/stripe', { method: 'POST', body: payload,
        headers: { 'stripe-signature': signingStripe.webhooks.generateTestHeaderString({ payload,
            secret: valid ? process.env.STRIPE_SESSION_COMPLETE_SIGNING_SECRET : 'whsec_' + randomBytes(16).toString('hex') }) } });
};
afterEach(() => vi.useRealTimers());
const originalCart = () => ({ _id: 'cart1', productId: 'product1', quantity: 2, selectedVariants: {}, chosenDeliveryType: 'shipping', orderNote: '' });
function setup() {
    f.event = { id: 'evt_fixture', livemode: false, type: 'checkout.session.completed', data: { object: { id: 'cs_paid', mode: 'payment', payment_status: 'paid',
        amount_total: 2500, currency: 'sgd', metadata: { userId: 'buyer' }, payment_intent: 'pi_paid', customer_details: { email: 'buyer@example.test' } } } };
    const item = { cartItemId: 'cart1', sourceCart: originalCart(), productId: 'product1', productName: 'Paid original', productSlug: 'original',
        creatorUserId: 'user_A', productType: 'print', quantity: 2, selectedVariants: {}, variantInfo: [], chosenDeliveryType: 'shipping', orderNote: '', basePrice: 10,
        priceBeforeDiscount: 10, unitAmount: 1000, deliveryAmount: 500, totalAmount: 2500, currency: 'sgd',
        paidAssets: ['private/original.stl'], requestId: null };
    f.state = { checkout: { sessionId: 'cs_paid', userId: 'buyer', snapshotVersion: 1, items: [item], totalAmount: 2500, currency: 'sgd',
        customerEmail: 'buyer@example.test', status: 'pending', processed: false },
        user: { userId: 'buyer', cart: [originalCart()], orderHistory: [] },
        products: { product1: { _id: 'product1', name: 'Changed after checkout', basePrice: { presentmentAmount: 999 },
            paidAssets: ['private/replacement.stl'], stock: 10, infiniteStock: false, variantTypes: [], sales: [] } },
        requests: {}, orders: [], assets: [], subOrders: [], events: [], jobs: [] };
    f.failOrder = false; f.failTransaction = false; f.options = []; f.transactions = 0;
    f.sendEmail.mockReset(); f.notify.mockReset();
}
const testKey = process.env.STRIPE_SECRET_KEY;
beforeEach(() => {
    vi.stubEnv('STRIPE_SECRET_KEY', testKey);
    setup(); vi.stubEnv('CREATOR_DASHBOARD_ENABLED', 'true'); vi.stubEnv('CREATOR_DASHBOARD_FIXTURES', 'false');
});
vi.mock('@/models/PrintJob', () => ({ default: { create: async rows => { rows.forEach((row, index) => { row._id = `job-${index}`; }); f.draft.jobs.push(...structuredClone(rows)); return rows; } } }));
vi.mock('@/models/SubOrder', () => ({ default: {
    updateOne: async () => ({}),
    updateMany: async (filter, update) => { let count = 0; for (const row of f.draft.subOrders) { if (row.orderId === filter.orderId && row.status !== 'refunded') { row.status = update.$set.status; row.statusHistory.push(update.$push.statusHistory); count++; } } return { modifiedCount: count }; },
    create: async (rows, options) => { f.options.push(options); rows.forEach((row, index) => { row._id = String(index + 1).padStart(24, '0'); }); f.draft.subOrders.push(...structuredClone(rows)); return rows; },
} }));
vi.mock('@/models/ProcessedStripeEvent', () => ({ default: {
    findOne: query => ({ session: async () => f.draft.events.find(e => e.eventId === query.eventId) }),
    create: async (rows, options) => { f.options.push(options); if (f.draft.events.some(e => e.eventId === rows[0].eventId)) throw Object.assign(new Error('Duplicate'), { code: 11000 }); f.draft.events.push(...rows); },
} }));


describe('creator dashboard signed Stripe integration', () => {
    it('replays the same signed event three times: exactly one Order and N seller SubOrders', async () => {
        const second = { ...f.state.checkout.items[0], cartItemId: 'cart2', productId: 'product2', creatorUserId: 'user_B', paidAssets: [] };
        f.state.checkout.items.push(second); f.state.checkout.totalAmount = 5000; f.event.data.object.amount_total = 5000;
        f.state.products.product2 = { ...structuredClone(f.state.products.product1), _id: 'product2' };
        for (let n = 0; n < 3; n++) expect((await POST(req())).status).toBe(200);
        expect(f.state.orders).toHaveLength(1); expect(f.state.subOrders).toHaveLength(2); expect(f.state.events).toHaveLength(1);
        expect(f.state.orders[0].status).toBe('paid'); expect(f.state.orders[0].trackingToken).toMatch(/^[a-f0-9]{32}$/);
        expect(f.state.subOrders.map(s => s.storeId)).toEqual(['user_A', 'user_B']);
        expect(f.state.jobs).toHaveLength(2); expect(f.state.jobs.every(job => job.status === 'queued')).toBe(true);
        expect(f.state.jobs[0].source.refId).toBe(String(f.state.subOrders[0]._id));
        expect(f.options.every(o => o.session === dbSession)).toBe(true);
        expect(f.sendEmail).not.toHaveBeenCalled();
    });
    it('rejects invalid signatures without writes', async () => {
        expect((await POST(req(false))).status).toBe(400); expect(f.state.orders).toHaveLength(0); expect(f.transactions).toBe(0);
    });
    it('rolls back event ledger and sub-orders with a failed order write, then retries safely', async () => {
        f.failOrder = true; expect((await POST(req())).status).toBe(500);
        expect(f.state.events).toHaveLength(0); expect(f.state.subOrders).toHaveLength(0);
        expect((await POST(req())).status).toBe(200); expect(f.state.events).toHaveLength(1); expect(f.state.subOrders).toHaveLength(1);
    });
    it('flag off preserves existing checkout behaviour and creates no dashboard records', async () => {
        vi.stubEnv('CREATOR_DASHBOARD_ENABLED', 'false'); expect((await POST(req())).status).toBe(200);
        expect(f.state.orders[0].status).toBe('pending'); expect(f.state.subOrders).toEqual([]); expect(f.state.events).toEqual([]);
    });
    it('live-key prefix makes new webhook paths inert', async () => {
        vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_' + randomBytes(16).toString('hex'));
        expect((await POST(req())).status).toBe(200); expect(f.state.subOrders).toEqual([]); expect(f.state.orders[0].status).toBe('pending');
    });
    it('live events cannot populate test dashboard data', async () => {
        f.event.livemode = true; expect((await POST(req())).status).toBe(200); expect(f.state.subOrders).toEqual([]);
    });
});

it('signed full refund updates all sub-orders once and replay is inert', async () => {
    await POST(req());
    f.event = { id: 'evt_refund', livemode: false, type: 'charge.refunded', data: { object: { payment_intent: 'pi_paid', refunded: true, amount: 2500, amount_refunded: 2500 } } };
    for (let i = 0; i < 3; i++) expect((await POST(req())).status).toBe(200);
    expect(f.state.subOrders[0].status).toBe('refunded'); expect(f.state.orders[0].status).toBe('refunded');
    expect(f.state.subOrders[0].statusHistory.filter(h => h.status === 'refunded')).toHaveLength(1);
    expect(f.state.events).toHaveLength(2);
});
it('partial refunds are recorded but never falsely mark the whole order refunded', async () => {
    await POST(req());
    f.event = { id: 'evt_partial', livemode: false, type: 'charge.refunded', data: { object: { payment_intent: 'pi_paid', refunded: false, amount: 2500, amount_refunded: 500 } } };
    expect((await POST(req())).status).toBe(200); expect(f.state.subOrders[0].status).toBe('paid');
});
