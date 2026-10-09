import OrdersView from '@/components/CreatorDashboard/OrdersView';
import { pageScope, pageOrders } from '@/lib/creatorDashboard/pages';
export const dynamic = 'force-dynamic';
export default async function OwnerDashboard() {
    const scope = await pageScope(true);
    let overviewData;
    if (scope.fixture) { const { fixtureJobs, manualPrinters } = await import('@/lib/creatorDashboard/fixtures'); overviewData = { jobs: fixtureJobs, printers: manualPrinters }; }
    else { const { dashboardDb } = await import('@/lib/creatorDashboard/http'); await dashboardDb(); overviewData = JSON.parse(JSON.stringify(await (await import('@/lib/creatorDashboard/queue')).listQueue(scope))); }
    return <OrdersView overviewData={overviewData} initialOrders={await pageOrders(scope)} owner fixture={scope.fixture} overview />;
}
