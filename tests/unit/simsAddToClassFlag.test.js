// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { simsAddToClassEnabled } from '@/lib/sims/flags'

const h = vi.hoisted(() => ({
    modules: { access: vi.fn(), store: vi.fn(), http: vi.fn(), auth: vi.fn(), database: vi.fn(), db: vi.fn() },
    calls: { requireGuestTeacher: vi.fn(), readLesson: vi.fn(), moderateClassroom: vi.fn(), guestDb: vi.fn(), authenticate: vi.fn(), workshopDatabase: vi.fn(), connectToDatabase: vi.fn() },
}))
vi.mock('@/lib/workshopGuestAccess', () => {
    h.modules.access()
    return { requireGuestTeacher: h.calls.requireGuestTeacher }
})
vi.mock('@/lib/workshopGuestClassroomStore', () => {
    h.modules.store()
    return { readLesson: h.calls.readLesson, moderateClassroom: h.calls.moderateClassroom }
})
vi.mock('@/lib/workshopGuestHttp', () => {
    h.modules.http()
    return { guestDb: h.calls.guestDb }
})
vi.mock('@/lib/authenticate', () => {
    h.modules.auth()
    return { authenticate: h.calls.authenticate }
})
vi.mock('@/lib/workshopDatabase', () => {
    h.modules.database()
    return { workshopDatabase: h.calls.workshopDatabase }
})
vi.mock('@/lib/db', () => {
    h.modules.db()
    return { connectToDatabase: h.calls.connectToDatabase }
})

beforeEach(() => { vi.resetModules(); vi.clearAllMocks() })
afterEach(() => vi.unstubAllEnvs())

const disabledValues = [undefined, '', '0', 'true', 'false', '01', '1 ', ' 1', 'TRUE', '2']
const methods = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
function expectNoWorkshopAccess() {
    for (const factory of Object.values(h.modules)) expect(factory).not.toHaveBeenCalled()
    for (const call of Object.values(h.calls)) expect(call).not.toHaveBeenCalled()
}

describe('add-to-class flag', () => {
    it.each(disabledValues)('is disabled for %s', value => {
        vi.stubEnv('SIMS_ADD_TO_CLASS', value)
        expect(simsAddToClassEnabled()).toBe(false)
    })

    it('enables only the exact value 1 and reads changes on the server', () => {
        vi.stubEnv('SIMS_ADD_TO_CLASS', '1')
        expect(simsAddToClassEnabled()).toBe(true)
        vi.stubEnv('SIMS_ADD_TO_CLASS', undefined)
        expect(simsAddToClassEnabled()).toBe(false)
    })
})

describe('disabled assignment route', () => {
    it.each(disabledValues)('returns 404 for every HTTP method without importing or calling workshop services for %s', async value => {
        vi.stubEnv('SIMS_ADD_TO_CLASS', value)
        const route = await import('@/app/api/admin/workshop/guest/sims/route')
        expectNoWorkshopAccess()
        for (const method of methods) {
            const request = new Request('https://fit.example/api/admin/workshop/guest/sims', { method })
            const response = await route[method](request)
            expect(response.status).toBe(404)
            expect(response.headers.get('cache-control')).toBe('private, no-store')
            expect(await response.text()).toBe('')
            expectNoWorkshopAccess()
        }
    })
})
