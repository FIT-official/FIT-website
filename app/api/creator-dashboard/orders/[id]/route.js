import { requireScope } from '@/lib/auth/scope';
import { dashboardDb, dashboardJson, dashboardError } from '@/lib/creatorDashboard/http';
import { ownedSubOrder, changeSubOrderStatus } from '@/lib/creatorDashboard/orders';
export async function GET(_req, { params }) {
    try {
        const scope = await requireScope(); await dashboardDb();
        return dashboardJson({ order: await ownedSubOrder(scope, (await params).id) });
    } catch (error) { return dashboardError(error); }
}
export async function PATCH(req, { params }) {
    try {
        const scope = await requireScope(['owner', 'creator'], { write: true });
        const { status } = await req.json(); await dashboardDb();
        return dashboardJson({ order: await changeSubOrderStatus(scope, (await params).id, status) });
    } catch (error) { return dashboardError(error); }
}
