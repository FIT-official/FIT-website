import { authenticate } from '@/lib/authenticate'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'
import { workshopDatabase } from '@/lib/workshopDatabase'
import { WORKSHOP_SESSION } from './workshopFeedback'
import { activeAccount, parseClassToken, sessionHash, CLASS_EXPIRY } from './workshopCredentials'
export class WorkshopAccessError extends Error {
    constructor(message, status) { super(message); this.status = status }
}
export function verifyWorkshopHomeGroup(request, access) {
    const homeGroup = new URL(request.url).searchParams.get('homeGroup')
    if (homeGroup !== null && !/^g(?:[1-9]|10)$/.test(homeGroup)) throw new WorkshopAccessError('Group page not found.', 404)
    if (access.role === 'student' && homeGroup && homeGroup !== access.group) {
        const error = new WorkshopAccessError('This page belongs to another group. Open your own group classroom.', 403)
        error.homeGroup = access.group
        throw error
    }
}
// Students use only existing enabled, account-validated seat sessions.
// Clerk is used only for the existing authoritative teacher/admin role.
export async function requireWorkshopAccess(request) {
    const token = parseClassToken(request)
    if (token) {
        const db = await workshopDatabase()
        const session = await db.collection('workshopSessions').findOne({ _id: sessionHash(token), session: WORKSHOP_SESSION })
        if (!session || !(session.expiresAt instanceof Date) || session.expiresAt <= new Date() || new Date() >= CLASS_EXPIRY) throw new WorkshopAccessError('Class session expired.', 401)
        const account = await db.collection('workshopAccounts').findOne({ _id: session.seat, session: WORKSHOP_SESSION })
        if (!activeAccount(account)) throw new WorkshopAccessError('This class account is expired or revoked.', 401)
        return { role: 'student', group: account.group, seat: account._id }
    }
    const { userId } = await authenticate(request)
    if (await checkAdminPrivileges(userId)) return { role: 'teacher', userId, group: null }
    throw new WorkshopAccessError('Use your assigned temporary student login for this class.', 403)
}
