// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const connect = vi.hoisted(() => vi.fn());
vi.mock('mongoose', () => ({ default: { connect } }));
vi.mock('@/lib/mongoTiming', () => ({ attachMongoTiming: vi.fn() }));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); vi.stubEnv('MONGODB_URI', ''); vi.stubEnv('CREATOR_DASHBOARD_ENABLED', 'true'); vi.stubEnv('CREATOR_DASHBOARD_FIXTURES', 'true'); vi.stubEnv('NODE_ENV', 'development'); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('fixture imports need no Mongo URI and cannot use a cached connection', async () => {
    vi.stubGlobal('mongoose', { conn: { production: true }, promise: null });
    const { connectToDatabase } = await import('@/lib/db');
    await expect(connectToDatabase()).rejects.toThrow('disabled in the local fixture preview');
    expect(connect).not.toHaveBeenCalled();
});
it('production preview does not bypass the normal missing-URI guard', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('VERCEL_ENV', 'preview');
    await expect(import('@/lib/db')).rejects.toThrow('Please define the MONGODB_URI');
    expect(connect).not.toHaveBeenCalled();
});
