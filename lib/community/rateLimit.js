import { createHash } from 'node:crypto'
import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'
import { clientIpFrom } from '@/lib/rateLimit'
import { fabricationRateSource } from '@/lib/fabrication/rateLimitConfig'
import { fail } from '@/lib/fabrication/serverHttp'

const instances = new Map(), local = new Map()
const policies = { read: [[60, '1 m', 60000]], submit: [[5, '1 m', 60000], [30, '1 h', 3600000]], edit: [[10, '1 m', 60000]], report: [[3, '1 m', 60000], [10, '1 h', 3600000]], admin: [[30, '1 m', 60000]] }
export async function communityRate(request, kind, userId) {
  const identity = createHash('sha256').update(String(userId || clientIpFrom(request.headers)).slice(0, 256)).digest('hex')
  const source = fabricationRateSource()
  if (!source && process.env.NODE_ENV === 'production') fail('Community is temporarily unavailable. Please try later.', 503, 'rate_limit_unavailable')
  for (const [limit, window, duration] of policies[kind] || policies.read) {
    const name = `${kind}:${duration}`
    if (!source) {
      const now = Date.now()
      for (const [key, row] of local) if (row.reset <= now) local.delete(key)
      const key = `${name}:${identity}`
      if (local.size >= 2000 && !local.has(key)) fail('Please try again later.', 429)
      const row = local.get(key) || { count: 0, reset: now + duration }
      row.count++; local.set(key, row)
      if (row.count > limit) fail('Too many community requests. Please wait before trying again.', 429, 'rate_limited')
      continue
    }
    let result
    try {
      if (!instances.has(name)) instances.set(name, new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(limit, window), prefix: `rl:community:${name}`, timeout: 2000 }))
      result = await instances.get(name).limit(identity)
    } catch { fail('Community is temporarily unavailable. Please try later.', 503, 'rate_limit_unavailable') }
    if (result?.reason === 'timeout' || typeof result?.success !== 'boolean') fail('Community is temporarily unavailable. Please try later.', 503, 'rate_limit_unavailable')
    if (!result.success) fail('Too many community requests. Please wait before trying again.', 429, 'rate_limited')
  }
}
