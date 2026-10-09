// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), getUser: vi.fn(), db: vi.fn(), find: vi.fn(), audit: vi.fn(), create: vi.fn() }));
vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth, clerkClient: async () => ({ users: { getUser: mocks.getUser } }) }));
vi.mock('@/lib/db', () => ({ connectToDatabase: mocks.db }));
vi.mock('@/models/SubOrder', () => ({ default: { find: mocks.find } }));
vi.mock('@/models/AuditLog', () => ({ default: { create: mocks.audit } }));
vi.mock('@/models/Product', () => ({ default: { create: mocks.create } }));
vi.mock('@/models/User', () => ({ default: {} }));
vi.mock('@/lib/s3', () => ({ s3: {} }));
vi.mock('@/lib/categoriesHelper', () => ({ getAllCategoriesServer: vi.fn(), getAllSubcategoriesServer: vi.fn() }));
vi.mock('@/lib/creatorQuota', () => ({ reserveCreatorQuota: vi.fn(), releaseProductQuota: vi.fn(), CreatorQuotaError: class extends Error {} }));
import { getScope, scopeQueryForStore } from '@/lib/auth/scope';
import { creatorProductInput } from '@/lib/creatorDashboard/productPolicy';
import { isPublicCreator, publicCreatorFilter } from '@/lib/creatorDashboard/directory';
import { GET } from '@/app/api/orders/route';
import { POST as viewAs } from '@/app/api/creator-dashboard/view-as/route';
import { POST as product, PUT as editProduct } from '@/app/api/product/route';
beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv('CREATOR_DASHBOARD_ENABLED', 'true'); vi.stubEnv('CREATOR_DASHBOARD_FIXTURES', 'false');
    mocks.auth.mockResolvedValue({ userId: 'user_A' });
    mocks.getUser.mockResolvedValue({ publicMetadata: { role: 'creator' } });
    mocks.find.mockImplementation(query => ({ sort: () => ({ limit: () => ({ lean: async () => [{ storeId: query.storeId }] }) }) }));
});
describe('creator roles and boundaries', () => {
    it('creator GET orders ignores another storeId and queries only session store', async () => {
        const res = await GET(new Request('https://fit.test/api/orders?storeId=user_B'));
        expect(res.status).toBe(200); expect(mocks.find).toHaveBeenCalledWith({ storeId: 'user_A' });
        expect((await res.json()).orders).toEqual([{ storeId: 'user_A' }]);
    });
    it.each([product, editProduct])('creator electronics create/update returns 403 with no DB or product write', async handler => {
        const res = await handler(new Request('https://fit.test/api/product?productId=other', { method: 'POST', body: JSON.stringify({ category: 'electronics' }) }));
        expect(res.status).toBe(403); expect(mocks.db).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
    });
    it('forces the existing print type and validates named print categories', () => {
        expect(creatorProductInput({}, { role: 'creator' })).toMatchObject({ productType: 'print', category: 0, categoryId: 'Trending Prints' });
        expect(() => creatorProductInput({ categoryId: 'Electronics' }, { role: 'creator' })).toThrow();
    });
    it('signed-out scope skips all Clerk role lookups', async () => {
        mocks.auth.mockResolvedValue({ userId: null }); expect(await getScope()).toEqual({ role: null, userId: null, storeId: null });
        expect(mocks.getUser).not.toHaveBeenCalled();
    });
    it('scope cannot be widened with a client store filter', () => {
        expect(scopeQueryForStore({ role: 'creator', userId: 'user_A', storeId: 'user_A' }, { storeId: 'user_B' })).toEqual({ storeId: 'user_A' });
    });
    it('excludes configured FIT owner and role-based house accounts', () => {
        vi.stubEnv('FIT_OWNER_USER_ID', 'user_house');
        expect(publicCreatorFilter()).toMatchObject({ userId: { $ne: 'user_house' } });
        expect(isPublicCreator({ userId: 'user_house' })).toBe(false);
        expect(isPublicCreator({ userId: 'other', metadata: { role: 'owner' } })).toBe(false);
        expect(isPublicCreator({ userId: 'user_A', metadata: { role: 'Creator' } })).toBe(true);
    });
    it('owner View as creates an audit row for each session', async () => {
        mocks.getUser.mockImplementation(async id => ({ publicMetadata: { role: id === 'user_A' ? 'owner' : 'creator' } }));
        mocks.audit.mockResolvedValue({ _id: 'audit' });
        for (let i = 0; i < 2; i++) expect((await viewAs(new Request('https://fit.test/api/creator-dashboard/view-as', { method: 'POST', body: JSON.stringify({ storeId: 'user_B' }) }))).status).toBe(200);
        expect(mocks.audit).toHaveBeenCalledTimes(2);
        expect(mocks.audit).toHaveBeenCalledWith({ actorId: 'user_A', action: 'view_as_creator', storeId: 'user_B' });
    });
    it.each(['', 'TRUE', '1', 'false'])('flag %s refuses reads and audit writes before DB/auth', async flag => {
        vi.stubEnv('CREATOR_DASHBOARD_ENABLED', flag);
        expect((await GET(new Request('https://fit.test/api/orders'))).status).toBe(404);
        expect((await viewAs(new Request('https://fit.test/api/creator-dashboard/view-as', { method: 'POST' }))).status).toBe(404);
        expect(mocks.db).not.toHaveBeenCalled(); expect(mocks.auth).not.toHaveBeenCalled();
    });
});
