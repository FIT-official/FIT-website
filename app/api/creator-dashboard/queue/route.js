import { requireScope } from '@/lib/auth/scope';
import { dashboardDb, dashboardJson, dashboardError } from '@/lib/creatorDashboard/http';
import { listQueue, createManualJob } from '@/lib/creatorDashboard/queue';
import { scopeForView } from '@/lib/creatorDashboard/viewScope';
export async function GET(req) {
    try { const scope = await requireScope(); await dashboardDb(); return dashboardJson(await listQueue(await scopeForView(scope, req && new URL(req.url).searchParams.get('viewId')))); }
    catch (error) { return dashboardError(error); }
}
export async function POST(req) {
    try { const scope = await requireScope(['owner', 'creator'], { write: true }); const input = await req.json(); await dashboardDb(); return dashboardJson({ job: await createManualJob(scope, input) }, 201); }
    catch (error) { return dashboardError(error); }
}
