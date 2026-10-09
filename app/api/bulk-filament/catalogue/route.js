import { bulkJson, bulkFailure, loadBulkCatalogue } from '@/lib/bulkFilamentHttp'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET() {
  try { return bulkJson({ products: await loadBulkCatalogue(), checkedAt: new Date().toISOString(), maxExtraPerColour: 20 }) }
  catch (error) { return bulkFailure(error) }
}
