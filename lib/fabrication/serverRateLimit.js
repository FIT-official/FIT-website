import { createHash } from 'node:crypto'
import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'
import { clientIpFrom } from '@/lib/rateLimit'
import { fail } from './serverHttp'
import { fabricationRateSource } from './rateLimitConfig'

const instances = new Map()
const local = new Map()
const LIMITS = { public: 60, estimate: 30, request: 15, asset: 10, write: 30 }
const unavailableLogs = new Map()
function unavailable(reason, source) {
  const now = Date.now()
  if (!unavailableLogs.has(reason) || unavailableLogs.get(reason) <= now - 60000) {
    unavailableLogs.set(reason, now)
    // Fixed categories only: SDK messages can contain URLs, commands and keys.
    console.warn('Fabrication rate limit unavailable', { reason, source: source || 'unconfigured' })
  }
  fail('This service is temporarily unavailable.', 503, 'rate_limit_unavailable')
}
function failureReason(error) {
  if (error?.name === 'UrlError') return 'invalid_url'
  if (error?.name === 'UpstashJSONParseError') return 'invalid_response'
  if (error?.name === 'UpstashError') {
    const message = typeof error.message === 'string' ? error.message : ''
    if (/^(WRONGPASS|NOAUTH)\b/i.test(message)) return 'authentication_failed'
    if (/^(NOPERM|READONLY)\b/i.test(message)) return 'permission_denied'
    return 'redis_error'
  }
  if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(error?.cause?.code || error?.code)) return 'connection_failed'
  return 'unexpected_error'
}
export async function enforceFabricationRate(request, kind, userId) {
  const limit = LIMITS[kind] || 15
  const identity = userId || clientIpFrom(request.headers)
  const key = createHash('sha256').update(identity.slice(0, 256)).digest('hex')
  const source = fabricationRateSource()
  if (!source) {
    if (process.env.NODE_ENV === 'production') unavailable('not_configured', source)
    const now = Date.now()
    for (const [key, row] of local) if (row.reset <= now) local.delete(key)
    const id = `${kind}:${key}`
    if (local.size >= 2000 && !local.has(id)) fail('Please try again later.', 429)
    const row = local.get(id) || { used: 0, reset: now + 60000 }
    row.used++
    local.set(id, row)
    if (row.used > limit) fail('Too many requests. Please wait a minute.', 429, 'rate_limited')
    return
  }
  let result
  try {
    if (!instances.has(kind)) instances.set(kind, new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(limit, '1 m'), prefix: `rl:fabrication:${kind}`, timeout: 2000 }))
    result = await instances.get(kind).limit(key)
  } catch (error) { unavailable(failureReason(error), source) }
  if (result?.reason === 'timeout') unavailable('timeout', source)
  if (typeof result?.success !== 'boolean') unavailable('invalid_response', source)
  if (!result.success) fail('Too many requests. Please wait a minute.', 429, 'rate_limited')
}
