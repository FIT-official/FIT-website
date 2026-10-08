import { authenticate } from '@/lib/authenticate'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'
import { classroomView, readLesson, moderateClassroom, ClassroomError } from '@/lib/workshopClassroomStore'
import { classDb, classJson, classFailure, jsonBody, sameOrigin } from '@/lib/workshopHttp'
import { WORKSHOP_SESSION } from '@/lib/workshopFeedback'
import { validSeat } from '@/lib/workshopCredentials'
async function teacher(request) {
    const { userId } = await authenticate(request)
    if (!await checkAdminPrivileges(userId)) throw new ClassroomError('Teacher access required.', 403)
    return { role: 'teacher', userId, group: null }
}
export async function GET(request) {
    try {
        const access = await teacher(request), db = await classDb()
        const accounts = await db.collection('workshopAccounts').find({ session: WORKSHOP_SESSION }, { projection: { _id: 1, group: 1, enabled: 1, expiresAt: 1 } }).toArray()
        return classJson({ ...classroomView(await readLesson(db.collection('workshopLessons')), access), accounts })
    } catch (error) { return classFailure(error) }
}
export async function PATCH(request) {
    try {
        sameOrigin(request)
        const access = await teacher(request), input = await jsonBody(request), db = await classDb()
        if (input.action === 'revoke') {
            if (!validSeat(input.seat)) throw new ClassroomError('Invalid seat.')
            const result = await db.collection('workshopAccounts').updateOne({ _id: input.seat, session: WORKSHOP_SESSION }, { $set: { enabled: false, revokedAt: new Date(), revokedBy: access.userId } })
            if (!result.matchedCount) throw new ClassroomError('Seat not found.', 404)
            return classJson({ revoked: true })
        }
        return classJson(await moderateClassroom(db.collection('workshopLessons'), access, input))
    } catch (error) { return classFailure(error) }
}
