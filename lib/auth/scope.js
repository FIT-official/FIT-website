import { auth, clerkClient } from '@clerk/nextjs/server';
import { DashboardError, requireDashboard, fixtureMode } from '@/lib/creatorDashboard/flags';

export function scopeFromUser(userId, user) {
    const raw = user?.publicMetadata?.role;
    const role = raw === 'admin' ? 'owner' : ['owner', 'staff', 'creator', 'customer'].includes(raw) ? raw : 'customer';
    // Existing storefront identity is the Clerk user ID. No client or user-editable metadata is used.
    return { role: userId ? role : null, userId: userId || null, storeId: userId || null };
}
export async function getScope(knownUserId) {
    const userId = knownUserId === undefined ? (await auth()).userId : knownUserId;
    if (!userId) return scopeFromUser(null, null);
    return scopeFromUser(userId, await (await clerkClient()).users.getUser(userId));
}
export function scopeQueryForStore(scope, query = {}) {
    if (!scope?.userId) throw new DashboardError('Unauthorized', 401);
    if (scope.role === 'owner') return { ...query, ...(scope.viewStoreId ? { storeId: scope.viewStoreId } : {}) };
    if (scope.role !== 'creator' || !scope.storeId) throw new DashboardError('Forbidden', 403);
    return { ...query, storeId: scope.storeId };
}
export async function requireScope(roles = ['owner', 'creator'], options = {}) {
    requireDashboard(options);
    if (fixtureMode()) throw new DashboardError('Fixture mode uses local sample data only', 409);
    const scope = await getScope();
    if (!scope.userId) throw new DashboardError('Unauthorized', 401);
    if (!roles.includes(scope.role)) throw new DashboardError('Forbidden', 403);
    return scope;
}
