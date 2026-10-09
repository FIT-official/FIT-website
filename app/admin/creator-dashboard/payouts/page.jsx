import { pageScope, pageOrders } from '@/lib/creatorDashboard/pages';
import { summarizePayouts } from '@/lib/creator/payoutMath';
import PayoutsView from '@/components/CreatorDashboard/PayoutsView';
export const dynamic = 'force-dynamic';
export default async function PayoutsPage() {
    const scope = await pageScope(true);
    return <PayoutsView initial={summarizePayouts(await pageOrders(scope))} owner fixture={scope.fixture} />;
}
