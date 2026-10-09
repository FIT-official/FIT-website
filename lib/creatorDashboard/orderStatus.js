import { DashboardError } from './flags';
export const transitions = {
    paid: ['in_production', 'cancelled'], in_production: ['qc', 'cancelled'],
    qc: ['in_production', 'ready', 'shipped', 'cancelled'], ready: ['shipped', 'delivered', 'cancelled'],
    shipped: ['delivered'], delivered: [], cancelled: [], refunded: [],
};
export function assertStatusChange(from, to) {
    if (!Object.hasOwn(transitions, to) || to === 'paid' || to === 'refunded') throw new DashboardError('Payment states require a verified Stripe webhook', 403);
    if (from !== to && !transitions[from]?.includes(to)) throw new DashboardError('Invalid status transition', 400);
}
export function trackingProjection(subOrders) {
    return subOrders.map(order => ({
        status: order.status,
        items: order.items.map(item => ({ name: item.name, qty: item.qty })),
        statusHistory: order.statusHistory.map(entry => ({ status: entry.status, at: entry.at })),
    }));
}
