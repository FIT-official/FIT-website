// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
it.each(['production', 'development'])('%s config selects Clerk shim only for local development', async nodeEnv => {
    vi.stubEnv('NODE_ENV', nodeEnv); vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('CREATOR_DASHBOARD_ENABLED', 'true'); vi.stubEnv('CREATOR_DASHBOARD_FIXTURES', 'true'); vi.resetModules();
    const { default: config } = await import('../../next.config.mjs');
    const webpack = config.webpack({ resolve: { alias: {} } }, { isServer: true });
    if (nodeEnv === 'production') {
        expect(config.turbopack.resolveAlias).toEqual({});
        expect(webpack.resolve.alias).not.toHaveProperty('@clerk/nextjs$');
    } else {
        expect(webpack.resolve.alias['@clerk/nextjs$'].replaceAll('\\', '/')).toContain('preview/Clerk.jsx');
        expect(webpack.parallelism).toBe(2);
    }
});
