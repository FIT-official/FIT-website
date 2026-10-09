import { notFound } from 'next/navigation';
import { dashboardEnabled, fixtureMode } from '@/lib/creatorDashboard/flags';
import { trackingProjection } from '@/lib/creatorDashboard/orderStatus';
import TrackingView from '@/components/CreatorDashboard/TrackingView';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Order tracking | Fix It Today', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default async function TrackingPage({ params }) {
    if (!dashboardEnabled()) notFound();
    const { token } = await params;
    let orders;
    if (fixtureMode()) {
        const { fixtureOrders, fixtureToken } = await import('@/lib/creatorDashboard/fixtures');
        orders = token === fixtureToken ? trackingProjection([fixtureOrders[0]]) : null;
    } else {
        const { findTracking } = await import('@/lib/creatorDashboard/orders');
        orders = await findTracking(token);
    }
    if (!orders) notFound();
    return <TrackingView orders={orders} fixture={fixtureMode()} />;
}
