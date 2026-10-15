import { requireGuestTeacher } from '@/lib/workshopGuestAccess'
import { guestDb, classJson, classFailure, sameOrigin, jsonBody, limitGuestOperation } from '@/lib/workshopGuestHttp'
import { listGuestJoinRequests, resolveGuestJoin } from '@/lib/workshopGuestJoin'
export const runtime = 'nodejs'
export async function GET(request) {
    try {
        await requireGuestTeacher(request)
        const url = new URL(request.url)
        if ([...url.searchParams.keys()].some(key => key !== 'group') || url.searchParams.getAll('group').length !== 1) throw Object.assign(Error('Choose one group.'), { status: 400 })
        const db = await guestDb()
        return classJson({ requests: await listGuestJoinRequests(db.collection('workshopGuestSessions'), url.searchParams.get('group')) })
    } catch (error) { return classFailure(error) }
}
export async function POST(request) {
    try { sameOrigin(request); const access = await requireGuestTeacher(request), input = await jsonBody(request, 1000), db = await guestDb(); await limitGuestOperation(db, 'join-resolve-' + access.userId, 40); return classJson(await resolveGuestJoin(db.collection('workshopGuestSessions'), db.collection('workshopGuestLessons'), access, input)) }
    catch (error) { return classFailure(error) }
}
