import { guestDb, classJson, classFailure, sameOrigin, jsonBody, limitGuestOperation } from '@/lib/workshopGuestHttp'
import { guestToken, guestHash, guestAccess, newGuest, guestCookie, requireGuestEnabled, GuestAccessError, guestNamePartMatches } from '@/lib/workshopGuestIdentity'
import { readLesson } from '@/lib/workshopGuestClassroomStore'
import { renewGuestSession, withGuestCookie } from '@/lib/workshopGuestContinuity'
import { prepareGuestJoin, enterGuestGroup, pendingJoinView, guestJoinCandidates } from '@/lib/workshopGuestJoin'
export const runtime = 'nodejs'
export async function GET(request) {
    try {
        requireGuestEnabled()
        const db = await guestDb(), token = guestToken(request), state = await readLesson(db.collection('workshopGuestLessons'))
        let access = null, pending = null
        if (token) {
            try {
                const sessions = db.collection('workshopGuestSessions')
                const row = await sessions.findOne({ _id: guestHash(token) })
                if (row?.joinPending && row.expiresAt > new Date()) pending = pendingJoinView(row)
                else access = await renewGuestSession(sessions, token, row)
            } catch (error) { if (error.status !== 401) throw error }
        }
        const response = classJson({ entryOpen: Boolean(state.entryOpen), ...pending, ...(access ? { seat: access.seat, group: access.group, name: access.name, expiresAt: access.expiresAt } : {}) })
        return access ? withGuestCookie(response, request, access) : response
    } catch (error) { return classFailure(error) }
}
export async function POST(request) {
    try {
        requireGuestEnabled(); sameOrigin(request)
        const input = await jsonBody(request, 500)
        if (!input || Object.keys(input).some(key => !(input.prepare === true ? ['prepare'] : ['name', 'group']).includes(key))) throw new GuestAccessError('Enter your name and choose your group.', 400)
        if (!input.prepare) newGuest(input.group, input.name)
        const db = await guestDb(), lessons = db.collection('workshopGuestLessons'), state = await readLesson(lessons)
        if (!state.entryOpen) throw new GuestAccessError('Your teacher has not opened class entry yet.', 403)
        // Preparing a private browser token must not consume a pupil's join budget.
        // Both operations keep the existing per-IP and global request ceilings.
        const operation = input.prepare === true ? 'entry-prepare' : 'entry'
        await limitGuestOperation(db, operation + '-global', 200)
        await limitGuestOperation(db, operation + '-' + guestHash(request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'shared'), 80)
        const sessions = db.collection('workshopGuestSessions'), oldToken = guestToken(request)
        if (input.prepare === true) {
            const prepared = await prepareGuestJoin(sessions, oldToken), response = classJson({ prepared: true })
            response.headers.set('Set-Cookie', guestCookie(prepared.token, prepared.row.expiresAt)); return response
        }
        if (oldToken) {
                const row = await sessions.findOne({ _id: guestHash(oldToken) })
                if (row?.kind !== 'guest-entry' && !row?.joinPending) {
                    let old
                    try { old = guestAccess(row) } catch { throw new GuestAccessError('Refresh class entry before joining again. Your earlier work is safe.', 401) }
                    const ownedName = guestNamePartMatches(old, input.group, input.name)
                    const candidates = !ownedName && old.group === input.group ? await guestJoinCandidates(sessions, input.group, input.name) : []
                    if (ownedName || candidates.length === 1 && candidates[0].seat === old.seat) {
                    const access = await renewGuestSession(sessions, oldToken, row)
                    return withGuestCookie(classJson({ seat: access.seat, group: access.group, name: access.name, selfReported: true }), request, access)
                    }
                    throw new GuestAccessError('Continue your existing class session. Ask your teacher if the name or group needs checking.', 409)
                }
        }
        const prepared = oldToken ? { token: oldToken } : await prepareGuestJoin(sessions), row = await enterGuestGroup(sessions, lessons, prepared.token, input.group, input.name)
        const response = classJson(row.joinPending ? pendingJoinView(row) : { seat: row.seat, group: row.group, name: row.name, selfReported: true })
        response.headers.set('Set-Cookie', guestCookie(prepared.token, row.expiresAt)); return response
    } catch (error) { return classFailure(error) }
}
export async function DELETE(request) { try { requireGuestEnabled(); sameOrigin(request); const token = guestToken(request); if (token) await (await guestDb()).collection('workshopGuestSessions').updateOne({ _id: guestHash(token) }, { $set: { enabled: false, joinPending: false } }); const response = classJson({ left: true }); response.headers.set('Set-Cookie', guestCookie()); return response } catch (error) { return classFailure(error) } }
