import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { clientIpFrom } from '@/lib/rateLimit'
import { bulkCatalogue, bulkFail } from '@/lib/bulkFilament'
import { loadBulkStock } from '@/lib/bulkFilamentStock'
import { bambuBulkCatalogue } from '@/lib/bulkFilamentBambu'
import { bulkFailureDiagnostic, bulkStage } from '@/lib/bulkFilamentDiagnostics'
import { readJson } from '@/lib/fabrication/serverHttp'
export const bulkJson = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' } })
export function bulkFailure(error) {
  if ((error.status || 503) >= 500) console.error('bulk-filament failure', bulkFailureDiagnostic(error))
  return bulkJson({ error: error.status ? error.message : 'We could not confirm your request. Your entries are kept; retry with the same reference.',
    code: error.code && error.status ? error.code : 'service_unavailable' }, error.status || 503)
}
export function bulkSameOrigin(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) bulkFail('Open the form on this website.', 403)
}
export async function bulkDb() {
  return bulkStage('database', async () => {
    const { connectToDatabase } = await import('@/lib/db')
    return (await connectToDatabase()).connection.db
  })
}
export async function loadBulkCatalogue() {
  const [stock, products] = await Promise.all([
    bulkStage('inventory', loadBulkStock),
    bulkStage('shop-products', async () => {
      const { getShopProducts } = await import('@/lib/seo/shop')
      return getShopProducts()
    }),
  ])
  const stockIssues = []
  const bambu = await bulkStage('bambu-mapping', () => bambuBulkCatalogue(products, stock, undefined, stockIssues))
  if (stockIssues.length) console.warn('Bambu bulk stock issues', { stockIssues })
  const lanbo = await bulkStage('lanbo-mapping', () => bulkCatalogue(stock))
  return [...lanbo, ...bambu]
}
export const readBulkJson = request => readJson(request, 65536)
export async function limitBulkRequest(db, headers, now = Date.now()) {
  const id = createHash('sha256').update('bulk:' + clientIpFrom(headers)).digest('hex')
  const store = db.collection('bulkFilamentRateLimits')
  // One bounded counter per identity. Atomic reset/increment; no external credentials or stock writes.
  try {
    const result = await store.findOneAndUpdate({ _id: id, $or: [{ resetAt: { $lte: now } }, { count: { $lt: 30 } }] },
      [{ $set: { count: { $cond: [{ $lte: [{ $ifNull: ['$resetAt', 0] }, now] }, 1, { $add: ['$count', 1] }] },
        resetAt: { $cond: [{ $lte: [{ $ifNull: ['$resetAt', 0] }, now] }, now + 60000, '$resetAt'] } } }],
      { upsert: true, returnDocument: 'after' })
    if (!result) bulkFail('Please wait a minute before trying again.', 429, 'rate_limited')
  } catch (error) {
    if (error.code === 11000) bulkFail('Please wait a minute before trying again.', 429, 'rate_limited')
    throw error
  }
}
