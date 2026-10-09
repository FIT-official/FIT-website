import OrdersView from '@/components/CreatorDashboard/OrdersView';
import { pageScope, pageOrders, pageQueue } from '@/lib/creatorDashboard/pages';
export const dynamic = 'force-dynamic';
export default async function OwnerDashboard() {
    const scope = await pageScope(true);
    const overviewData = await pageQueue(scope);
    return <OrdersView overviewData={overviewData} initialOrders={await pageOrders(scope)} owner fixture={scope.fixture} overview />;
}
