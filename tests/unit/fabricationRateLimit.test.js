// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ limit: vi.fn(), redis: vi.fn(() => ({})), constructor: vi.fn(), window: vi.fn() }))
vi.mock('@upstash/redis', () => ({ Redis: { fromEnv: mocks.redis } }))
vi.mock('@upstash/ratelimit', () => ({ Ratelimit: Object.assign(function (config) {
  mocks.constructor(config)
  this.limit = mocks.limit
}, { slidingWindow: mocks.window }) }))

const request = () => new Request('https://fit.invalid/api/printer-repair')
let warn
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks()
  vi.stubEnv('NODE_ENV', 'production')
  for (const key of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'KV_REST_API_READ_ONLY_TOKEN']) vi.stubEnv(key, '')
  mocks.redis.mockReturnValue({})
  mocks.limit.mockResolvedValue({ success: true })
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.useRealTimers() })

function upstash() {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://fixture.upstash.io')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'fixture-secret')
}
function vercelKv() {
  vi.stubEnv('KV_REST_API_URL', 'https://fixture-kv.upstash.io')
  vi.stubEnv('KV_REST_API_TOKEN', 'fixture-kv-secret')
}
async function enforce() { return (await import('@/lib/fabrication/serverRateLimit')).enforceFabricationRate }

describe('strict distributed fabrication and repair rate enforcement', () => {
  it('rejects missing production configuration before calling Redis', async () => {
    await expect((await enforce())(request(), 'request', 'fixture-user')).rejects.toMatchObject({ status: 503, code: 'rate_limit_unavailable' })
    expect(mocks.redis).not.toHaveBeenCalled(); expect(mocks.limit).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('Fabrication rate limit unavailable', { reason: 'not_configured', source: 'unconfigured' })
  })
  it('uses an existing complete Vercel KV pair with the same distributed limits', async () => {
    vercelKv()
    const rate = await enforce()
    await rate(request(), 'request', 'fixture-user')
    await rate(request(), 'request', 'fixture-user')
    expect(mocks.redis).toHaveBeenCalledTimes(1)
    expect(mocks.window).toHaveBeenCalledWith(15, '1 m')
    expect(mocks.constructor).toHaveBeenCalledWith(expect.objectContaining({ prefix: 'rl:fabrication:request', timeout: 2000 }))
    expect(mocks.limit).toHaveBeenCalledTimes(2)
    expect(mocks.limit.mock.calls[0][0]).toMatch(/^[a-f0-9]{64}$/)
    expect(mocks.limit.mock.calls[1][0]).toBe(mocks.limit.mock.calls[0][0])
    expect(warn).not.toHaveBeenCalled()
  })
  it.each(['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'])('does not mix a partial Upstash pair with Vercel KV: %s', async key => {
    vercelKv(); vi.stubEnv(key, 'partial-fixture')
    await expect((await enforce())(request(), 'public', 'fixture-user')).rejects.toMatchObject({ status: 503, code: 'rate_limit_unavailable' })
    expect(mocks.redis).not.toHaveBeenCalled()
  })
  it('does not substitute a read-only KV token', async () => {
    vi.stubEnv('KV_REST_API_URL', 'https://fixture-kv.upstash.io')
    vi.stubEnv('KV_REST_API_READ_ONLY_TOKEN', 'fixture-read-only')
    await expect((await enforce())(request(), 'request', 'fixture-user')).rejects.toMatchObject({ status: 503 })
    expect(mocks.redis).not.toHaveBeenCalled()
  })
  it('preserves a real rejection as 429 instead of unavailable or allowed', async () => {
    upstash(); mocks.limit.mockResolvedValue({ success: false })
    await expect((await enforce())(request(), 'request', 'fixture-user')).rejects.toMatchObject({ status: 429, code: 'rate_limited' })
    expect(warn).not.toHaveBeenCalled()
  })
  it.each([true, false])('fails closed on SDK timeout even when success is %s', async success => {
    upstash(); mocks.limit.mockResolvedValue({ success, reason: 'timeout' })
    await expect((await enforce())(request(), 'request', 'fixture-user')).rejects.toMatchObject({ status: 503, code: 'rate_limit_unavailable' })
    expect(warn).toHaveBeenCalledWith('Fabrication rate limit unavailable', { reason: 'timeout', source: 'upstash' })
  })
  it.each([undefined, {}, { success: 'true' }])('rejects an invalid SDK response: %j', async result => {
    upstash(); mocks.limit.mockResolvedValue(result)
    await expect((await enforce())(request(), 'public', 'fixture-user')).rejects.toMatchObject({ status: 503 })
    expect(warn).toHaveBeenCalledWith('Fabrication rate limit unavailable', { reason: 'invalid_response', source: 'upstash' })
  })
  it.each([
    ['UrlError', 'https://private-fixture', undefined, 'invalid_url'],
    ['UpstashError', 'WRONGPASS private-fixture', undefined, 'authentication_failed'],
    ['UpstashError', 'NOAUTH private-fixture', undefined, 'authentication_failed'],
    ['UpstashError', 'NOPERM private-fixture', undefined, 'permission_denied'],
    ['UpstashError', 'READONLY private-fixture', undefined, 'permission_denied'],
    ['UpstashError', 'other private-fixture', undefined, 'redis_error'],
    ['UpstashJSONParseError', 'private-fixture response', undefined, 'invalid_response'],
    ['TypeError', 'private-fixture request', { code: 'ENOTFOUND' }, 'connection_failed'],
    ['private-fixture-name', 'private-fixture error', undefined, 'unexpected_error'],
  ])('logs only a bounded category for %s', async (name, message, cause, reason) => {
    upstash(); mocks.limit.mockRejectedValue(Object.assign(new Error(message), { name, cause }))
    await expect((await enforce())(request(), 'request', 'private-fixture-user')).rejects.toMatchObject({ status: 503, code: 'rate_limit_unavailable' })
    expect(warn).toHaveBeenCalledWith('Fabrication rate limit unavailable', { reason, source: 'upstash' })
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private-fixture')
    expect(JSON.stringify(warn.mock.calls)).not.toContain('fixture-secret')
  })
  it('bounds repeated failure logging to once per reason per minute', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T00:00:00Z'))
    upstash(); mocks.limit.mockResolvedValue({ success: true, reason: 'timeout' })
    const rate = await enforce()
    for (let index = 0; index < 3; index++) await expect(rate(request(), 'request', 'fixture-user')).rejects.toMatchObject({ status: 503 })
    expect(warn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(60000)
    await expect(rate(request(), 'request', 'fixture-user')).rejects.toMatchObject({ status: 503 })
    expect(warn).toHaveBeenCalledTimes(2)
  })
  it('keeps local development limited when no distributed configuration exists', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const rate = await enforce()
    for (let index = 0; index < 15; index++) await rate(request(), 'request', 'fixture-user')
    await expect(rate(request(), 'request', 'fixture-user')).rejects.toMatchObject({ status: 429, code: 'rate_limited' })
    expect(mocks.redis).not.toHaveBeenCalled()
  })
})
