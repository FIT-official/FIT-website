import { requireScope } from '@/lib/auth/scope';
import { completeUpload, issueDownload } from '@/lib/creatorDashboard/uploads';
import { dashboardJson, dashboardError } from '@/lib/creatorDashboard/http';
export async function POST(_req, { params }) {
    try { const scope = await requireScope(['owner', 'creator', 'customer'], { write: true }); return dashboardJson(await completeUpload(scope, (await params).id)); }
    catch (error) { return dashboardError(error); }
}
export async function GET(req, { params }) {
    try { const scope = await requireScope(['owner', 'creator', 'customer']); return dashboardJson(await issueDownload(scope, (await params).id, new URL(req.url).searchParams.get('thumbnail') === 'true')); }
    catch (error) { return dashboardError(error); }
}
