import { requireScope } from '@/lib/auth/scope';
import { dashboardDb, dashboardJson, dashboardError } from '@/lib/creatorDashboard/http';
import { readPrinter, fleetCard } from '@/lib/creatorDashboard/fleet';
export async function GET(req, { params }) {
    try { const scope = await requireScope(); await dashboardDb(); return dashboardJson({ printer: await fleetCard(await readPrinter(scope, (await params).id)) }); }
    catch (error) { return dashboardError(error); }
}
