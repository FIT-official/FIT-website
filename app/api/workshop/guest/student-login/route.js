import { guestDb, classJson, classFailure, sameOrigin, jsonBody, limitGuestOperation } from '@/lib/workshopGuestHttp'
import { guestCookie, guestHash, guestToken, requireGuestEnabled } from '@/lib/workshopGuestIdentity'
import { resumeWorkshopStudent, validateStudentLogin } from '@/lib/workshopStudentLogin'

export const runtime = 'nodejs'

export async function POST(request) {
    try {
        requireGuestEnabled(); sameOrigin(request)
        const input = validateStudentLogin(await jsonBody(request, 500)), db = await guestDb()
        // Apply all limits before accessing the private assignment document.
        // A class sharing one school network can still sign in together.
        await limitGuestOperation(db, 'student-login-global', 200)
        await limitGuestOperation(db, 'student-login-ip-' + guestHash(request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'shared'), 80)
        await limitGuestOperation(db, 'student-login-id-' + guestHash(input.studentId.toLowerCase()), 8)
        const { token, access } = await resumeWorkshopStudent(db, input, { token: guestToken(request) })
        const response = classJson({ seat: access.seat, group: access.group, name: access.name, expiresAt: access.expiresAt, selfReported: true })
        response.headers.set('Set-Cookie', guestCookie(token, access.expiresAt))
        return response
    } catch (error) { return classFailure(error) }
}
