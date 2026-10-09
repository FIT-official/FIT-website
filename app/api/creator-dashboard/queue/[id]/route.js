import { requireScope } from '@/lib/auth/scope';
import { dashboardDb, dashboardJson, dashboardError } from '@/lib/creatorDashboard/http';
import { updateQueueJob, readQueueJob } from '@/lib/creatorDashboard/queue';
export async function GET(req, { params }) {
    try { const scope = await requireScope(); await dashboardDb(); return dashboardJson({ job: await readQueueJob(scope, (await params).id) }); }
    catch (error) { return dashboardError(error); }
}
export async function PATCH(req, { params }) {
    try { const scope = await requireScope(['owner', 'creator'], { write: true }); return dashboardJson({ job: await updateQueueJob(scope, (await params).id, await req.json()) }); }
    catch (error) { return dashboardError(error); }
}
