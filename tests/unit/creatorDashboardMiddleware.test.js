// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ getUser: vi.fn(), auth: vi.fn() }));
vi.mock('@clerk/nextjs/server', () => ({
    clerkMiddleware: handler => handler,
    createRouteMatcher: patterns => req => patterns.some(pattern => new RegExp(`^${pattern}$`).test(new URL(req.url).pathname)),
    clerkClient: async () => ({ users: { getUser: f.getUser } }), auth: f.auth,
}));
import middleware from '@/middleware';
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
