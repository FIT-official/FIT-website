import OrdersView from '@/components/CreatorDashboard/OrdersView';
import { pageScope, pageOrders } from '@/lib/creatorDashboard/pages';
export const dynamic = 'force-dynamic';
export default async function OwnerOrders() {
    const scope = await pageScope(true);
    return <OrdersView initialOrders={await pageOrders(scope)} owner fixture={scope.fixture} />;
}
