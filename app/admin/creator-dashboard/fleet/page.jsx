import { pageScope, pageQueue } from '@/lib/creatorDashboard/pages';
import FleetView from '@/components/CreatorDashboard/FleetView';
export const dynamic = 'force-dynamic';
export default async function FleetPage() {
    const scope = await pageScope(true), data = await pageQueue(scope);
    return <FleetView initialPrinters={data.printers} initialJobs={data.jobs} owner fixture={scope.fixture} />;
}
