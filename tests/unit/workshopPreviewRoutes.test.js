import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const { rawCollections } = vi.hoisted(() => ({ rawCollections: new Map() }))
vi.mock('@/lib/db', () => ({ connectToDatabase: async () => ({ connection: { db: { collection: name => { if (!rawCollections.has(name)) throw Error('Unexpected collection ' + name); return rawCollections.get(name) } } } }) }))
vi.mock('@/lib/authenticate', () => ({ authenticate: async () => ({ userId: 'synthetic-admin' }), UnauthorizedError: class extends Error {} }))
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: async () => true }))
import { requireWorkshopAccess } from '@/lib/workshopAccess'
import { workshopCollectionPrefix } from '@/lib/workshopDatabase'
import { PATCH } from '@/app/api/admin/workshop/route'
describe('actual auth/admin routes use isolated preview collections', () => {
    beforeEach(() => { rawCollections.clear(); vi.stubEnv('VERCEL_ENV', 'preview'); vi.stubEnv('VERCEL_URL', 'fit-route-test.vercel.app') })
    afterEach(() => vi.unstubAllEnvs())
    it('rejects a production cookie without querying the production session collection', async () => {
        const production = { findOne: vi.fn(async () => ({ seat: 'group1student1', expiresAt: new Date('2026-10-10') })) }, isolated = { findOne: vi.fn(async () => null) }
        rawCollections.set('workshopSessions', production); rawCollections.set(workshopCollectionPrefix() + 'workshopSessions', isolated)
        await expect(requireWorkshopAccess(new Request('https://fit-route-test.vercel.app/api/workshop/classroom', { headers: { cookie: 'fit_workshop=' + 'a'.repeat(64) } }))).rejects.toMatchObject({ status: 401 })
        expect(isolated.findOne).toHaveBeenCalledOnce(); expect(production.findOne).not.toHaveBeenCalled()
    })
    it('revokes only the isolated account through the real protected admin route', async () => {
        const production = { updateOne: vi.fn() }, isolated = { updateOne: vi.fn(async () => ({ matchedCount: 1 })) }
        rawCollections.set('workshopAccounts', production); rawCollections.set(workshopCollectionPrefix() + 'workshopAccounts', isolated)
        const response = await PATCH(new Request('https://fit-route-test.vercel.app/api/admin/workshop', { method: 'PATCH', headers: { origin: 'https://fit-route-test.vercel.app', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'revoke', seat: 'group1student1' }) }))
        expect(response.status).toBe(200); expect(await response.json()).toEqual({ revoked: true }); expect(isolated.updateOne).toHaveBeenCalledOnce(); expect(production.updateOne).not.toHaveBeenCalled()
        expect(isolated.updateOne.mock.calls[0][0]).toEqual({ _id: 'group1student1', session: '2026-10-09' })
    })
})
