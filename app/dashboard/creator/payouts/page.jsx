import { pageScope, pageOrders } from '@/lib/creatorDashboard/pages';
import { summarizePayouts } from '@/lib/creator/payoutMath';
import PayoutsView from '@/components/CreatorDashboard/PayoutsView';
export const dynamic = 'force-dynamic';
export default async function PayoutsPage() {
    const scope = await pageScope();
    return <PayoutsView initial={summarizePayouts(await pageOrders(scope))} fixture={scope.fixture} />;
}
