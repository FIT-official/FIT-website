import { requireGuestAccess, verifyGuestHome } from '@/lib/workshopGuestAccess'
import { classroomView, submitClassroom, ClassroomError } from '@/lib/workshopGuestClassroomStore'
import { guestDb, classJson, classFailure, sameOrigin, jsonBody, limitGuestOperation } from '@/lib/workshopGuestHttp'
import { workshopTiming } from '@/lib/workshopTiming'
import { readGuestClassroom } from '@/lib/workshopGuestRead'
export const runtime = 'nodejs'
export async function GET(request) {
    const timing = workshopTiming()
    try {
        const { access, state, since } = await readGuestClassroom(request, timing)
        if (since !== null && since === (state?.version || 0)) return timing.finish(new Response(null, { status: 304, headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie', 'X-Robots-Tag': 'noindex, nofollow' } }))
        return timing.finish(classJson({ ...classroomView(state, access), seat: access.seat, studentName: access.name, selfReported: true, guest: true }))
    } catch (error) { return timing.finish(classFailure(error)) }
}
export async function POST(request) { try { sameOrigin(request); const access = await requireGuestAccess(request); verifyGuestHome(request, access); const input = await jsonBody(request), { expectedSeat, ...submission } = input; if (expectedSeat !== access.seat) throw new ClassroomError('Your session changed. Your draft is kept.', 403); const db = await guestDb(); await limitGuestOperation(db, 'submit-' + access.seat, 15); return classJson(await submitClassroom(db.collection('workshopGuestLessons'), access, submission)) } catch (error) { return classFailure(error) } }
