import { notFound, redirect } from 'next/navigation';
import { dashboardEnabled, fixtureMode } from './flags';
import { getScope } from '@/lib/auth/scope';
export async function pageScope(owner = false) {
    if (!dashboardEnabled()) notFound();
    if (fixtureMode()) return { role: owner ? 'owner' : 'creator', userId: 'user_demo_maker', storeId: 'user_demo_maker', fixture: true };
    const scope = await getScope();
    if (!scope.userId) redirect('/sign-in');
    if (!(owner ? ['owner'] : ['owner', 'creator']).includes(scope.role)) notFound();
    return scope;
}
export async function pageOrders(scope) {
    if (scope.fixture) {
        const { fixtureOrders } = await import('./fixtures');
        return fixtureOrders.filter(order => scope.role === 'owner' || order.storeId === scope.storeId);
    }
    const { dashboardDb } = await import('./http');
    const { scopeQueryForStore } = await import('@/lib/auth/scope');
    const { default: SubOrder } = await import('@/models/SubOrder');
    await dashboardDb();
    return JSON.parse(JSON.stringify(await SubOrder.find(scopeQueryForStore(scope)).sort({ createdAt: -1 }).limit(200).lean()));
}
