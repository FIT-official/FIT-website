import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ teacher: false, findOne: vi.fn() }))
vi.mock('@/lib/workshopGuestAccess', () => ({ requireGuestTeacher: async () => { if (!h.teacher) throw Object.assign(Error('Teacher access required.'), { status: 403 }); return { role: 'teacher', userId: 'synthetic-teacher' } } }))
vi.mock('@/lib/workshopDatabase', () => ({ workshopDatabase: async () => ({ collection: () => ({ findOne: h.findOne }) }) }))
vi.mock('@/lib/authenticate', () => ({ UnauthorizedError: class extends Error {} }))
import { GET } from '@/app/api/admin/workshop/tinkercad/student-login/route'

const seat = 'guest_11111111-1111-4111-8111-111111111111'
const request = (query = '?seat=' + seat) => new Request('https://www.fixitoday.com/api/admin/workshop/tinkercad/student-login' + query)
beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-16T00:00:00Z'))
    vi.clearAllMocks(); h.teacher = false
    h.findOne.mockResolvedValue({ expiresAt: new Date('2026-11-30T15:59:00Z'), className: 'Friday', classLink: 'https://www.tinkercad.com/joinclass/ABCDEF123', approvals: { [seat]: { approved: true } }, slots: [{ assignedSeat: seat, studentLogin: 'synthetic-private-canary' }] })
})
afterEach(() => vi.useRealTimers())
describe('protected teacher Student ID endpoint', () => {
    it('blocks student and anonymous requests before reading credentials', async () => {
        expect((await GET(request())).status).toBe(403)
        expect(h.findOne).not.toHaveBeenCalled()
    })
    it.each(['', '?seat=', '?seat=invalid', '?seat=' + seat + '&seat=' + seat, '?seat=' + seat + '&all=true'])('rejects non-exact seat queries: %s', async query => {
        h.teacher = true
        const result = await GET(request(query))
        expect(result.status).toBe(400)
        expect(h.findOne).not.toHaveBeenCalled()
        expect(await result.text()).not.toContain('synthetic-private-canary')
    })
    it('uses private no-store headers for success and failure and never logs credentials', async () => {
        const log = vi.spyOn(console, 'log'), error = vi.spyOn(console, 'error')
        for (const teacher of [false, true]) {
            h.teacher = teacher
            const result = await GET(request())
            expect(result.headers.get('cache-control')).toBe('private, no-store')
            expect(result.headers.get('vary')).toBe('Cookie')
            expect(result.headers.get('x-robots-tag')).toBe('noindex, nofollow')
            if (teacher) expect(await result.json()).toMatchObject({ seat, studentLogin: 'synthetic-private-canary', classId: 'ABC-DEF-123' })
        }
        expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled()
        log.mockRestore(); error.mockRestore()
    })
    it('sanitizes unexpected errors instead of echoing a private value', async () => {
        h.teacher = true; h.findOne.mockRejectedValue(Error('synthetic-private-canary'))
        const result = await GET(request())
        expect(result.status).toBe(503)
        expect(await result.text()).not.toContain('synthetic-private-canary')
    })
})
