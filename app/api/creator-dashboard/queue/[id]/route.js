import { requireScope } from '@/lib/auth/scope';
import { dashboardJson, dashboardError } from '@/lib/creatorDashboard/http';
import { updateQueueJob } from '@/lib/creatorDashboard/queue';
export async function PATCH(req, { params }) {
    try { const scope = await requireScope(['owner'], { write: true }); return dashboardJson({ job: await updateQueueJob(scope, (await params).id, await req.json()) }); }
    catch (error) { return dashboardError(error); }
}
