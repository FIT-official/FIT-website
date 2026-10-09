import AuditLog from '@/models/AuditLog';
import { DashboardError } from './flags';

// A filter is valid only after the owner's View as action has written an audit row.
// It does not impersonate a creator or change the owner's permissions.
export async function scopeForView(scope, viewId) {
    if (!viewId || scope.role !== 'owner') return scope;
    if (!/^[a-f0-9]{24}$/i.test(viewId)) throw new DashboardError('Invalid view', 400);
    const audit = await AuditLog.findOne({ _id: viewId, actorId: scope.userId, action: 'view_as_creator' }).lean();
    if (!audit) throw new DashboardError('View not found', 403);
    return { ...scope, viewStoreId: audit.storeId };
}
