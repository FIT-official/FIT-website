import { requireGuestTeacher } from '@/lib/workshopGuestAccess'
import { guestDb, classJson, classFailure, sameOrigin, jsonBody } from '@/lib/workshopGuestHttp'
import { teacherTinkercadView, changeTinkercadAccess } from '@/lib/workshopTinkercadStore'
export const runtime = 'nodejs'
export async function GET(request) { try { const access = await requireGuestTeacher(request); return classJson(await teacherTinkercadView(await guestDb(), access)) } catch (error) { return classFailure(error) } }
export async function PATCH(request) { try { sameOrigin(request); const access = await requireGuestTeacher(request), input = await jsonBody(request, 14000); return classJson(await changeTinkercadAccess(await guestDb(), access, input)) } catch (error) { return classFailure(error) } }
