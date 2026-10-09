import { pageScope } from '@/lib/creatorDashboard/pages';
import MaterialsView from '@/components/CreatorDashboard/MaterialsView';
export const dynamic = 'force-dynamic';
export default async function MaterialsPage() {
    const scope = await pageScope(true);
    const initial = scope.fixture ? { source: 'fixture', checkedAt: '2026-10-09', issues: [], materials: [
        { sku: 'DEMO-PLA', name: 'PLA Matte', brand: 'Sample filament', colour: 'Forest Green', sheetQuantity: 3 },
    ] } : await (await import('@/lib/creatorDashboard/materials')).readMaterials();
    return <MaterialsView initial={initial} fixture={scope.fixture} />;
}
