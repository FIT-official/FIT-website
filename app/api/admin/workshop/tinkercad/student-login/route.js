import { requireGuestTeacher } from '@/lib/workshopGuestAccess'
import { guestDb, classJson, classFailure } from '@/lib/workshopGuestHttp'
import { teacherTinkercadStudentLogin } from '@/lib/workshopTinkercadStore'

export const runtime = 'nodejs'

export async function GET(request) {
    try {
        const access = await requireGuestTeacher(request)
        const query = new URL(request.url).searchParams
        if ([...query.keys()].some(key => key !== 'seat') || query.getAll('seat').length !== 1) throw Object.assign(Error('Choose one assigned student.'), { status: 400 })
        return classJson(await teacherTinkercadStudentLogin(await guestDb(), access, query.get('seat')))
    } catch (error) { return classFailure(error) }
}
