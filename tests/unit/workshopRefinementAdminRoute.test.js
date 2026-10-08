import { describe, it, expect, vi, beforeEach } from 'vitest'
const authState = vi.hoisted(() => ({ userId: null, admin: false, db: null, connect: vi.fn() }))
vi.mock('@/lib/authenticate', () => { class UnauthorizedError extends Error {} ; return { UnauthorizedError, authenticate: async () => { if (!authState.userId) throw new UnauthorizedError(); return { userId: authState.userId } } } })
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: async () => authState.admin }))
vi.mock('@/lib/db', () => ({ connectToDatabase: async () => { authState.connect(); return { connection: { db: authState.db } } } }))
import { PATCH } from '@/app/api/admin/workshop/route'
const input = { action: 'refinement', id: 'synthetic-revision', expectedEntryVersion: 1, visibility: 'hidden' }
const req = () => new Request('https://www.fixitoday.com/api/admin/workshop', { method: 'PATCH', headers: { origin: 'https://www.fixitoday.com', 'content-type': 'application/json' }, body: JSON.stringify(input) })
describe('refinement moderation existing admin authorization', () => {
    beforeEach(() => { authState.userId = null; authState.admin = false; authState.db = null; authState.connect.mockClear() })
    it('denies anonymous and existing nonadmin identities before database access', async () => {
        expect((await PATCH(req())).status).toBe(401); authState.userId = 'synthetic-nonadmin'
        expect((await PATCH(req())).status).toBe(403); expect(authState.connect).not.toHaveBeenCalled()
    })
    it('uses the verified existing teacher actor for audit, with private no-store response', async () => {
        let state = { _id: '2026-10-09', version: 1, phase: 'PRESENT', phaseVersion: 0, feedbackOpen: false, refinementOpen: false, showFeedback: false, feedback: [], refinements: [{ id: input.id, group: 'g1', version: 1, entryVersion: 1, visibility: 'visible', ideas: [] }], audit: [] }
        authState.userId = 'synthetic-existing-admin'; authState.admin = true; authState.db = { collection: () => ({ findOne: async () => structuredClone(state), replaceOne: async (q, value) => { if (q.version !== state.version) return { modifiedCount: 0 }; state = structuredClone(value); return { modifiedCount: 1 } } }) }
        const response = await PATCH(req()); expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store')
        expect(state.audit[0].actor).toBe(authState.userId); expect(state.refinements[0].visibility).toBe('hidden'); expect(state.refinements[0].version).toBe(1)
    })
})
