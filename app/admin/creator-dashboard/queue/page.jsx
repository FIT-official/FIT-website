import { pageScope } from '@/lib/creatorDashboard/pages';
import QueueView from '@/components/CreatorDashboard/QueueView';
export const dynamic = 'force-dynamic';
export default async function QueuePage() {
    const scope = await pageScope(true); let data;
    if (scope.fixture) { const { fixtureJobs, manualPrinters } = await import('@/lib/creatorDashboard/fixtures'); data = { jobs: fixtureJobs, printers: manualPrinters }; }
    else { const { dashboardDb } = await import('@/lib/creatorDashboard/http'); await dashboardDb(); data = await (await import('@/lib/creatorDashboard/queue')).listQueue(scope); }
    return <QueueView initialJobs={JSON.parse(JSON.stringify(data.jobs))} printers={data.printers} fixture={scope.fixture} />;
}
