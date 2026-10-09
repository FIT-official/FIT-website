import { requireScope, scopeQueryForStore } from '@/lib/auth/scope';
import SubOrder from '@/models/SubOrder';
import { scopeForView } from '@/lib/creatorDashboard/viewScope';
import { dashboardDb, dashboardJson, dashboardError } from '@/lib/creatorDashboard/http';
export const dynamic = 'force-dynamic';
export async function GET(req) {
    try {
        const scope = await requireScope();
        const params = new URL(req.url).searchParams;
        await dashboardDb();
        const query = scopeQueryForStore(await scopeForView(scope, params.get('viewId')));
        const orders = await SubOrder.find(query).sort({ createdAt: -1 }).limit(200).lean();
        return dashboardJson({ orders });
    } catch (error) { return dashboardError(error); }
}
