// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ limit: vi.fn(), redis: vi.fn(() => ({})) }))
vi.mock('@upstash/redis', () => ({ Redis: { fromEnv: mocks.redis } }))
vi.mock('@upstash/ratelimit', () => ({ Ratelimit: Object.assign(function () { this.limit = mocks.limit }, { slidingWindow: vi.fn() }) }))
beforeEach(() => { vi.resetModules(); vi.clearAllMocks() })
afterEach(() => { vi.unstubAllEnvs() })

describe('model import rate enforcement', () => {
  it('fails closed in production when distributed rate limiting is unconfigured', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    const { limitModelImport } = await import('@/lib/modelImport/rateLimit')
    await expect(limitModelImport(new Headers())).rejects.toMatchObject({ code: 'import_unavailable', status: 503 })
  })
  it('treats Upstash fail-open timeout results as unavailable', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.org')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test')
    mocks.limit.mockResolvedValue({ success: true, reason: 'timeout' })
    const { limitModelImport } = await import('@/lib/modelImport/rateLimit')
    await expect(limitModelImport(new Headers())).rejects.toMatchObject({ code: 'import_unavailable' })
  })
  it('checks both per-client and total limits and never exposes the raw IP to the limiter', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.org')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test')
    vi.stubEnv('TRUST_PROXY_HEADERS', 'true')
    mocks.limit.mockResolvedValue({ success: true, limit: 5, remaining: 4, reset: Date.now() + 60000 })
    const { limitModelImport } = await import('@/lib/modelImport/rateLimit')
    expect((await limitModelImport(new Headers({ 'x-forwarded-for': '1.2.3.4' }))).allowed).toBe(true)
    expect(mocks.limit).toHaveBeenCalledTimes(2)
    expect(mocks.limit.mock.calls[0][0]).toMatch(/^[a-f0-9]{64}$/)
    expect(mocks.limit.mock.calls[1][0]).toBe('all')
  })
  it('keeps local development limited to five imports per minute', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    const { limitModelImport } = await import('@/lib/modelImport/rateLimit')
    for (let i = 0; i < 5; i++) expect((await limitModelImport(new Headers())).allowed).toBe(true)
    expect((await limitModelImport(new Headers())).allowed).toBe(false)
  })
})
