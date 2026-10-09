// The installed Redis SDK accepts either Upstash or existing Vercel KV names.
// Never combine a partial Upstash pair with credentials from another database.
export function fabricationRateSource() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (url || token) return url && token ? 'upstash' : null
  return process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN ? 'vercel_kv' : null
}
