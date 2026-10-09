// Called only after constructEvent succeeds in the existing Stripe endpoint.
import { randomBytes } from 'node:crypto';
import SubOrder from '@/models/SubOrder';
import Order from '@/models/Order';
import ProcessedStripeEvent from '@/models/ProcessedStripeEvent';
import { testPaymentsEnabled, DashboardError } from './flags';
import { notifyOrderStatus } from './notifications';

export function dashboardEventEnabled(event) {
    return testPaymentsEnabled() && event?.livemode === false;
}
export async function recordPaidSubOrders(event, order, snapshots, session) {
    if (!dashboardEventEnabled(event) || !['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type) || event.data.object.payment_status !== 'paid') {
        throw new DashboardError('Verified test payment required', 403);
    }
    await ProcessedStripeEvent.create([{ eventId: event.id, type: event.type }], { session });
    order.status = 'paid';
    order.statusHistory = [{ status: 'paid', timestamp: new Date(), updatedBy: 'stripe' }];
    order.trackingToken = randomBytes(16).toString('hex');
    order.creatorDashboard = true;
    const groups = new Map();
    for (const item of snapshots) {
        if (!item.creatorUserId) throw new DashboardError('Checkout seller is missing; reconciliation required', 409);
        const items = groups.get(item.creatorUserId) || [];
        items.push({ productId: item.productId, name: item.productName, qty: item.quantity,
            price: item.unitAmount / 100, productType: item.productType || (item.productPrintInput ? 'print' : 'shop') });
        groups.set(item.creatorUserId, items);
    }
    return SubOrder.create([...groups].map(([storeId, items]) => ({ orderId: order._id, storeId, items,
        status: 'paid', statusHistory: [{ status: 'paid', at: new Date(), by: 'stripe' }], fulfilment: 'fit' })), { session });
}

export async function recordRefund(event, database) {
    if (!dashboardEventEnabled(event)) return { received: true };
    const session = await database.startSession();
    let changed = false, order, duplicate = false;
    try {
        await session.withTransaction(async () => {
            changed = false;
            if (await ProcessedStripeEvent.findOne({ eventId: event.id }).session(session)) { duplicate = true; return; }
            const charge = event.data.object;
            order = await Order.findOne({ stripePaymentIntentId: charge.payment_intent, creatorDashboard: true }).session(session);
            if (!order) throw new DashboardError('Order not found; retry refund after checkout', 409);
            await ProcessedStripeEvent.create([{ eventId: event.id, type: event.type }], { session });
            // Partial refunds need item allocation, which is outside P0. Never mark them fully refunded.
            if (!charge.refunded || charge.amount_refunded < charge.amount) return;
            const result = await SubOrder.updateMany({ orderId: order._id, status: { $ne: 'refunded' } },
                { $set: { status: 'refunded' }, $push: { statusHistory: { status: 'refunded', at: new Date(), by: 'stripe' } } }, { session });
            changed = result.modifiedCount > 0;
            if (changed) {
                order.status = 'refunded';
                order.statusHistory.push({ status: 'refunded', timestamp: new Date(), updatedBy: 'stripe' });
                await order.save({ session });
            }
        });
    } catch (error) {
        if (error.code === 11000) return { received: true, duplicate: true };
        throw error;
    } finally { await session.endSession(); }
    if (changed) await notifyOrderStatus(order, 'refunded').catch(() => console.info('Creator refund notification failed'));
    return { received: true, ...(duplicate ? { duplicate: true } : {}) };
}
