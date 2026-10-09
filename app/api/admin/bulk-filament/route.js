import { auth } from '@clerk/nextjs/server'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'
import { bulkFail } from '@/lib/bulkFilament'
import { bulkDb, bulkJson, bulkFailure, bulkSameOrigin, readBulkJson } from '@/lib/bulkFilamentHttp'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
async function admin() {
  const { userId } = await auth()
  if (!userId) bulkFail('Sign in to view requests.', 401)
  if (!await checkAdminPrivileges(userId)) bulkFail('Administrator access required.', 403)
  return userId
}
export async function GET(request) {
  try {
    await admin()
    const before = new URL(request.url).searchParams.get('before')
    let cursor = null
    if (before) {
      try { cursor = JSON.parse(Buffer.from(before, 'base64url').toString('utf8')) } catch { bulkFail('Invalid page.') }
      if (!cursor || !Number.isFinite(Date.parse(cursor.at)) || !/^[0-9a-f-]{36}$/.test(cursor.id || '')) bulkFail('Invalid page.')
    }
    const db = await bulkDb()
    const rows = await db.collection('bulkFilamentRequests').find(cursor ? { $or: [{ createdAt: { $lt: new Date(cursor.at) } }, { createdAt: new Date(cursor.at), _id: { $lt: cursor.id } }] } : {})
      .project({ fingerprint: 0 }).sort({ createdAt: -1, _id: -1 }).limit(101).toArray()
    return bulkJson({ requests: rows.slice(0,100), next: rows.length > 100 ? Buffer.from(JSON.stringify({ at: rows[99].createdAt.toISOString(), id: rows[99]._id })).toString('base64url') : null })
  } catch (error) { return bulkFailure(error) }
}
export async function PATCH(request) {
  try {
    bulkSameOrigin(request)
    const userId = await admin(), body = await readBulkJson(request)
    if (typeof body.requestId !== 'string' || !/^[0-9a-f-]{36}$/.test(body.requestId) ||
        !Number.isSafeInteger(body.revision) || body.revision < 0 || !['new','reviewing','contacted','closed'].includes(body.status) ||
        typeof body.ownerNote !== 'string' || body.ownerNote.length > 2000) bulkFail('Check request status and note.')
    const db = await bulkDb()
    const updated = await db.collection('bulkFilamentRequests').findOneAndUpdate({ _id: body.requestId, revision: body.revision },
      { $set: { status: body.status, ownerNote: body.ownerNote.trim(), updatedAt: new Date(), updatedBy: userId }, $inc: { revision: 1 } },
      { returnDocument: 'after', projection: { fingerprint: 0 } })
    if (!updated) bulkFail('Another administrator updated this request. Refresh before saving.', 409, 'stale_request')
    return bulkJson({ request: updated })
  } catch (error) { return bulkFailure(error) }
}
