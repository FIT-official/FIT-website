import { pageScope } from '@/lib/creatorDashboard/pages';
import UploadsView from '@/components/CreatorDashboard/UploadsView';
export const dynamic = 'force-dynamic';
export default async function UploadsPage({ searchParams } = {}) {
    const scope = await pageScope();
    const storageLabel = scope.fixture ? 'storage: mock — needs Chairman approval for private bucket' : (await (await import('@/lib/creatorDashboard/uploadStorage')).uploadStorage()).label;
    const validation = scope.fixture && (await searchParams)?.validation === 'size'
        ? 'File exceeds its size limit. STL and 3MF files must be 100 MB or smaller.' : '';
    return <UploadsView fixture={scope.fixture} owner={scope.role === 'owner'} storageLabel={storageLabel} initialError={validation} />;
}
