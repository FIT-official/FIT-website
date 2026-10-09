import { notFound, redirect } from 'next/navigation';
import { dashboardEnabled, fixtureMode } from './flags';
import { getScope, scopeQueryForStore } from '@/lib/auth/scope';
export async function pageScope(owner = false) {
    if (!dashboardEnabled()) notFound();
    if (fixtureMode()) return { role: owner ? 'owner' : 'creator', userId: 'user_demo_maker', storeId: 'user_demo_maker', fixture: true };
    const scope = await getScope();
    if (!scope.userId) redirect('/sign-in');
    if (!(owner ? ['owner'] : ['owner', 'creator']).includes(scope.role)) notFound();
    return scope;
}
export async function pageQueue(scope) {
    if (scope.fixture) {
        const { fixtureJobs, manualPrinters } = await import('./fixtures');
        const { fleetCard } = await import('./fleet');
        const query = scopeQueryForStore(scope);
        const owned = row => !query.storeId || row.storeId === query.storeId;
        return { jobs: fixtureJobs.filter(owned), printers: await Promise.all(manualPrinters.filter(owned).map(fleetCard)) };
    }
    const { dashboardDb } = await import('./http'); await dashboardDb();
    return JSON.parse(JSON.stringify(await (await import('./queue')).listQueue(scope)));
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
