import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
    checkout: null, event: null, constructEvent: vi.fn(), connect: vi.fn(), startSession: vi.fn(),
    update: vi.fn(), find: vi.fn(), orderExists: vi.fn(), historyExists: vi.fn(),
    userRead: vi.fn(), productWrite: vi.fn(), orderSave: vi.fn(), digitalWrite: vi.fn(),
    requestRead: vi.fn(), requestCreate: vi.fn(), sendEmail: vi.fn(), notify: vi.fn(),
}));
vi.mock('stripe', () => ({ default: class { webhooks = { constructEvent: m.constructEvent }; } }));
vi.mock('@/lib/db', () => ({ connectToDatabase: m.connect }));
vi.mock('@/models/CheckoutSession', () => ({ default: { findOne: m.find, updateOne: m.update } }));
vi.mock('@/models/Order', () => ({ default: class {
    static exists = m.orderExists;
    save = m.orderSave;
} }));
vi.mock('@/models/User', () => ({ default: { exists: m.historyExists, findOne: m.userRead } }));
vi.mock('@/models/Product', () => ({ default: { updateOne: m.productWrite } }));
vi.mock('@/models/DigitalProductTransaction', () => ({ default: { updateOne: m.digitalWrite } }));
vi.mock('@/models/CustomPrintRequest', () => ({ default: { findOne: m.requestRead, create: m.requestCreate } }));
vi.mock('@/lib/email', () => ({ sendEmail: m.sendEmail }));
vi.mock('@/lib/notifications/customPrint', () => ({ notifyCustomPrintEvent: m.notify }));
vi.mock('@clerk/nextjs/server', () => ({ clerkClient: vi.fn() }));

import { POST } from '@/app/api/webhook/stripe/route';
import { buildLegacyCheckoutReceipt, isLegacyCheckout } from '@/lib/legacyCheckoutReconciliation';

const req = () => ({ text: async () => 'signed-body', headers: { get: () => 'signature' } });
const legacy = () => ({
    sessionId: 'cs_old', userId: 'buyer', status: 'pending', processed: false, totalAmount: 2500, currency: 'sgd',
    salesData: { creator: { totalAmount: 2500, items: [{ productId: 'old-product', quantity: 2, unitPrice: 10 }] } },
    digitalProductData: { 'old-product': { buyer: 'buyer', links: ['private/old.stl'] } },
});
const noFulfilment = () => {
    for (const spy of [m.startSession, m.userRead, m.productWrite, m.orderSave, m.digitalWrite, m.requestRead, m.requestCreate, m.sendEmail, m.notify]) {
        expect(spy).not.toHaveBeenCalled();
    }
};

beforeEach(() => {
    vi.clearAllMocks();
    m.checkout = legacy();
    m.event = { id: 'evt_paid', created: 1790000000, type: 'checkout.session.completed', data: { object: {
        id: 'cs_old', mode: 'payment', payment_status: 'paid', amount_total: 2500, currency: 'sgd',
        payment_intent: 'pi_old', metadata: { userId: 'buyer' },
    } } };
    m.constructEvent.mockImplementation(() => structuredClone(m.event));
    m.connect.mockResolvedValue({ startSession: m.startSession });
    m.find.mockImplementation(async () => structuredClone(m.checkout));
    m.orderExists.mockResolvedValue(null); m.historyExists.mockResolvedValue(null);
    m.update.mockImplementation(async (_filter, update) => {
        if (m.checkout.reconciliation || m.checkout.status === 'completed') return { matchedCount: 0 };
        Object.assign(m.checkout, structuredClone(update.$set));
        return { matchedCount: 1 };
    });
});

describe('legacy paid checkout reconciliation', () => {
    it('durably records a verified paid receipt without reconstructing or fulfilling an order', async () => {
        const before = structuredClone(m.checkout);
        expect(await (await POST(req())).json()).toMatchObject({ received: true, reconciliationRequired: true });
        expect(m.checkout).toMatchObject({ status: 'reconciliation_required', processed: false, reconciliation: {
            reason: 'legacy_snapshot_missing', paymentStatus: 'paid', amountTotalCents: 2500, currency: 'sgd',
            paymentIntentId: 'pi_old', stripeEventId: 'evt_paid', expectedAmountCents: 2500,
            expectedCurrency: 'sgd', amountMismatch: false, currencyMismatch: false,
        } });
        expect(m.checkout.reconciliation.recordedAt).toBeInstanceOf(Date);
        expect(m.checkout.reconciliation.eventCreatedAt).toEqual(new Date(1790000000000));
        expect(m.checkout.salesData).toEqual(before.salesData);
        expect(m.checkout.digitalProductData).toEqual(before.digitalProductData);
        expect(m.checkout).not.toHaveProperty('items');
        expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'cs_old', userId: 'buyer',
            reconciliation: null, snapshotVersion: null, status: { $ne: 'completed' },
            $or: [{ items: null }, { items: { $size: 0 } }],
        }), { $set: { status: 'reconciliation_required', reconciliation: m.checkout.reconciliation } },
        { runValidators: true, writeConcern: { w: 'majority' }, overwriteImmutable: true });
        noFulfilment();
    });
    it('retains Stripe actual capture and mismatch evidence when legacy totals or currency differ', async () => {
        m.checkout.totalAmount = 5000; m.checkout.currency = 'usd';
        expect((await POST(req())).status).toBe(200);
        expect(m.checkout.totalAmount).toBe(5000); expect(m.checkout.currency).toBe('usd');
        expect(m.checkout.reconciliation).toMatchObject({ amountTotalCents: 2500, currency: 'sgd',
            expectedAmountCents: 5000, expectedCurrency: 'usd', amountMismatch: true, currencyMismatch: true });
        noFulfilment();
    });
    it('does not mistake an admin processed flag for fulfilment', async () => {
        m.checkout.processed = true;
        expect(await (await POST(req())).json()).toMatchObject({ reconciliationRequired: true });
        expect(m.checkout.status).toBe('reconciliation_required');
        expect(m.checkout.processed).toBe(true);
        noFulfilment();
    });
    it.each(['order', 'history'])('preserves a legacy payment that already has durable %s evidence', async evidence => {
        (evidence === 'order' ? m.orderExists : m.historyExists).mockResolvedValue({ _id: 'existing' });
        expect(await (await POST(req())).json()).toMatchObject({ duplicate: true, legacyOrderExists: true });
        expect(m.orderExists).toHaveBeenCalledWith({ stripeSessionId: 'cs_old', userId: 'buyer' });
        expect(m.historyExists).toHaveBeenCalledWith({ userId: 'buyer', 'orderHistory.stripeSessionId': 'cs_old' });
        expect(m.update).not.toHaveBeenCalled(); noFulfilment();
    });
    it('keeps the first receipt unchanged across completed and asynchronous payment redeliveries', async () => {
        await POST(req());
        const receipt = structuredClone(m.checkout.reconciliation);
        m.event.id = 'evt_async'; m.event.created += 60; m.event.type = 'checkout.session.async_payment_succeeded';
        expect(await (await POST(req())).json()).toMatchObject({ reconciliationRequired: true, duplicate: true });
        expect(m.checkout.reconciliation).toEqual(receipt);
        expect(m.update).toHaveBeenCalledTimes(1); noFulfilment();
    });
    it('handles concurrent duplicate deliveries with one atomic receipt', async () => {
        const responses = await Promise.all([POST(req()), POST(req())]);
        expect(responses.every(response => response.status === 200)).toBe(true);
        const bodies = await Promise.all(responses.map(response => response.json()));
        expect(bodies.filter(body => body.duplicate)).toHaveLength(1);
        expect(m.checkout.reconciliation.stripeEventId).toBe('evt_paid');
        expect(m.checkout.status).toBe('reconciliation_required'); noFulfilment();
    });
    it('does not overwrite an existing receipt with conflicting signed payment details', async () => {
        await POST(req()); const receipt = structuredClone(m.checkout.reconciliation);
        m.event.data.object.amount_total = 9999;
        expect((await POST(req())).status).toBe(409);
        expect(m.checkout.reconciliation).toEqual(receipt);
        expect(m.update).toHaveBeenCalledTimes(1); noFulfilment();
    });
    it('returns a retryable error on persistence failure instead of acknowledging a lost payment record', async () => {
        m.update.mockRejectedValueOnce(new Error('Write concern failed'));
        expect((await POST(req())).status).toBe(500);
        expect(m.checkout.reconciliation).toBeUndefined();
        expect((await POST(req())).status).toBe(200);
        expect(m.checkout.status).toBe('reconciliation_required'); noFulfilment();
    });
    it('does not acknowledge a missing or changed checkout after a lost conditional write', async () => {
        m.update.mockImplementation(async () => { m.checkout = null; return { matchedCount: 0 }; });
        expect((await POST(req())).status).toBe(409); noFulfilment();
    });
    it('ignores unpaid and unrelated events without recording a receipt', async () => {
        m.event.data.object.payment_status = 'unpaid';
        expect(await (await POST(req())).json()).toMatchObject({ awaitingPayment: true });
        m.event.type = 'invoice.paid';
        expect((await POST(req())).status).toBe(200);
        expect(m.connect).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled(); noFulfilment();
    });
    it('rejects an invalid signature before reading or writing payment records', async () => {
        m.constructEvent.mockImplementation(() => { throw new Error('Invalid signature'); });
        expect((await POST(req())).status).toBe(400);
        expect(m.connect).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled(); noFulfilment();
    });
    it.each([
        ['session', { id: 'cs_other' }], ['owner', { metadata: { userId: 'other' } }],
        ['missing owner', { metadata: {} }], ['mode', { mode: 'subscription' }],
        ['negative amount', { amount_total: -1 }], ['fractional amount', { amount_total: 1.5 }],
        ['nonfinite amount', { amount_total: NaN }], ['unsafe amount', { amount_total: Number.MAX_SAFE_INTEGER + 1 }],
        ['missing currency', { currency: undefined }], ['invalid currency', { currency: 'SGD<script>' }],
    ])('rejects invalid paid %s evidence before any write', async (_name, patch) => {
        Object.assign(m.event.data.object, patch);
        expect((await POST(req())).status).toBe(409);
        expect(m.update).not.toHaveBeenCalled(); expect(m.orderExists).not.toHaveBeenCalled(); noFulfilment();
    });
    it('does not treat malformed new snapshots as legacy payments', async () => {
        m.checkout.snapshotVersion = 1;
        expect((await POST(req())).status).toBe(409);
        expect(m.update).not.toHaveBeenCalled(); noFulfilment();
    });
    it('recognizes only absent-version empty legacy snapshots', () => {
        expect(isLegacyCheckout(null)).toBe(false);
        expect(isLegacyCheckout(undefined)).toBe(false);
        expect(isLegacyCheckout(legacy())).toBe(true);
        expect(isLegacyCheckout({ ...legacy(), snapshotVersion: null, items: [] })).toBe(true);
        expect(isLegacyCheckout({ ...legacy(), snapshotVersion: 2 })).toBe(false);
        expect(isLegacyCheckout({ ...legacy(), items: [{ productId: 'unexpected' }] })).toBe(false);
    });
    it.each([{ id: '' }, { created: NaN }, { created: -1 }])('requires durable Stripe event identity and time %j', patch => {
        expect(() => buildLegacyCheckoutReceipt({ ...m.event, ...patch }, m.checkout)).toThrow();
    });
});
