import { bulkJson, bulkFailure, loadBulkCatalogue } from '@/lib/bulkFilamentHttp'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET() {
  try {
    const products = await loadBulkCatalogue()
    return bulkJson({ products, checkedAt: products[0]?.inventoryCheckedAt, stockSource: products[0]?.inventorySource })
  }
  catch (error) { return bulkFailure(error) }
}
