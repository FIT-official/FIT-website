import { describe, it, expect, vi, beforeEach } from 'vitest'
const state = vi.hoisted(() => ({ access: null, connected: vi.fn() }))
vi.mock('@/lib/db', () => ({ connectToDatabase: state.connected }))
vi.mock('@/lib/authenticate', () => {
    class UnauthorizedError extends Error {}
    return { UnauthorizedError, unauthorizedResponse: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) }
})
vi.mock('@/lib/workshopAccess', async () => {
    const { UnauthorizedError } = await import('@/lib/authenticate')
    class WorkshopAccessError extends Error { constructor(message, status) { super(message); this.status = status } }
    return { WorkshopAccessError, requireWorkshopAccess: async () => { if (!state.access) throw new UnauthorizedError(); if (state.access === 'unassigned') throw new WorkshopAccessError('Not assigned', 403); return state.access } }
})
import { POST } from '@/app/api/workshop/feedback/route'
describe('class-only feedback API boundary', () => {
    beforeEach(() => { state.access = null; state.connected.mockReset() })
    it('denies anonymous submission before any database access', async () => {
        const r = await POST(new Request('https://www.fixitoday.com/api/workshop/feedback', { method: 'POST', headers: { origin: 'https://www.fixitoday.com' } }))
        expect(r.status).toBe(401); expect(state.connected).not.toHaveBeenCalled()
    })
    it('denies authenticated but unassigned visitors before submission storage', async () => {
        state.access = 'unassigned'
        expect((await POST(new Request('https://www.fixitoday.com/api/workshop/feedback', { method: 'POST', headers: { origin: 'https://www.fixitoday.com' } }))).status).toBe(403)
        expect(state.connected).not.toHaveBeenCalled()
    })
    it('denies cross-origin class writes', async () => {
        state.access = { role: 'student', group: 'g2' }
        expect((await POST(new Request('https://www.fixitoday.com/api/workshop/feedback', { method: 'POST', headers: { origin: 'https://other.invalid' } }))).status).toBe(403)
        expect(state.connected).not.toHaveBeenCalled()
    })
})
