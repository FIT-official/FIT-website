import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const { rows, writes } = vi.hoisted(() => ({ rows: new Map(), writes: vi.fn() }))
vi.mock('@/lib/db', () => ({ connectToDatabase: async () => ({ connection: { db: { collection: name => { if (!rows.has(name)) throw Error('Unexpected collection ' + name); return rows.get(name) } } } }) }))
vi.mock('@/lib/authenticate', () => ({ authenticate: async () => ({ userId: 'synthetic-teacher' }), UnauthorizedError: class extends Error {} }))
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: async () => true }))
import { GET, POST } from '@/app/api/workshop/classroom/route'
import { GET as draftsGet, POST as draftsPost } from '@/app/api/workshop/drafts/route'
import { emptyLesson } from '@/lib/workshopClassroomStore'
import { verifyWorkshopHomeGroup } from '@/lib/workshopAccess'
const token = 'a'.repeat(64), origin = 'https://www.example.test'
const request = (path, method = 'GET', body) => new Request(origin + path, { method, headers: { cookie: 'fit_workshop=' + token, origin, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
describe('group-home route membership boundaries', () => {
    beforeEach(() => {
        vi.stubEnv('VERCEL_ENV', 'production'); rows.clear(); writes.mockReset()
        rows.set('workshopSessions', { findOne: async () => ({ seat: 'group1student1', session: '2026-10-09', expiresAt: new Date('2026-10-11') }) })
        rows.set('workshopAccounts', { findOne: async () => ({ _id: 'group1student1', group: 'g1', enabled: true, expiresAt: new Date('2026-10-11') }) })
        rows.set('workshopLessons', { findOne: async () => ({ ...emptyLesson(), version: 1 }), replaceOne: writes })
        rows.set('workshopClassDetails', { findOne: async () => null })
        rows.set('workshopDrafts', { find: () => ({ limit: () => ({ toArray: async () => [] }) }), updateOne: writes })
    })
    afterEach(() => vi.unstubAllEnvs())
    it('reads the authorised group home while preserving the authenticated seat', async () => {
        const response = await GET(request('/api/workshop/classroom?homeGroup=g1')), value = await response.json()
        expect(response.status).toBe(200); expect(value.group).toBe('g1'); expect(value.seat).toBe('group1student1'); expect(value.assignment.target).toBe('g2')
        expect((await draftsGet(request('/api/workshop/drafts?homeGroup=g1'))).status).toBe(200)
    })
    it('denies other group views and both submission/draft writes before persistence', async () => {
        const response = await GET(request('/api/workshop/classroom?homeGroup=g2')); expect(response.status).toBe(403); expect(await response.json()).toMatchObject({ homeGroup: 'g1' })
        expect((await POST(request('/api/workshop/classroom?homeGroup=g2', 'POST', { expectedSeat: 'group1student1' }))).status).toBe(403)
        expect((await draftsGet(request('/api/workshop/drafts?homeGroup=g2'))).status).toBe(403)
        expect((await draftsPost(request('/api/workshop/drafts?homeGroup=g2', 'POST', { seat: 'group1student1' }))).status).toBe(403)
        expect(writes).not.toHaveBeenCalled()
    })
    it('checks malformed groups and allows authorised teachers to inspect any group', () => {
        for (const group of ['g0', 'g11', 'group1']) expect(() => verifyWorkshopHomeGroup(request('/api/workshop/classroom?homeGroup=' + group), { role: 'student', group: 'g1' })).toThrow('Group page not found')
        expect(() => verifyWorkshopHomeGroup(request('/api/workshop/classroom?homeGroup=g10'), { role: 'teacher' })).not.toThrow()
    })
})
