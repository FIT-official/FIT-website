import { json } from '@/lib/fabrication/serverHttp'
import { fabricationRateSource } from '@/lib/fabrication/rateLimitConfig'
export const dynamic = 'force-dynamic'
export async function GET() {
  const requestsAvailable = process.env.NODE_ENV !== 'production' || Boolean(
    process.env.MONGODB_URI && process.env.CLERK_SECRET_KEY && fabricationRateSource()
  )
  // Repair photos now use the existing private database. Actual connection,
  // quota and decoding errors are reported by the upload without losing drafts.
  return json({ uploadsAvailable: requestsAvailable, requestsAvailable })
}
