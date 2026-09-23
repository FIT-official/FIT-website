import { auth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import { catalogPageOptions, fabricationCatalogPage, saveFabricationCatalogBatch, validateCatalogBatch } from '@/lib/fabrication/serverCatalog'
import { fabricationEntitlements, requireFabricationPro } from '@/lib/fabrication/serverAccess'
import { shapeFabricationCatalog, validateCatalogAssets } from '@/lib/fabrication/serverAssets'
import { enforceFabricationRate } from '@/lib/fabrication/serverRateLimit'
import { fail, failure, json, readJson } from '@/lib/fabrication/serverHttp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    const { userId } = await auth()
    if (!userId) fail('Unauthorized.', 401)
    await connectToDatabase()
    const entitlements = await fabricationEntitlements(userId)
    const page = await fabricationCatalogPage(userId, catalogPageOptions(request?.url || 'https://local.invalid/'))
    const catalog = await shapeFabricationCatalog(page.catalog, userId)
    return json({ catalog, nextCursor: page.nextCursor, total: page.total, planId: entitlements.planId, canManage: entitlements.canManage,
      uploadsAvailable: Boolean(process.env.FABRICATION_S3_BUCKET_NAME?.trim()) })
  } catch (error) { return failure(error) }
}

export async function PUT(request) {
  try {
    const { userId } = await auth()
    if (!userId) fail('Unauthorized.', 401)
    await enforceFabricationRate(request, 'write', userId)
    await requireFabricationPro(userId)
    const body = await readJson(request, 256 * 1024)
    const { catalog, removedOfferIds } = validateCatalogBatch(body)
    await connectToDatabase()
    await validateCatalogAssets(catalog, userId)
    await saveFabricationCatalogBatch(userId, catalog, removedOfferIds)
    return json({ catalog: await shapeFabricationCatalog(catalog, userId), planId: 'pro', canManage: true,
      uploadsAvailable: Boolean(process.env.FABRICATION_S3_BUCKET_NAME?.trim()) })
  } catch (error) { return failure(error) }
}
