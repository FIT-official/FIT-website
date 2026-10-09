// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const f = vi.hoisted(() => ({ sub: null, order: null, update: vi.fn(), mail: vi.fn(), db: vi.fn(), find: vi.fn(), auth: vi.fn() }));
vi.mock('@clerk/nextjs/server', () => ({ auth: f.auth, clerkClient: async () => ({ users: { getUser: async () => ({ publicMetadata: { role: 'creator' } }) } }) }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_HTTP_ERROR_FALLBACK;404'); }, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/db', () => ({ connectToDatabase: f.db }));
vi.mock('@/models/SubOrder', () => ({ default: {
    findOne: query => ({ lean: async () => !query.storeId || query.storeId === f.sub?.storeId ? f.sub : null }),
    findOneAndUpdate: (query, update) => ({ lean: async () => { f.update(query, update); f.sub = { ...f.sub, ...update.$set, statusHistory: [...f.sub.statusHistory, update.$push.statusHistory] }; return f.sub; } }),
    find: (...args) => ({ lean: async () => { f.find(...args); return [f.sub]; } }),
} }));
vi.mock('@/models/Order', () => ({ default: {
    findById: () => ({ select: () => ({ lean: async () => f.order }) }),
    findOne: () => ({ select: () => ({ lean: async () => f.order }) }),
} }));
vi.mock('@/lib/email', () => ({ sendEmail: f.mail }));
import { changeSubOrderStatus, findTracking } from '@/lib/creatorDashboard/orders';
import { assertStatusChange, trackingProjection } from '@/lib/creatorDashboard/orderStatus';
import { GET, PATCH } from '@/app/api/creator-dashboard/orders/[id]/route';
import TrackingPage from '@/app/track/[token]/page';
import ProcessedStripeEvent from '@/models/ProcessedStripeEvent';
const id = '100000000000000000000001';
beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv('CREATOR_DASHBOARD_ENABLED', 'true'); vi.stubEnv('CREATOR_DASHBOARD_FIXTURES', 'false');
    vi.stubEnv('GMAIL_USER', 'fixittoday.contact@gmail.com'); vi.stubEnv('ADMIN_EMAIL', 'fixittoday.contact@gmail.com'); vi.stubEnv('GMAIL_PASSWORD', 'dummy-test-mail-password');
    f.auth.mockResolvedValue({ userId: 'user_A' });
    f.sub = { _id: id, orderId: 'order', storeId: 'user_B', fulfilment: 'creator', status: 'paid', items: [{ name: 'Part', qty: 1, productId: 'private-id' }], statusHistory: [{ status: 'paid', at: new Date(), by: 'private-user' }] };
    f.order = { _id: 'order', customerEmail: 'fixittoday.contact@gmail.com', shippingAddress: { line1: 'Private address' } };
});
it('creator A gets 403 reading or updating creator B sub-order by ID', async () => {
    const ctx = { params: Promise.resolve({ id }) };
    expect((await GET(null, ctx)).status).toBe(403);
    expect((await PATCH(new Request('https://fit.test', { method: 'PATCH', body: JSON.stringify({ status: 'qc' }) }), ctx)).status).toBe(403);
    expect(f.update).not.toHaveBeenCalled();
});
it('one status change sends exactly one customer email; repeating same state sends none', async () => {
    const scope = { userId: 'owner', role: 'owner' };
    await changeSubOrderStatus(scope, id, 'in_production'); await changeSubOrderStatus(scope, id, 'in_production');
    expect(f.mail).toHaveBeenCalledTimes(1); expect(f.mail.mock.calls[0][0].to).toBe(f.order.customerEmail);
    expect(f.update).toHaveBeenCalledTimes(1);
});
it('missing mail configuration or unapproved customer remains log-only', async () => {
    f.order.customerEmail = 'synthetic@example.test';
    await changeSubOrderStatus({ userId: 'owner', role: 'owner' }, id, 'in_production'); expect(f.mail).not.toHaveBeenCalled();
});
it('only the webhook can set paid or refunded, including same-state requests', () => {
    expect(() => assertStatusChange('paid', 'paid')).toThrow('verified Stripe');
    expect(() => assertStatusChange('qc', 'paid')).toThrow('verified Stripe');
    expect(() => assertStatusChange('paid', 'refunded')).toThrow('verified Stripe');
    expect(() => assertStatusChange('paid', 'delivered')).toThrow('Invalid status');
});
it('wrong tracking token throws real Next notFound and malformed token avoids DB', async () => {
    expect(await findTracking('bad')).toBeNull(); expect(f.db).not.toHaveBeenCalled();
    f.order = null;
    await expect(TrackingPage({ params: Promise.resolve({ token: '0'.repeat(32) }) })).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
});
it('tracking projection has only status, items and history, never address or identity', async () => {
    const result = await findTracking('a'.repeat(32));
    expect(result).toEqual(trackingProjection([f.sub]));
    expect(JSON.stringify(result)).not.toMatch(/private|storeId|orderId|customerEmail|shippingAddress/);
});
it('ProcessedStripeEvent has a unique event ID index', () => {
    expect(ProcessedStripeEvent.schema.indexes()).toContainEqual([{ eventId: 1 }, expect.objectContaining({ unique: true })]);
});
it('grep guard: no API outside Stripe webhook contains a paid status assignment', () => {
    const root = resolve('app/api');
    const files = readdirSync(root, { recursive: true }).filter(name => name.replaceAll('\\', '/').endsWith('/route.js'));
    for (const file of files) {
        if (file.replaceAll('\\', '/') === 'webhook/stripe/route.js') continue;
        const source = readFileSync(resolve(root, file), 'utf8');
        expect(source, file).not.toMatch(/(?:status\s*:\s*|\.status\s*=\s*)['"]paid['"]/);
    }
    expect(readFileSync(resolve(root, 'user/orders/route.js'), 'utf8')).toContain("status === 'paid'");
});
