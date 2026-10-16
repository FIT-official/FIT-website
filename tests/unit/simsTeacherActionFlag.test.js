import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    teacher: vi.fn(async () => ({ role: 'teacher', userId: 'synthetic-teacher' })),
    db: vi.fn(), moderate: vi.fn(), entry: vi.fn(),
}))
vi.mock('@/lib/workshopGuestAccess', () => ({ requireGuestTeacher: mocks.teacher }))
vi.mock('@/lib/workshopGuestClassroomStore', () => ({
    classroomView: vi.fn(), readLesson: vi.fn(), moderateClassroom: mocks.moderate, setGuestEntry: mocks.entry,
}))
vi.mock('@/lib/workshopGuestHttp', () => ({
    guestDb: mocks.db,
    sameOrigin: vi.fn(),
    jsonBody: request => request.json(),
    classJson: (body, status = 200) => Response.json(body, { status }),
    classFailure: error => Response.json({ error: error.message }, { status: error.status || 503 }),
}))

import { PATCH } from '@/app/api/admin/workshop/guest/route'

function request(action) {
    return new Request('https://fit.example/api/admin/workshop/guest', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, simId: 'sampling' }),
    })
}

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('SIMS_ADD_TO_CLASS', undefined) })
afterEach(() => vi.unstubAllEnvs())

describe('simulation actions through the existing teacher endpoint', () => {
    it.each(['addSimulation', 'removeSimulation'])('rejects %s before opening a database when disabled', async action => {
        expect((await PATCH(request(action))).status).toBe(404)
        expect(mocks.db).not.toHaveBeenCalled()
        expect(mocks.moderate).not.toHaveBeenCalled()
        expect(mocks.entry).not.toHaveBeenCalled()
    })

    it('retains the enabled assignment path', async () => {
        vi.stubEnv('SIMS_ADD_TO_CLASS', '1')
        const store = {}, collection = vi.fn(() => store)
        mocks.db.mockResolvedValue({ collection })
        mocks.moderate.mockResolvedValue({ saved: true, simIds: ['sampling'] })
        const response = await PATCH(request('addSimulation'))
        expect(response.status).toBe(200)
        expect(collection).toHaveBeenCalledWith('workshopGuestLessons')
        expect(mocks.moderate).toHaveBeenCalledWith(store, { role: 'teacher', userId: 'synthetic-teacher' }, { action: 'addSimulation', simId: 'sampling' })
    })
})
