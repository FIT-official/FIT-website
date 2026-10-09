import SubOrder from '@/models/SubOrder';
import Order from '@/models/Order';
import { scopeQueryForStore } from '@/lib/auth/scope';
import { requireDashboard, DashboardError } from './flags';
import { assertStatusChange, trackingProjection } from './orderStatus';
import { notifyOrderStatus } from './notifications';
import { dashboardDb } from './http';

export async function ownedSubOrder(scope, id) {
    if (!/^[a-f0-9]{24}$/i.test(id || '')) throw new DashboardError('Forbidden', 403);
    const sub = await SubOrder.findOne(scopeQueryForStore(scope, { _id: id })).lean();
    if (!sub) throw new DashboardError('Forbidden', 403);
    return sub;
}
export async function changeSubOrderStatus(scope, id, status) {
    requireDashboard({ write: true });
    const sub = await ownedSubOrder(scope, id);
    if (scope.role === 'creator' && sub.fulfilment !== 'creator') throw new DashboardError('FIT fulfils this order', 403);
    assertStatusChange(sub.status, status);
    if (sub.status === status) return sub;
    const updated = await SubOrder.findOneAndUpdate(scopeQueryForStore(scope, { _id: id, status: sub.status }),
        { $set: { status }, $push: { statusHistory: { status, at: new Date(), by: scope.userId } } }, { new: true, runValidators: true }).lean();
    if (!updated) throw new DashboardError('Order changed; refresh and try again', 409);
    const order = await Order.findById(sub.orderId).select('customerEmail').lean();
    await notifyOrderStatus(order, status).catch(() => console.info('Creator status notification failed'));
    return updated;
}
export async function findTracking(token) {
    requireDashboard();
    if (!/^[a-f0-9]{32}$/.test(token || '')) return null;
    await dashboardDb();
    const order = await Order.findOne({ trackingToken: token, creatorDashboard: true }).select('_id').lean();
    if (!order) return null;
    const subOrders = await SubOrder.find({ orderId: order._id }).lean();
    return trackingProjection(subOrders);
}
