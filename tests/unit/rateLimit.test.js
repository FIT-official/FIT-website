import { describe, it, expect, vi, afterEach } from 'vitest'
import { clientIpFrom, rateLimitHeaders, limitQuoteRequest } from '@/lib/rateLimit'

function headersOf(map) {
  return { get: (k) => map[k.toLowerCase()] ?? null }
}

describe('clientIpFrom', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('without TRUST_PROXY_HEADERS, does not trust a spoofable x-forwarded-for value', () => {
    vi.stubEnv('TRUST_PROXY_HEADERS', '')
    const a = clientIpFrom(headersOf({ 'x-forwarded-for': '1.2.3.4' }))
    const b = clientIpFrom(headersOf({ 'x-forwarded-for': '9.9.9.9' }))
    // A client rotating x-forwarded-for on every request must not get a fresh
    // rate-limit bucket each time — both spoofed values collapse to the same key.
    expect(a).toBe(b)
    expect(a).not.toBe('1.2.3.4')
    expect(b).not.toBe('9.9.9.9')
  })

  it('with TRUST_PROXY_HEADERS set, takes the first x-forwarded-for entry', () => {
    vi.stubEnv('TRUST_PROXY_HEADERS', '1')
    expect(clientIpFrom(headersOf({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))).toBe('1.2.3.4')
  })

  it('with TRUST_PROXY_HEADERS set, falls back to x-real-ip, then unknown', () => {
    vi.stubEnv('TRUST_PROXY_HEADERS', '1')
    expect(clientIpFrom(headersOf({ 'x-real-ip': '5.6.7.8' }))).toBe('5.6.7.8')
    expect(clientIpFrom(headersOf({}))).toBe('unknown')
  })
})

describe('rateLimitHeaders', () => {
  it('produces the standard X-RateLimit-* and Retry-After headers', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const h = rateLimitHeaders({ limit: 15, remaining: 0, reset: 1_000_000 + 30_000 })
    expect(h['X-RateLimit-Limit']).toBe('15')
    expect(h['X-RateLimit-Remaining']).toBe('0')
    expect(h['Retry-After']).toBe('30')
    vi.useRealTimers()
  })

  it('clamps remaining and retry-after to sane minimums', () => {
    const h = rateLimitHeaders({ limit: 15, remaining: -1, reset: Date.now() - 5000 })
    expect(h['X-RateLimit-Remaining']).toBe('0')
    expect(h['Retry-After']).toBe('1')
  })
})

describe('limitQuoteRequest (Upstash unconfigured)', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('allows everything when Upstash env vars are unset', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    const out = await limitQuoteRequest({ userId: null, headers: headersOf({}) })
    expect(out.allowed).toBe(true)
    expect(out.headers).toEqual({})
  })
})
