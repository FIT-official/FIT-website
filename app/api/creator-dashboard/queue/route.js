import { requireScope } from '@/lib/auth/scope';
import { dashboardDb, dashboardJson, dashboardError } from '@/lib/creatorDashboard/http';
import { listQueue, createManualJob } from '@/lib/creatorDashboard/queue';
export async function GET() {
    try { const scope = await requireScope(); await dashboardDb(); return dashboardJson(await listQueue(scope)); }
    catch (error) { return dashboardError(error); }
}
export async function POST(req) {
    try { const scope = await requireScope(['owner'], { write: true }); const input = await req.json(); await dashboardDb(); return dashboardJson({ job: await createManualJob(scope, input) }, 201); }
    catch (error) { return dashboardError(error); }
}
