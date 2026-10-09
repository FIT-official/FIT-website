import { requireScope, scopeQueryForStore } from '@/lib/auth/scope';
import SubOrder from '@/models/SubOrder';
import { scopeForView } from '@/lib/creatorDashboard/viewScope';
import { dashboardDb, dashboardJson, dashboardError } from '@/lib/creatorDashboard/http';
import { summarizePayouts } from '@/lib/creator/payoutMath';
export async function GET(req) {
    try {
        const scope = await requireScope(); await dashboardDb();
        const view = await scopeForView(scope, new URL(req.url).searchParams.get('viewId'));
        const rows = await SubOrder.find(scopeQueryForStore(view)).sort({ createdAt: -1 }).limit(200).lean();
        return dashboardJson(summarizePayouts(rows));
    } catch (error) { return dashboardError(error); }
}
