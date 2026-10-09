import { requireScope } from '@/lib/auth/scope';
import { dashboardDb, dashboardJson, dashboardError } from '@/lib/creatorDashboard/http';
import { listPrinters } from '@/lib/creatorDashboard/fleet';
import { scopeForView } from '@/lib/creatorDashboard/viewScope';
export async function GET(req) {
    try {
        const scope = await requireScope(); await dashboardDb();
        return dashboardJson({ printers: await listPrinters(await scopeForView(scope, new URL(req.url).searchParams.get('viewId'))) });
    } catch (error) { return dashboardError(error); }
}
