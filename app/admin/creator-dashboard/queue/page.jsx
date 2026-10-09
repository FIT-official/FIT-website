import { pageScope, pageQueue } from '@/lib/creatorDashboard/pages';
import QueueView from '@/components/CreatorDashboard/QueueView';
export const dynamic = 'force-dynamic';
export default async function QueuePage() {
    const scope = await pageScope(true), data = await pageQueue(scope);
    return <QueueView initialJobs={JSON.parse(JSON.stringify(data.jobs))} printers={data.printers} fixture={scope.fixture} />;
}
