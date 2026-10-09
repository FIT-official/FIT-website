// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ role: 'owner', read: vi.fn() }));
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_A' }), clerkClient: async () => ({ users: { getUser: async () => ({ publicMetadata: { role: f.role } }) } }) }));
vi.mock('@/lib/bulkFilamentStock', () => ({ loadBulkStock: f.read }));
import { GET } from '@/app/api/creator-dashboard/materials/route';
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('CREATOR_DASHBOARD_ENABLED', 'true'); vi.stubEnv('CREATOR_DASHBOARD_FIXTURES', 'false'); f.role = 'owner'; });
it('owner reads existing Sheet reader, malformed rows produce sync issues', async () => {
    f.read.mockResolvedValue({ source: 'sheet', checkedAt: '2026-10-09', rows: [
        { product: 'PLA', brand: 'Demo', colour: 'Green', material: 'PLA', quantity: 3 },
        { product: 'Bad', brand: 'Demo', colour: 'Green', material: 'PLA', quantity: 'NaN' },
    ] });
    const res = await GET(), data = await res.json(); expect(res.status).toBe(200); expect(data.materials).toHaveLength(1); expect(data.issues).toHaveLength(1); expect(f.read).toHaveBeenCalledTimes(1);
});
it('creators cannot see stock or invoke Sheet access', async () => { f.role = 'creator'; expect((await GET()).status).toBe(403); expect(f.read).not.toHaveBeenCalled(); });
it('flag off and fixture API never invoke Sheet access', async () => {
    vi.stubEnv('CREATOR_DASHBOARD_ENABLED', 'false'); expect((await GET()).status).toBe(404);
    vi.stubEnv('CREATOR_DASHBOARD_ENABLED', 'true'); vi.stubEnv('CREATOR_DASHBOARD_FIXTURES', 'true'); expect((await GET()).status).toBe(409); expect(f.read).not.toHaveBeenCalled();
});
