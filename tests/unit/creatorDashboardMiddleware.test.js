// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ getUser: vi.fn(), auth: vi.fn() }));
vi.mock('@clerk/nextjs/server', () => ({
    clerkMiddleware: handler => handler,
    createRouteMatcher: patterns => req => patterns.some(pattern => new RegExp(`^${pattern}$`).test(new URL(req.url).pathname)),
    clerkClient: async () => ({ users: { getUser: f.getUser } }), auth: f.auth,
}));
import middleware from '@/middleware';
import { localFixtureRuntime } from '@/lib/creatorDashboard/previewRuntime.mjs';
const request = path => new Request(`https://fit.test${path}`);
beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv('CREATOR_DASHBOARD_ENABLED', 'true'); vi.stubEnv('CREATOR_DASHBOARD_FIXTURES', 'false');
    vi.stubEnv('NODE_ENV', 'test'); f.auth.mockResolvedValue({ userId: 'user_A', sessionClaims: { metadata: { role: 'owner' } } });
    f.getUser.mockResolvedValue({ publicMetadata: { role: 'creator' } });
});
it('server Clerk role overrides forged owner claims in middleware', async () => {
    expect((await middleware(f.auth, request('/admin/creator-dashboard'))).status).toBe(403);
    expect((await middleware(f.auth, request('/dashboard/creator/orders'))).status).toBe(200);
});
it('off flag hides dashboard, APIs and tracking without role lookups', async () => {
    vi.stubEnv('CREATOR_DASHBOARD_ENABLED', 'false');
    for (const path of ['/dashboard/creator/orders', '/api/orders', '/api/creator-dashboard/uploads', '/track/test']) expect((await middleware(f.auth, request(path))).status).toBe(404);
    expect(f.auth).not.toHaveBeenCalled(); expect(f.getUser).not.toHaveBeenCalled();
});
it('preview fixture pages have isolated layout headers and no auth queries', async () => {
    vi.stubEnv('CREATOR_DASHBOARD_FIXTURES', 'true');
    const res = await middleware(f.auth, request('/dashboard/creator/orders'));
    expect(res.headers.get('x-middleware-request-x-fit-creator-surface')).toBe('dashboard'); expect(f.auth).not.toHaveBeenCalled();
});
it('tracking bypasses account lookup and selects the layout without analytics', async () => {
    const res = await middleware(f.auth, request('/track/1234567890abcdef1234567890abcdef'));
    expect(res.headers.get('x-middleware-request-x-fit-creator-surface')).toBe('tracking'); expect(f.auth).not.toHaveBeenCalled();
});
it('production-built Vercel preview retains server auth even with fixture flags', async () => {
    vi.stubEnv('CREATOR_DASHBOARD_FIXTURES', 'true'); vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('VERCEL_ENV', 'preview');
    expect((await middleware(f.auth, request('/admin/creator-dashboard/fleet'))).status).toBe(403);
    expect(f.auth).toHaveBeenCalled(); expect(f.getUser).toHaveBeenCalled(); expect(localFixtureRuntime()).toBe(false);
});
it('fixture middleware blocks all writes, unrelated private pages and real service APIs', async () => {
    vi.stubEnv('CREATOR_DASHBOARD_FIXTURES', 'true');
    expect((await middleware(f.auth, new Request('https://fit.test/api/creator-dashboard/queue', { method: 'POST' }))).status).toBe(409);
    expect((await middleware(f.auth, request('/admin/orders'))).status).toBe(404);
    expect((await middleware(f.auth, request('/api/admin/settings'))).status).toBe(404);
    expect((await middleware(f.auth, request('/?home=v2'))).status).toBe(200);
    expect((await middleware(f.auth, request('/shop'))).status).toBe(200);
    expect(f.auth).not.toHaveBeenCalled(); expect(f.getUser).not.toHaveBeenCalled();
});
it('local aliases require development and both exact flags', () => {
    const env = { NODE_ENV: 'development', CREATOR_DASHBOARD_ENABLED: 'true', CREATOR_DASHBOARD_FIXTURES: 'true' };
    expect(localFixtureRuntime(env)).toBe(true);
    for (const change of [{ NODE_ENV: 'production', VERCEL_ENV: 'preview' }, { CREATOR_DASHBOARD_ENABLED: 'false' }, { CREATOR_DASHBOARD_FIXTURES: 'TRUE' }]) expect(localFixtureRuntime({ ...env, ...change })).toBe(false);
});
