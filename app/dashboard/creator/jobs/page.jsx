import { pageScope } from '@/lib/creatorDashboard/pages';
import QueueView from '@/components/CreatorDashboard/QueueView';
import { creatorJobProjection } from '@/lib/creatorDashboard/queueRules';
export const dynamic = 'force-dynamic';
export default async function JobStatusPage() {
    const scope = await pageScope(); let data;
    if (scope.fixture) { const { fixtureJobs } = await import('@/lib/creatorDashboard/fixtures'); data = { jobs: fixtureJobs.filter(job => job.storeId === scope.storeId).map(creatorJobProjection) }; }
    else { const { dashboardDb } = await import('@/lib/creatorDashboard/http'); await dashboardDb(); data = await (await import('@/lib/creatorDashboard/queue')).listQueue(scope); }
    return <QueueView initialJobs={JSON.parse(JSON.stringify(data.jobs))} owner={false} fixture={scope.fixture} />;
}
