import { notifyBulkOwner } from '@/lib/bulkFilamentEmail'
import { parseBulkInput, saveBulkRequest } from '@/lib/bulkFilament'
import { bulkDb, bulkJson, bulkFailure, bulkSameOrigin, readBulkJson, loadBulkCatalogue, limitBulkRequest } from '@/lib/bulkFilamentHttp'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(request) {
  try {
    bulkSameOrigin(request)
    const input = parseBulkInput(await readBulkJson(request))
    const db = await bulkDb()
    await limitBulkRequest(db, request.headers)
    const result = await saveBulkRequest(db.collection('bulkFilamentRequests'), input, loadBulkCatalogue)
    const ownerEmailStatus = await notifyBulkOwner(db.collection('bulkFilamentRequests'), result.receipt.requestId)
    return bulkJson({ ...result.receipt, ownerEmailStatus, notificationCoverage: ownerEmailStatus === 'accepted' ? 'owner_dashboard_and_email_provider' : 'owner_dashboard_only' }, result.created ? 201 : 200)
  } catch (error) { return bulkFailure(error) }
}
