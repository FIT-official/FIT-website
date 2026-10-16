import { requireGuestTeacher } from '@/lib/workshopGuestAccess'
import { readLesson, moderateClassroom } from '@/lib/workshopGuestClassroomStore'
import { guestDb, classJson, classFailure, sameOrigin, jsonBody } from '@/lib/workshopGuestHttp'
import { classSimulationIds } from '@/lib/sims/classroom'
import { WORKSHOP_SESSION } from '@/lib/workshopFeedback'

export const runtime = 'nodejs'
const classDetails = { id: WORKSHOP_SESSION, title: 'Workshop class', href: '/admin/workshop' }

export async function GET(request) {
    try {
        await requireGuestTeacher(request)
        const db = await guestDb(), lesson = await readLesson(db.collection('workshopGuestLessons'))
        return classJson({ class: classDetails, simIds: classSimulationIds(lesson), version: lesson.version })
    } catch (error) { return classFailure(error) }
}

export async function POST(request) {
    try {
        sameOrigin(request)
        const access = await requireGuestTeacher(request), input = await jsonBody(request, 1000)
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => key !== 'simId')) {
            throw Object.assign(new Error('Choose a simulation from the library.'), { status: 400 })
        }
        const db = await guestDb()
        const result = await moderateClassroom(db.collection('workshopGuestLessons'), access, { action: 'addSimulation', simId: input.simId })
        return classJson({ ...result, class: classDetails })
    } catch (error) { return classFailure(error) }
}
