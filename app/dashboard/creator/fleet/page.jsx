import { pageScope, pageQueue } from '@/lib/creatorDashboard/pages';
import FleetView from '@/components/CreatorDashboard/FleetView';
export const dynamic = 'force-dynamic';
export default async function FleetPage() {
    const scope = await pageScope(), data = await pageQueue(scope);
    return <FleetView initialPrinters={data.printers} initialJobs={data.jobs} fixture={scope.fixture} />;
}
