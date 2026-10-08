import { authenticate } from '@/lib/authenticate'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'
import { connectToDatabase } from '@/lib/db'
import { WORKSHOP_SESSION } from './workshopFeedback'
import { activeAccount, parseClassToken, sessionHash, CLASS_EXPIRY } from './workshopCredentials'
export class WorkshopAccessError extends Error {
    constructor(message, status) { super(message); this.status = status }
}
// Students use only the forty temporary, account-validated seat sessions.
// Clerk is used only for the existing authoritative teacher/admin role.
export async function requireWorkshopAccess(request) {
    const token = parseClassToken(request)
    if (token) {
        const db = (await connectToDatabase()).connection.db
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
