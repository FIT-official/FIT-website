import { guestDb, classJson, classFailure, sameOrigin, jsonBody, limitGuestOperation } from '@/lib/workshopGuestHttp'
import { guestToken, guestHash, guestAccess, newGuest, guestCookie, requireGuestEnabled, GuestAccessError, guestNameKey } from '@/lib/workshopGuestIdentity'
import { readLesson } from '@/lib/workshopGuestClassroomStore'
import { WORKSHOP_SESSION } from '@/lib/workshopFeedback'
export const runtime = 'nodejs'
export async function GET(request) { try { requireGuestEnabled(); const db = await guestDb(), token = guestToken(request), state = await readLesson(db.collection('workshopGuestLessons')); let access = null; if (token) { try { access = guestAccess(await db.collection('workshopGuestSessions').findOne({ _id: guestHash(token) })) } catch (error) { if (error.status !== 401) throw error } } return classJson({ entryOpen: Boolean(state.entryOpen), ...(access ? { seat: access.seat, group: access.group, name: access.name, expiresAt: access.expiresAt } : {}) }) } catch (error) { return classFailure(error) } }
export async function POST(request) {
    try {
        requireGuestEnabled(); sameOrigin(request)
        const input = await jsonBody(request, 500)
        if (!input || Object.keys(input).some(key => !['name', 'group'].includes(key))) throw new GuestAccessError('Enter your name and choose your group.', 400)
        const created = newGuest(input.group, input.name), db = await guestDb(), lessons = db.collection('workshopGuestLessons'), state = await readLesson(lessons)
        if (!state.entryOpen) throw new GuestAccessError('Your teacher has not opened class entry yet.', 403)
        await limitGuestOperation(db, 'entry-global', 200)
        await limitGuestOperation(db, 'entry-' + guestHash(request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'shared'), 80)
        const sessions = db.collection('workshopGuestSessions'), oldToken = guestToken(request)
        if (oldToken) { try { const old = guestAccess(await sessions.findOne({ _id: guestHash(oldToken) })); if (old.group === input.group && guestNameKey(old.name) === guestNameKey(input.name)) { const response = classJson({ seat: old.seat, group: old.group, name: old.name, selfReported: true }); response.headers.set('Set-Cookie', guestCookie(oldToken, old.expiresAt)); return response } throw new GuestAccessError('Leave your current session before entering another name or group.', 409) } catch (error) { if (error.status !== 401) throw error } }
        await sessions.insertOne(created.record)
        const latest = await lessons.findOne({ _id: WORKSHOP_SESSION }, { projection: { entryOpen: 1 } })
        if (!latest?.entryOpen) { await sessions.deleteOne({ _id: created.record._id }); throw new GuestAccessError('Your teacher just closed entry. Please try again when it opens.', 409) }
        const response = classJson({ seat: created.record.seat, group: created.record.group, name: created.record.name, selfReported: true })
        response.headers.set('Set-Cookie', guestCookie(created.token, created.record.expiresAt)); return response
    } catch (error) { return classFailure(error) }
}
export async function DELETE(request) { try { requireGuestEnabled(); sameOrigin(request); const token = guestToken(request); if (token) await (await guestDb()).collection('workshopGuestSessions').updateOne({ _id: guestHash(token) }, { $set: { enabled: false } }); const response = classJson({ left: true }); response.headers.set('Set-Cookie', guestCookie()); return response } catch (error) { return classFailure(error) } }
