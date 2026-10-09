import { pageScope, pageQueue } from '@/lib/creatorDashboard/pages';
import QueueView from '@/components/CreatorDashboard/QueueView';
export const dynamic = 'force-dynamic';
export default async function JobStatusPage() {
    const scope = await pageScope(), data = await pageQueue(scope);
    return <QueueView initialJobs={data.jobs} printers={data.printers} owner={false} fixture={scope.fixture} />;
}
