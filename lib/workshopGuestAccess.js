import { workshopDatabase } from './workshopDatabase'
import { guestToken, guestHash, guestAccess, GuestAccessError, requireGuestEnabled } from './workshopGuestIdentity'
import { authenticate } from './authenticate'
import { checkAdminPrivileges } from './checkPrivileges'
export async function requireGuestAccess(request) {
    requireGuestEnabled()
    const token = guestToken(request)
    if (!token) throw new GuestAccessError('Choose your group and enter your name.', 401)
    const db = await workshopDatabase()
    const row = await db.collection('workshopGuestSessions').findOne({ _id: guestHash(token) }, { projection: { session: 1, seat: 1, group: 1, name: 1, enabled: 1, expiresAt: 1 } })
    return guestAccess(row)
}
export function verifyGuestHome(request, access) {
    const group = new URL(request.url).searchParams.get('homeGroup')
    if (group !== null && group !== access.group) { const error = new GuestAccessError('Open your own group classroom.', 403); error.homeGroup = access.group; throw error }
}
export async function requireGuestTeacher(request) {
    requireGuestEnabled()
    const { userId } = await authenticate(request)
    if (!await checkAdminPrivileges(userId)) throw new GuestAccessError('Teacher access required.', 403)
    return { role: 'teacher', userId }
}
