import { createHash } from 'node:crypto'
import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'
import { clientIpFrom } from '@/lib/rateLimit'
import { fail } from './serverHttp'

const instances = new Map()
const local = new Map()
const LIMITS = { public: 60, estimate: 30, request: 15, asset: 10, write: 30 }
export async function enforceFabricationRate(request, kind, userId) {
  const limit = LIMITS[kind] || 15
  const identity = userId || clientIpFrom(request.headers)
  const key = createHash('sha256').update(identity.slice(0, 256)).digest('hex')
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    if (process.env.NODE_ENV === 'production') fail('This service is temporarily unavailable.', 503, 'rate_limit_unavailable')
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
  } catch { fail('This service is temporarily unavailable.', 503, 'rate_limit_unavailable') }
  if (result?.reason === 'timeout' || typeof result?.success !== 'boolean') fail('This service is temporarily unavailable.', 503, 'rate_limit_unavailable')
  if (!result.success) fail('Too many requests. Please wait a minute.', 429, 'rate_limited')
}
