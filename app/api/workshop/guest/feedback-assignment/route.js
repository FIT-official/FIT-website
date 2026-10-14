import { requireGuestAccess, verifyGuestHome } from '@/lib/workshopGuestAccess'
import { guestDb, classJson, classFailure, sameOrigin, jsonBody, limitGuestOperation } from '@/lib/workshopGuestHttp'
import { assignFeedbackIdea } from '@/lib/workshopFeedbackAssignment'
export const runtime = 'nodejs'
export async function POST(request) {
    try {
        sameOrigin(request)
        const access = await requireGuestAccess(request); verifyGuestHome(request, access)
        const input = await jsonBody(request)
        if (Object.keys(input).some(key => !['expectedSeat', 'target', 'round', 'projectVersion'].includes(key))) return classJson({ error: 'Invalid assignment request.' }, 400)
        const db = await guestDb(); await limitGuestOperation(db, 'idea-assignment-' + access.seat, 20)
        return classJson(await assignFeedbackIdea(db.collection('workshopGuestLessons'), access, input))
    } catch (error) { return classFailure(error) }
}
