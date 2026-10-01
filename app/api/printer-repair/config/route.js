import { json } from '@/lib/fabrication/serverHttp'
import { privateFabricationBucket } from '@/lib/fabrication/serverAssets'
import { reportPhotoReadiness } from '@/lib/printerRepair/diagnostics'
import { fabricationRateSource } from '@/lib/fabrication/rateLimitConfig'
export const dynamic = 'force-dynamic'
export async function GET() {
  let uploadsAvailable = false
  if (process.env.FABRICATION_S3_BUCKET_NAME?.trim()) {
    try { await privateFabricationBucket(); uploadsAvailable = true } catch (error) { reportPhotoReadiness(error) }
  } else reportPhotoReadiness()
  const requestsAvailable = process.env.NODE_ENV !== 'production' || Boolean(
    process.env.MONGODB_URI && process.env.CLERK_SECRET_KEY &&
    fabricationRateSource()
  )
  return json({ uploadsAvailable, requestsAvailable })
}
