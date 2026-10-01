import { json } from '@/lib/fabrication/serverHttp'
import { privateFabricationBucket } from '@/lib/fabrication/serverAssets'
export const dynamic = 'force-dynamic'
export async function GET() {
  let uploadsAvailable = false
  if (process.env.FABRICATION_S3_BUCKET_NAME?.trim()) {
    try { await privateFabricationBucket(); uploadsAvailable = true } catch { /* Fail closed; a written request remains useful. */ }
  }
  const requestsAvailable = process.env.NODE_ENV !== 'production' || Boolean(
    process.env.MONGODB_URI && process.env.CLERK_SECRET_KEY &&
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  )
  return json({ uploadsAvailable, requestsAvailable })
}
