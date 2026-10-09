import { requireScope, scopeQueryForStore } from '@/lib/auth/scope';
import SubOrder from '@/models/SubOrder';
import AuditLog from '@/models/AuditLog';
import { dashboardDb, dashboardJson, dashboardError } from '@/lib/creatorDashboard/http';
export const dynamic = 'force-dynamic';
export async function GET(req) {
    try {
        const scope = await requireScope();
        const params = new URL(req.url).searchParams;
        await dashboardDb();
        let query = scopeQueryForStore(scope);
        if (scope.role === 'owner' && params.get('viewId')) {
            if (!/^[a-f0-9]{24}$/i.test(params.get('viewId'))) return dashboardJson({ error: 'Invalid view' }, 400);
            const audit = await AuditLog.findOne({ _id: params.get('viewId'), actorId: scope.userId, action: 'view_as_creator' }).lean();
            if (!audit) return dashboardJson({ error: 'View not found' }, 403);
            query = { storeId: audit.storeId };
        }
        const orders = await SubOrder.find(query).sort({ createdAt: -1 }).limit(200).lean();
        return dashboardJson({ orders });
    } catch (error) { return dashboardError(error); }
}
