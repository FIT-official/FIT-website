import { simsAddToClassEnabled } from '@/lib/sims/flags'

export const runtime = 'nodejs'
const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Vary': 'Cookie' }
const allow = 'GET, HEAD, OPTIONS, POST'
const unavailable = () => new Response(null, { status: 404, headers: privateHeaders })

async function dependencies() {
    const [access, store, http, classroom, { WORKSHOP_SESSION }] = await Promise.all([
        import('@/lib/workshopGuestAccess'),
        import('@/lib/workshopGuestClassroomStore'),
        import('@/lib/workshopGuestHttp'),
        import('@/lib/sims/classroom'),
        import('@/lib/workshopFeedback'),
    ])
    return { ...access, ...store, ...http, ...classroom, classDetails: { id: WORKSHOP_SESSION, title: 'Workshop class', href: '/admin/workshop' } }
}

export async function GET(request) {
    if (!simsAddToClassEnabled()) return unavailable()
    const { requireGuestTeacher, readLesson, guestDb, classJson, classFailure, classSimulationIds, classDetails } = await dependencies()
    try {
        await requireGuestTeacher(request)
        const db = await guestDb(), lesson = await readLesson(db.collection('workshopGuestLessons'))
        return classJson({ class: classDetails, simIds: classSimulationIds(lesson), version: lesson.version })
    } catch (error) { return classFailure(error) }
}

export async function POST(request) {
    if (!simsAddToClassEnabled()) return unavailable()
    const { requireGuestTeacher, moderateClassroom, guestDb, classJson, classFailure, sameOrigin, jsonBody, classDetails } = await dependencies()
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

export async function HEAD(request) {
    if (!simsAddToClassEnabled()) return unavailable()
    const response = await GET(request)
    return new Response(null, { status: response.status, headers: response.headers })
}

export function OPTIONS() {
    if (!simsAddToClassEnabled()) return unavailable()
    return new Response(null, { status: 204, headers: { ...privateHeaders, Allow: allow } })
}

function unsupported() {
    if (!simsAddToClassEnabled()) return unavailable()
    return new Response(null, { status: 405, headers: { ...privateHeaders, Allow: allow } })
}

export { unsupported as PUT, unsupported as PATCH, unsupported as DELETE }
