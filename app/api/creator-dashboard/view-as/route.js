import { clerkClient } from '@clerk/nextjs/server';
import { requireScope } from '@/lib/auth/scope';
import AuditLog from '@/models/AuditLog';
import { dashboardDb, dashboardJson, dashboardError } from '@/lib/creatorDashboard/http';

export async function POST(req) {
    try {
        const scope = await requireScope(['owner'], { write: true });
        const { storeId } = await req.json();
        if (typeof storeId !== 'string' || !/^user_[a-zA-Z0-9_-]{1,100}$/.test(storeId)) return dashboardJson({ error: 'Invalid creator' }, 400);
        const creator = await (await clerkClient()).users.getUser(storeId);
        if (creator?.publicMetadata?.role !== 'creator') return dashboardJson({ error: 'Creator not found' }, 404);
        await dashboardDb();
        const audit = await AuditLog.create({ actorId: scope.userId, action: 'view_as_creator', storeId });
        // A view is a read-only filter for an owner, never an impersonated session or role change.
        return dashboardJson({ viewId: String(audit._id), storeId });
    } catch (error) { return dashboardError(error); }
}
