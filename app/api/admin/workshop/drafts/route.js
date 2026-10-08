import { authenticate } from '@/lib/authenticate'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'
import { classDb, classJson, classFailure } from '@/lib/workshopHttp'
import { DraftError, draftId, draftTopics, draftView } from '@/lib/workshopDraftStore'
import { WORKSHOP_SESSION } from '@/lib/workshopFeedback'
export const runtime = 'nodejs'
export async function GET(request) { try {
    const { userId } = await authenticate(request)
    if (!await checkAdminPrivileges(userId)) throw new DraftError('Teacher access required.', 403)
    const url = new URL(request.url), group = url.searchParams.get('group'), cursor = url.searchParams.get('cursor')
    if (!/^g(?:[1-9]|10)$/.test(group || '') || cursor && (cursor.length > 100 || !cursor.startsWith(WORKSHOP_SESSION + ':group'))) throw new DraftError('Choose one classroom group.')
    const db = await classDb(), accounts = await db.collection('workshopAccounts').find({ session: WORKSHOP_SESSION, group }, { projection: { _id: 1 } }).limit(10).toArray()
    const ids = accounts.flatMap(account => draftTopics(account._id).map(topic => draftId(account._id, topic)))
    const rows = await db.collection('workshopDrafts').find({ _id: { $in: ids, ...(cursor ? { $gt: cursor } : {}) } }).sort({ _id: 1 }).limit(6).toArray(), shown = rows.slice(0, 5)
    return classJson({ label: 'Unfinished draft recovery snapshots — not submitted responses', group, drafts: shown.map(row => ({ seat: row.seat, group: row.group, ...draftView(row) })), nextCursor: rows.length > 5 ? shown.at(-1)._id : null })
} catch (error) { return classFailure(error) } }
