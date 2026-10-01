import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ identity: vi.fn(), connect: vi.fn(), checkout: vi.fn(), order: vi.fn(), retrieve: vi.fn() }));
vi.mock('@/lib/cartOwner', () => ({ cartIdentity: m.identity }));
vi.mock('@/lib/db', () => ({ connectToDatabase: m.connect }));
vi.mock('@/models/CheckoutSession', () => ({ default: { findOne: (...args) => ({ select: () => ({ lean: () => m.checkout(...args) }) }) } }));
vi.mock('@/models/Order', () => ({ default: { findOne: (...args) => ({ select: () => ({ lean: () => m.order(...args) }) }) } }));
vi.mock('stripe', () => ({ default: class { checkout = { sessions: { retrieve: m.retrieve } }; } }));
import { GET } from '@/app/api/checkout/session/[sessionId]/measurement/route';

let checkout, order, payment;
const request = () => new Request('https://www.fixitoday.com/api/checkout/session/cs_fixture/measurement');
const get = (id = 'cs_fixture') => GET(request(), { params: Promise.resolve({ sessionId: id }) });
beforeEach(() => {
    vi.clearAllMocks();
    checkout = { sessionId: 'cs_fixture', userId: 'buyer', status: 'completed', snapshotVersion: 1,
        currency: 'sgd', totalAmount: 3090, items: [{ productId: 'fixture-product', quantity: 1, unitAmount: 2590,
            deliveryAmount: 500, totalAmount: 3090, currency: 'sgd' }] };
    order = { orderId: 'ORD_cs_fixture', stripeSessionId: 'cs_fixture', userId: 'buyer', status: 'pending',
        customerEmail: 'buyer@example.test', shippingAddress: { country: 'SG' }, adminNote: 'PRIVATE' };
    payment = { id: 'cs_fixture', mode: 'payment', payment_status: 'paid', amount_total: 3090,
        currency: 'sgd', metadata: { userId: 'buyer' }, client_secret: 'PRIVATE' };
    m.identity.mockResolvedValue({ userId: 'buyer' }); m.connect.mockResolvedValue();
    m.checkout.mockImplementation(async () => checkout); m.order.mockImplementation(async () => order);
    m.retrieve.mockImplementation(async () => payment);
});
describe('owner-protected paid measurement endpoint', () => {
    it('rejects malformed IDs without auth, database or Stripe calls', async () => {
        expect((await get('../secret')).status).toBe(400); expect(m.identity).not.toHaveBeenCalled();
    });
    it('requires an existing buyer identity, without creating a guest', async () => {
        m.identity.mockResolvedValue({ userId: null, guest: true });
        expect((await get()).status).toBe(401); expect(m.connect).not.toHaveBeenCalled();
        expect(m.identity).toHaveBeenCalledWith(expect.any(Request));
    });
    it('queries by owner and session before retrieving payment or private order data', async () => {
        m.checkout.mockResolvedValue(null);
        expect((await get()).status).toBe(404);
        expect(m.checkout).toHaveBeenCalledWith({ sessionId: 'cs_fixture', userId: 'buyer' });
        expect(m.order).not.toHaveBeenCalled(); expect(m.retrieve).not.toHaveBeenCalled();
    });
    it('waits for webhook completion rather than counting a visit or pending session', async () => {
        checkout.status = 'pending'; const response = await get();
        expect(response.status).toBe(202); expect(await response.json()).toEqual({ pending: true });
        expect(m.retrieve).not.toHaveBeenCalled();
    });
    it('waits for a committed order', async () => {
        m.order.mockResolvedValue(null);
        expect(await (await get()).json()).toEqual({ pending: true, purchase: null, review: null });
        expect(m.retrieve).not.toHaveBeenCalled();
    });
    it('returns immutable prices only, not contact or private data, and does not guess review dates', async () => {
        const response = await get(); const body = await response.json();
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(response.headers.get('vary')).toBe('Cookie');
        expect(body.purchase).toEqual({ transaction_id: 'ORD_cs_fixture', value: 25.9, shipping: 5,
            currency: 'SGD', items: [{ item_id: 'fixture-product', price: 25.9, quantity: 1 }] });
        expect(body.review).toBeNull(); expect(JSON.stringify(body)).not.toMatch(/PRIVATE|buyer@example|client_secret/);
    });
    it.each(['unpaid', 'no_payment_required'])('does not count %s as a paid purchase', async status => {
        payment.payment_status = status;
        const body = await (await get()).json(); expect(body.purchase).toBeNull(); expect(body.review).toBeNull();
    });
    it('rejects a changed amount, another payment owner or reconciliation-required snapshot', async () => {
        payment.amount_total = 1; expect((await (await get()).json()).purchase).toBeNull();
        payment.amount_total = 3090; payment.metadata.userId = 'other'; expect((await (await get()).json()).purchase).toBeNull();
        payment.metadata.userId = 'buyer'; checkout.status = 'reconciliation_required'; expect((await (await get()).json()).purchase).toBeNull();
    });
    it('supports the same hashed guest-owner contract', async () => {
        m.identity.mockResolvedValue({ userId: 'guest_fixture', guest: true });
        checkout.userId = order.userId = payment.metadata.userId = 'guest_fixture';
        expect((await (await get()).json()).purchase).not.toBeNull();
        expect(m.order).toHaveBeenCalledWith({ stripeSessionId: 'cs_fixture', userId: 'guest_fixture' });
    });
    it('returns a review payload only for an explicit verified delivery record', async () => {
        order.googleReviewDeliveryEstimate = { date: '2026-10-09', source: 'approved-fulfilment', verifiedAt: '2026-09-30T12:00:00Z' };
        expect((await (await get()).json()).review).toEqual({ merchant_id: 5861883835, order_id: 'ORD_cs_fixture',
            email: 'buyer@example.test', delivery_country: 'SG', estimated_delivery_date: '2026-10-09' });
    });
    it.each([{}, { date: '2026-10-09', source: 'feed-default' }, { date: '2026-02-30', source: 'approved', verifiedAt: new Date() }])('fails closed on incomplete or invalid review delivery data: %j', async estimate => {
        order.googleReviewDeliveryEstimate = estimate;
        expect((await (await get()).json()).review).toBeNull();
    });
    it('fails safely on a provider outage without logging order/customer data', async () => {
        m.retrieve.mockRejectedValue(new Error('PRIVATE provider response'));
        const response = await get(); expect(response.status).toBe(503);
        expect(JSON.stringify(await response.json())).not.toMatch(/PRIVATE|buyer/);
    });
});
