import { requireGuestTeacher } from '@/lib/workshopGuestAccess'
import { guestDb, classJson, classFailure } from '@/lib/workshopGuestHttp'
import { requireCanvasEnabled } from '@/lib/workshopCanvasHttp'
import { submissionQuery, listCanvasSubmissions, readCanvasSubmission } from '@/lib/workshopCanvasSubmissions'
export const runtime = 'nodejs'
export async function GET(request) {
    try {
        requireCanvasEnabled()
        const access = await requireGuestTeacher(request), query = submissionQuery(request), db = await guestDb(), store = db.collection('workshopGuestLessons')
        return classJson(query.version ? await readCanvasSubmission(store, access, query) : await listCanvasSubmissions(store, access, query))
    } catch (error) { return classFailure(error) }
}
