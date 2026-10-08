import { requireWorkshopAccess } from '@/lib/workshopAccess'
import { classroomView, readLesson, submitClassroom } from '@/lib/workshopClassroomStore'
import { classDb, classJson, classFailure, jsonBody, sameOrigin, limitClassOperation } from '@/lib/workshopHttp'
import { WORKSHOP_SESSION } from '@/lib/workshopFeedback'
export const runtime = 'nodejs'
export async function GET(request) {
    try {
        const access = await requireWorkshopAccess(request), db = await classDb()
        const view = classroomView(await readLesson(db.collection('workshopLessons')), access)
        const details = access.role === 'student' ? await db.collection('workshopClassDetails').findOne({ _id: WORKSHOP_SESSION + ':' + access.seat }, { projection: { _id: 0, classLink: 1, accountLabel: 1, loginDetails: 1 } }) : null
        return classJson({ ...view, seat: access.seat || null, ownClassDetails: details })
    } catch (error) { return classFailure(error) }
}
export async function POST(request) {
    try {
        sameOrigin(request)
        const access = await requireWorkshopAccess(request), input = await jsonBody(request), db = await classDb()
        await limitClassOperation(db, 'submit-' + (access.seat || 'teacher'), 15)
        return classJson(await submitClassroom(db.collection('workshopLessons'), access, input))
    } catch (error) { return classFailure(error) }
}
