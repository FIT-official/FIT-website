import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ signedIn: false, admin: false, row: null, collections: [], writes: 0 }))
vi.mock('@/lib/authenticate', () => {
    class UnauthorizedError extends Error {}
    return { UnauthorizedError, authenticate: async () => {
        if (!h.signedIn) throw new UnauthorizedError()
        return { userId: 'synthetic-teacher' }
    } }
})
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: async () => h.admin }))
vi.mock('@/lib/workshopDatabase', () => ({ workshopDatabase: async () => ({ collection(name) {
    h.collections.push(name)
    if (name !== 'workshopGuestLessons') throw new Error('Unexpected collection')
    return {
        findOne: async () => h.row ? structuredClone(h.row) : null,
        insertOne: async row => { h.writes++; h.row = structuredClone(row) },
        replaceOne: async (query, row) => {
            if (query.version !== h.row?.version) return { modifiedCount: 0 }
            h.writes++; h.row = structuredClone(row); return { modifiedCount: 1 }
        },
    }
} }) }))

import { GET, POST, HEAD, OPTIONS, PUT, PATCH, DELETE } from '@/app/api/admin/workshop/guest/sims/route'
import { simsRegistry } from '@/content/sims/registry'
const origin = 'http://127.0.0.1:3109'
function request(body, requestOrigin = origin) {
    return new Request(origin + '/api/admin/workshop/guest/sims', body === undefined ? {} : {
        method: 'POST', headers: { origin: requestOrigin, 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
}
beforeEach(() => { vi.stubEnv('SIMS_ADD_TO_CLASS', '1'); h.signedIn = false; h.admin = false; h.row = null; h.collections = []; h.writes = 0 })
afterEach(() => vi.unstubAllEnvs())

describe('teacher library assignment route', () => {
    it('preserves authenticated HEAD and method discovery while enabled', async () => {
        expect((await HEAD(request())).status).toBe(401)
        expect(h.collections).toEqual([])
        h.signedIn = h.admin = true
        const response = await HEAD(request())
        expect(response.status).toBe(200)
        expect(await response.text()).toBe('')
        expect(response.headers.get('cache-control')).toContain('no-store')
        expect(OPTIONS().status).toBe(204)
        expect(OPTIONS().headers.get('allow')).toBe('GET, HEAD, OPTIONS, POST')
        for (const handler of [PUT, PATCH, DELETE]) expect(handler().status).toBe(405)
    })

    it.each(['ratio-sweets-share', 'ratio-paint-mix', 'fractions-pizza-party', 'fractions-number-line-jump'])('assigns and reads back %s using the existing mocked class store', async simId => {
        h.signedIn = h.admin = true
        expect((await POST(request({ simId }))).status).toBe(200)
        expect(await (await GET(request())).json()).toMatchObject({ simIds: [simId], version: 1 })
        expect(h.row.simIds).toEqual([simId])
        expect(h.writes).toBe(1)
        expect((await POST(request({ simId }))).status).toBe(200)
        expect(h.writes).toBe(1)
    })
    it('requires existing teacher authentication before any storage access', async () => {
        expect((await GET(request())).status).toBe(401)
        expect((await POST(request({ simId: 'sampling' }))).status).toBe(401)
        h.signedIn = true
        expect((await POST(request({ simId: 'sampling' }))).status).toBe(403)
        expect(h.collections).toEqual([])
        expect(h.writes).toBe(0)
    })

    it('checks origin and existing guest feature gates before storage access', async () => {
        h.signedIn = h.admin = true
        expect((await POST(request({ simId: 'sampling' }, 'https://foreign.example'))).status).toBe(403)
        vi.stubEnv('WORKSHOP_GUEST_ENABLED', 'false')
        expect((await POST(request({ simId: 'sampling' }))).status).toBe(503)
        expect(h.collections).toEqual([])
    })

    it('adds in one request to the existing class model with a private response', async () => {
        h.signedIn = h.admin = true
        const response = await POST(request({ simId: 'sampling' }))
        expect(response.status).toBe(200)
        expect(response.headers.get('cache-control')).toContain('no-store')
        expect(await response.json()).toMatchObject({ saved: true, simIds: ['sampling'], class: { id: '2026-10-09', title: 'Workshop class' } })
        expect(h.collections).toEqual(['workshopGuestLessons'])
        expect(h.writes).toBe(1)
        const retried = await POST(request({ simId: 'sampling' }))
        expect(retried.status).toBe(200)
        expect(h.writes).toBe(1)
        expect(await (await GET(request())).json()).toMatchObject({ simIds: ['sampling'], version: 1 })
    })

    it('rejects arbitrary class fields and unknown simulations without writing', async () => {
        h.signedIn = h.admin = true
        expect((await POST(request({ simId: 'sampling', classId: 'unrelated' }))).status).toBe(400)
        expect((await POST(request({ simId: '../../arbitrary' }))).status).toBe(400)
        expect((await POST(request({ simId: 'unpublished-activity' }))).status).toBe(404)
        expect(h.writes).toBe(0)
    })

    it('rejects a draft assignment through the teacher route', async () => {
        h.signedIn = h.admin = true
        const entry = simsRegistry.find(row => row.id === 'sampling'), originalStatus = entry.status
        entry.status = 'draft'
        try {
            expect((await POST(request({ simId: 'sampling' }))).status).toBe(404)
            expect(h.writes).toBe(0)
        } finally { entry.status = originalStatus }
    })
})
