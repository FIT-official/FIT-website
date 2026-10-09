import { requireScope } from '@/lib/auth/scope';
import { dashboardJson, dashboardError } from '@/lib/creatorDashboard/http';
export async function GET() {
    try { await requireScope(['owner']); return dashboardJson(await (await import('@/lib/creatorDashboard/materials')).readMaterials()); }
    catch (error) { return dashboardError(error); }
}
