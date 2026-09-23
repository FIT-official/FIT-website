import { createHash } from 'node:crypto'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { clientIpFrom, rateLimitHeaders } from '@/lib/rateLimit'
import { importError } from './errors.js'

let limiters
const localWindows = new Map()

function unavailable() {
  return importError('import_unavailable', 'Link import is temporarily unavailable. You can still upload your model file.', 503)
}

/** Public preview endpoint: distributed enforcement is required in production. */
export async function limitModelImport(headers) {
  const key = createHash('sha256').update(clientIpFrom(headers).slice(0, 256)).digest('hex')
  const configured = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  if (!configured) {
    if (process.env.NODE_ENV === 'production') throw unavailable()
    const now = Date.now()
    for (const [key, window] of localWindows) if (window.reset <= now) localWindows.delete(key)
    if (localWindows.size >= 1000 && !localWindows.has(key)) throw unavailable()
    const window = localWindows.get(key) || { used: 0, reset: now + 60000 }
    window.used++
    localWindows.set(key, window)
    return { allowed: window.used <= 5, headers: rateLimitHeaders({ limit: 5, remaining: 5 - window.used, reset: window.reset }) }
  }
  try {
    if (!limiters) {
      const redis = Redis.fromEnv()
      limiters = {
        client: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '1 m'), prefix: 'rl:model-import:client', timeout: 2000 }),
        total: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, '1 m'), prefix: 'rl:model-import:total', timeout: 2000 }),
      }
    }
    const result = await limiters.client.limit(key)
    // Upstash's timeout response can set success:true. Imports must fail closed.
    if (result.reason === 'timeout' || typeof result.success !== 'boolean') throw unavailable()
    if (!result.success) return { allowed: false, headers: rateLimitHeaders(result) }
    const total = await limiters.total.limit('all')
    if (total.reason === 'timeout' || typeof total.success !== 'boolean') throw unavailable()
    return { allowed: total.success, headers: rateLimitHeaders(total.success ? result : total) }
  } catch {
    throw unavailable()
  }
}
