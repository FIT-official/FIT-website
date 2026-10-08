import { requireWorkshopAccess, verifyWorkshopHomeGroup } from '@/lib/workshopAccess'
import { classroomView, readLesson, submitClassroom, ClassroomError } from '@/lib/workshopClassroomStore'
import { classDb, classJson, classFailure, jsonBody, sameOrigin, limitClassOperation } from '@/lib/workshopHttp'
import { WORKSHOP_SESSION } from '@/lib/workshopFeedback'
export const runtime = 'nodejs'
export async function GET(request) {
    try {
        const access = await requireWorkshopAccess(request); verifyWorkshopHomeGroup(request, access); const db = await classDb()
        const store = db.collection('workshopLessons'), since = new URL(request.url).searchParams.get('since')
        if (access.role === 'student' && since !== null && /^\d+$/.test(since) && new URL(request.url).searchParams.get('seat') === access.seat) {
            const state = await store.findOne({ _id: WORKSHOP_SESSION }, { projection: { version: 1 } })
            if (Number(since) === (state?.version || 0)) return new Response(null, { status: 304, headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie', 'X-Robots-Tag': 'noindex, nofollow' } })
        }
        const state = access.role === 'student' ? await store.findOne({ _id: WORKSHOP_SESSION }, { projection: {
            version: 1, phaseVersion: 1, reviewRound: 1, projectVersion: 1, phase: 1, feedbackOpen: 1, refinementOpen: 1, showFeedback: 1,
            feedback: { $filter: { input: '$feedback', as: 'row', cond: { $and: [{ $eq: ['$$row.presentingGroup', access.group] }, { $eq: ['$$row.visibility', 'visible'] }] } } },
            refinements: { $filter: { input: '$refinements', as: 'row', cond: { $eq: ['$$row.group', access.group] } } },
        } }) : await readLesson(store)
        const view = classroomView(state || await readLesson(store), access)
        const details = access.role === 'student' ? await db.collection('workshopClassDetails').findOne({ _id: WORKSHOP_SESSION + ':' + access.seat }, { projection: { _id: 0, classLink: 1, accountLabel: 1, loginDetails: 1 } }) : null
        return classJson({ ...view, seat: access.seat || null, ownClassDetails: details })
    } catch (error) { return classFailure(error) }
}
export async function POST(request) {
    try {
        sameOrigin(request)
        const access = await requireWorkshopAccess(request); verifyWorkshopHomeGroup(request, access); const input = await jsonBody(request), db = await classDb()
        const { expectedSeat, ...submission } = input
        if (expectedSeat !== undefined && expectedSeat !== access.seat) throw new ClassroomError('Your class account changed. Your draft is kept; sign in again.', 403)
        await limitClassOperation(db, 'submit-' + (access.seat || 'teacher'), 15)
        return classJson(await submitClassroom(db.collection('workshopLessons'), access, submission))
    } catch (error) { return classFailure(error) }
}
