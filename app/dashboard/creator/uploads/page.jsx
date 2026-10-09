import { pageScope } from '@/lib/creatorDashboard/pages';
import UploadsView from '@/components/CreatorDashboard/UploadsView';
export const dynamic = 'force-dynamic';
export default async function UploadsPage() {
    const scope = await pageScope();
    const storageLabel = scope.fixture ? 'storage: mock — needs Chairman approval for private bucket' : (await (await import('@/lib/creatorDashboard/uploadStorage')).uploadStorage()).label;
    return <UploadsView fixture={scope.fixture} owner={scope.role === 'owner'} storageLabel={storageLabel} />;
}
