import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
const fixture = vi.hoisted(() => ({ account: null, rows: new Map(), allowed: true, clerkUser: null, teacher: false }))
vi.mock('@/lib/db', () => ({ connectToDatabase: async () => ({ connection: { db: { collection: name => ({
    updateOne: async () => ({ modifiedCount: fixture.allowed ? 1 : 0 }),
    findOne: async query => name === 'workshopAccounts' ? fixture.account : fixture.rows.get(query._id),
    insertOne: async row => { fixture.rows.set(row._id, row) },
    deleteOne: async query => { fixture.rows.delete(query._id) },
}) } } }) }))
vi.mock('@/lib/authenticate', () => { class UnauthorizedError extends Error {}; return { UnauthorizedError, authenticate: async () => { if (fixture.clerkUser) return { userId: fixture.clerkUser }; throw new UnauthorizedError() } } })
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: async () => fixture.teacher }))
import { POST, DELETE } from '@/app/api/workshop/session/route'
import { requireWorkshopAccess } from '@/lib/workshopAccess'
import { passwordHash } from '@/lib/workshopCredentials'
const base = 'https://www.fixitoday.com', secret = 'synthetic-fixture-only'
const request = (password = secret, origin = base) => new Request(base + '/api/workshop/session', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ seat: 'group1student1', password }) })
describe('temporary individual class authentication', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-09T01:00:00Z')); fixture.rows.clear(); fixture.allowed = true; fixture.clerkUser = null; fixture.teacher = false; fixture.account = { _id: 'group1student1', group: 'g1', session: '2026-10-09', enabled: true, expiresAt: new Date('2026-10-11T00:00:00Z'), passwordHash: passwordHash(secret) } })
    afterEach(() => vi.useRealTimers())
    it('creates only a hashed session token and a Secure HttpOnly scoped expiring cookie', async () => {
        const response = await POST(request()), cookie = response.headers.get('set-cookie'), token = cookie.match(/fit_workshop=([0-9a-f]+)/)[1]
        expect(response.status).toBe(200); expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('Secure'); expect(cookie.toLowerCase()).toContain('samesite=strict'); expect(cookie).toContain('Path=/api/workshop')
        expect([...fixture.rows.keys()]).not.toContain(token); expect(JSON.stringify([...fixture.rows.values()])).not.toContain(secret)
        const access = await requireWorkshopAccess(new Request(base + '/api/workshop/classroom', { headers: { cookie: 'fit_workshop=' + token } }))
        expect(access).toEqual({ role: 'student', group: 'g1', seat: 'group1student1' })
    })
    it('rejects incorrect passwords, cross-origin login and exhausted rate limits', async () => {
        expect((await POST(request('wrong'))).status).toBe(401); expect((await POST(request(secret, 'https://other.invalid'))).status).toBe(403)
        fixture.allowed = false; expect((await POST(request())).status).toBe(429); expect(fixture.rows.size).toBe(0)
    })
    it('invalidates already issued cookies immediately after seat revocation', async () => {
        const response = await POST(request()), token = response.headers.get('set-cookie').match(/fit_workshop=([0-9a-f]+)/)[1]
        fixture.account.enabled = false
        await expect(requireWorkshopAccess(new Request(base + '/api/workshop/classroom', { headers: { cookie: 'fit_workshop=' + token } }))).rejects.toMatchObject({ status: 401 })
    })
    it('expires all temporary seats at the exact authorized Sunday boundary', async () => {
        vi.setSystemTime(new Date('2026-10-11T00:00:00Z'))
        expect((await POST(request())).status).toBe(401); expect(fixture.rows.size).toBe(0)
    })
    it('logout deletes the issued session and clears the scoped cookie', async () => {
        const response = await POST(request()), token = response.headers.get('set-cookie').match(/fit_workshop=([0-9a-f]+)/)[1]
        const logout = await DELETE(new Request(base + '/api/workshop/session', { method: 'DELETE', headers: { origin: base, cookie: 'fit_workshop=' + token } }))
        expect(logout.status).toBe(200); expect(fixture.rows.size).toBe(0); expect(logout.headers.get('set-cookie')).toContain('Max-Age=0')
    })
    it('rejects nonadmin Clerk membership fallback even when a legacy row points at another group seat', async () => {
        fixture.clerkUser = 'synthetic-member'
        fixture.rows.set('2026-10-09:synthetic-member', { enabled: true, group: 'g1', seat: 'group10student4', expiresAt: new Date('2026-10-11T00:00:00Z') })
        await expect(requireWorkshopAccess(new Request(base + '/api/workshop/classroom'))).rejects.toMatchObject({ status: 403 })
        vi.setSystemTime(new Date('2026-10-12T00:00:00Z'))
        await expect(requireWorkshopAccess(new Request(base + '/api/workshop/classroom'))).rejects.toMatchObject({ status: 403 })
    })
    it('retains only the authoritative existing Clerk admin path for teachers', async () => {
        fixture.clerkUser = 'synthetic-admin'; fixture.teacher = true
        expect(await requireWorkshopAccess(new Request(base + '/api/workshop/classroom'))).toEqual({ role: 'teacher', userId: 'synthetic-admin', group: null })
    })
})
