/**
 * Shared Upstash-backed rate limiting for public compute endpoints.
 *
 * Declared at module scope (per Upstash guidance) so warm serverless instances
 * reuse the limiter. Degrades to a no-op when the Upstash env vars are unset
 * (local dev, CI) — the endpoints stay functional, just unthrottled, and a
 * single warning is logged.
 *
 * Keying: authenticated traffic by Clerk userId, anonymous by client IP, with
 * tighter anonymous limits (anonymous quote previews are the abuse vector).
 */
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

let limiters = null
let warned = false

function getLimiters() {
  if (limiters) return limiters
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    if (!warned) {
      warned = true
      console.warn('[rateLimit] UPSTASH_REDIS_REST_URL/TOKEN unset — rate limiting disabled')
    }
    return null
  }
  const redis = Redis.fromEnv()
  limiters = {
    authed: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, '1 m'),
      prefix: 'rl:quote:auth',
    }),
    anon: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(15, '1 m'),
      prefix: 'rl:quote:anon',
    }),
  }
  return limiters
}

/**
 * First client IP from proxy headers; 'unknown' when absent. Pure.
 *
 * `x-forwarded-for`/`x-real-ip` are client-controlled unless a trusted edge
 * proxy overwrites them before the app sees them. Only trust them when
 * TRUST_PROXY_HEADERS is set (confirm the deployment platform actually
 * sanitizes these headers before flipping it on) — otherwise every anonymous
 * caller collapses onto one shared key, so spoofing the header can't buy a
 * fresh rate-limit bucket. Stricter-by-default beats spoofable-by-default.
 */
export function clientIpFrom(headers) {
  if (!process.env.TRUST_PROXY_HEADERS) return 'anon-shared'
  const forwarded = headers?.get?.('x-forwarded-for') || ''
  const first = forwarded.split(',')[0]?.trim()
  return first || headers?.get?.('x-real-ip') || 'unknown'
}

/** Standard rate-limit response headers from an Upstash limit result. Pure. */
export function rateLimitHeaders({ limit, remaining, reset }) {
  const headers = {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(Math.max(0, remaining)),
    'X-RateLimit-Reset': String(reset),
  }
  const retryAfterS = Math.max(1, Math.ceil((reset - Date.now()) / 1000))
  headers['Retry-After'] = String(retryAfterS)
  return headers
}

/**
 * Apply the quote-endpoint rate limit.
 * @returns {Promise<{allowed:boolean, headers:object}>} headers are populated
 *   on both outcomes so callers can always surface X-RateLimit-*.
 */
export async function limitQuoteRequest({ userId, headers }) {
  const active = getLimiters()
  if (!active) return { allowed: true, headers: {} }
  const limiter = userId ? active.authed : active.anon
  const key = userId || clientIpFrom(headers)
  try {
    const result = await limiter.limit(key)
    return { allowed: result.success, headers: rateLimitHeaders(result) }
  } catch (err) {
    // Redis being down must not take the quote endpoint with it.
    console.error('[rateLimit] limiter error; allowing request:', err)
    return { allowed: true, headers: {} }
  }
}
