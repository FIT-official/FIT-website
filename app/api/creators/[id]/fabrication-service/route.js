import { loadPublicFabrication } from '@/lib/fabrication/serverAccess'
import { shapeFabricationCatalog } from '@/lib/fabrication/serverAssets'
import { catalogPageOptions } from '@/lib/fabrication/serverCatalog'
import { enforceFabricationRate } from '@/lib/fabrication/serverRateLimit'
import { failure, json } from '@/lib/fabrication/serverHttp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request, props) {
  try {
    await enforceFabricationRate(request, 'public')
    const { id } = await props.params
    const service = await loadPublicFabrication(id, catalogPageOptions(request.url))
    if (!service) return json({ enabled: false })
    const catalog = await shapeFabricationCatalog(service.catalog, service.creator.userId)
    return json({ ...catalog, enabled: true, creator: service.creator, nextCursor: service.nextCursor, total: service.total,
      uploadsAvailable: Boolean(process.env.FABRICATION_S3_BUCKET_NAME?.trim()) })
  } catch (error) { return failure(error) }
}
