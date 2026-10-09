import { requireScope } from '@/lib/auth/scope';
import { reserveUploads, listUploads } from '@/lib/creatorDashboard/uploads';
import { dashboardJson, dashboardError } from '@/lib/creatorDashboard/http';
export async function GET() {
    try { return dashboardJson(await listUploads(await requireScope(['owner', 'creator', 'customer']))); }
    catch (error) { return dashboardError(error); }
}
export async function POST(req) {
    try {
        const scope = await requireScope(['owner', 'creator', 'customer'], { write: true });
        return dashboardJson(await reserveUploads(scope, await req.json()), 201);
    } catch (error) { return dashboardError(error); }
}
