import { randomUUID } from 'node:crypto';
import PrintJob from '@/models/PrintJob';
import SubOrder from '@/models/SubOrder';
import Order from '@/models/Order';
import { scopeQueryForStore } from '@/lib/auth/scope';
import { DashboardError, requireDashboard } from './flags';
import { dashboardDb } from './http';
import { manualPrinters } from './fixtures';
import { queueChange, creatorJobProjection } from './queueRules';
import { notifyOrderStatus } from './notifications';
function ownerOnly(scope) {
    requireDashboard({ write: true });
    if (scope.role !== 'owner') throw new DashboardError('Forbidden', 403);
}
export async function queuePaidSubOrders(subOrders, session) {
    requireDashboard({ write: true });
    for (const sub of subOrders) {
        const items = sub.items.filter(item => item.productType === 'print');
        if (!items.length) continue;
        const [job] = await PrintJob.create([{ source: { type: 'creator', refId: String(sub._id) }, storeId: sub.storeId,
            name: items.map(item => item.name).join(', '), qty: items.reduce((sum, item) => sum + item.qty, 0),
            status: 'queued', statusHistory: [{ status: 'queued', by: 'stripe', at: new Date() }] }], { session });
        await SubOrder.updateOne({ _id: sub._id, storeId: sub.storeId }, { $set: { 'items.$[print].printJobId': String(job._id) } },
            { session, arrayFilters: [{ 'print.productType': 'print' }] });
    }
}
export async function listQueue(scope) {
    requireDashboard();
    let query = scopeQueryForStore(scope);
    if (scope.role === 'creator') {
        const owned = await SubOrder.find(scopeQueryForStore(scope)).select('_id').limit(200).lean();
        query = scopeQueryForStore(scope, { 'source.type': 'creator', 'source.refId': { $in: owned.map(sub => String(sub._id)) } });
    }
    const jobs = await PrintJob.find(query).sort({ priority: -1, position: 1, createdAt: 1 }).limit(200).lean();
    return scope.role === 'owner' ? { jobs, printers: manualPrinters, fleet: 'mock / manual list' } : { jobs: jobs.map(creatorJobProjection) };
}
export async function createManualJob(scope, input) {
    ownerOnly(scope);
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 160 || !Number.isInteger(input.qty) || input.qty < 1 || input.qty > 10000) throw new DashboardError('Enter a name and quantity from 1 to 10,000');
    const optional = queueChange({ status: 'queued' }, { priority: input.priority, dueAt: input.dueAt, estMinutes: input.estMinutes, estGrams: input.estGrams }, []);
    return PrintJob.create({ name: input.name.trim(), qty: input.qty, source: { type: 'shop', refId: `manual-${randomUUID()}` },
        storeId: scope.storeId, status: 'queued', ...optional, materialSku: String(input.materialSku || '').slice(0, 100),
        notes: String(input.notes || '').slice(0, 2000), statusHistory: [{ status: 'queued', at: new Date(), by: scope.userId }] });
}
export async function updateQueueJob(scope, id, input) {
    ownerOnly(scope);
    if (!/^[a-f0-9]{24}$/i.test(id || '')) throw new DashboardError('Job not found', 404);
    const database = await dashboardDb(), session = await database.startSession();
    let result, notification;
    try {
        await session.withTransaction(async () => {
            notification = null;
            const job = await PrintJob.findById(id).session(session).lean();
            if (!job) throw new DashboardError('Job not found', 404);
            if (input.direction) {
                if (!['up', 'down'].includes(input.direction)) throw new DashboardError('Invalid direction');
                const rows = await PrintJob.find({ priority: job.priority }).sort({ position: 1, createdAt: 1, _id: 1 }).limit(200).session(session).lean();
                const index = rows.findIndex(row => String(row._id) === id), next = index + (input.direction === 'up' ? -1 : 1);
                if (index >= 0 && next >= 0 && next < rows.length) {
                    [rows[index], rows[next]] = [rows[next], rows[index]];
                    await PrintJob.bulkWrite(rows.map((row, position) => ({ updateOne: { filter: { _id: row._id }, update: { $set: { position } } } })), { session });
                }
                result = job; return;
            }
            const updates = queueChange(job, input, manualPrinters.map(printer => printer._id));
            const changed = updates.status && updates.status !== job.status;
            result = await PrintJob.findOneAndUpdate({ _id: id, status: job.status }, { $set: updates,
                ...(changed ? { $push: { statusHistory: { status: updates.status, at: new Date(), by: scope.userId, note: String(input.reason || '').slice(0, 1000) } } } : {}) }, { new: true, runValidators: true, session }).lean();
            if (!result) throw new DashboardError('Job changed; refresh and retry', 409);
            if (changed && updates.status === 'failed') {
                await PrintJob.create([{ source: job.source, storeId: job.storeId, name: job.name, qty: job.qty, uploadIds: job.uploadIds,
                    materialSku: job.materialSku, estMinutes: job.estMinutes, estGrams: job.estGrams, priority: job.priority, dueAt: job.dueAt,
                    reprintOf: id, attempt: (job.attempt || 0) + 1, status: 'queued', notes: `Reprint: ${String(input.reason).slice(0, 1000)}`,
                    statusHistory: [{ status: 'queued', at: new Date(), by: scope.userId, note: `Reprint of ${id}` }] }], { session });
            }
            if (changed && ['printing', 'done'].includes(updates.status) && job.source.type === 'creator') {
                const status = updates.status === 'printing' ? 'in_production' : 'qc';
                const remaining = updates.status === 'done' ? await PrintJob.exists({ 'source.refId': job.source.refId, status: { $nin: ['done', 'failed'] } }).session(session) : false;
                if (!remaining) {
                    const sub = await SubOrder.findOneAndUpdate({ _id: job.source.refId, storeId: job.storeId, status: { $in: status === 'qc' ? ['paid', 'in_production'] : ['paid'] } },
                        { $set: { status }, $push: { statusHistory: { status, at: new Date(), by: scope.userId } } }, { new: true, session }).lean();
                    if (sub) notification = { orderId: sub.orderId, status };
                }
            }
        });
    } finally { await session.endSession(); }
    if (notification) {
        const order = await Order.findById(notification.orderId).select('customerEmail').lean();
        await notifyOrderStatus(order, notification.status).catch(() => console.info('Queue status notification failed'));
    }
    return result;
}
