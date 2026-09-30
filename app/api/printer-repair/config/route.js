import { json } from '@/lib/fabrication/serverHttp'
export const dynamic = 'force-dynamic'
export function GET() {
  return json({ uploadsAvailable: Boolean(process.env.FABRICATION_S3_BUCKET_NAME?.trim()) })
}
