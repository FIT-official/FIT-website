import { requireGuestTeacher } from '@/lib/workshopGuestAccess'
import { classroomView, readLesson, moderateClassroom, setGuestEntry } from '@/lib/workshopGuestClassroomStore'
import { guestDb, classJson, classFailure, sameOrigin, jsonBody } from '@/lib/workshopGuestHttp'
export const runtime = 'nodejs'
export async function GET(request) { try { const access = await requireGuestTeacher(request), db = await guestDb(), state = await readLesson(db.collection('workshopGuestLessons')); return classJson({ ...classroomView(state, access), entryOpen: Boolean(state.entryOpen) }) } catch (error) { return classFailure(error) } }
export async function PATCH(request) { try { sameOrigin(request); const access = await requireGuestTeacher(request), input = await jsonBody(request), db = await guestDb(), store = db.collection('workshopGuestLessons'); return classJson(input.action === 'entry' ? await setGuestEntry(store, access, input) : await moderateClassroom(store, access, input)) } catch (error) { return classFailure(error) } }
