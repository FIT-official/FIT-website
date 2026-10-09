import OrdersView from '@/components/CreatorDashboard/OrdersView';
import { pageScope, pageOrders } from '@/lib/creatorDashboard/pages';
export const dynamic = 'force-dynamic';
export default async function OrdersPage() {
    const scope = await pageScope();
    return <OrdersView initialOrders={await pageOrders(scope)} owner={scope.role === 'owner'} fixture={scope.fixture} />;
}
