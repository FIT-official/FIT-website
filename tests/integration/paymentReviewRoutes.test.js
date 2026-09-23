// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ actor: 'buyer', admin: false, sessions: [], users: {} }))
const mocks = vi.hoisted(() => ({ find: vi.fn(), update: vi.fn(), exists: vi.fn(), connect: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: state.actor }), clerkClient: async () => ({ users: {} }) }))
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: async () => state.admin }))
vi.mock('@/lib/db', () => ({ connectToDatabase: mocks.connect }))
vi.mock('@/models/User', () => ({ default: { findOne: async ({ userId }) => state.users[userId] || null } }))
vi.mock('@/models/Product', () => ({ default: {} }))
vi.mock('@/models/CheckoutSession', () => ({ default: { find: mocks.find, findOneAndUpdate: mocks.update, exists: mocks.exists } }))

import { GET as customerOrders } from '@/app/api/user/orders/route'
import { GET as adminSessions, PATCH as adminUpdate } from '@/app/api/admin/sessions/route'

const at = '2026-09-23T01:00:00.000Z'
const receipt = { paymentStatus: 'paid', amountTotalCents: 1234, currency: 'sgd', recordedAt: at,
    paymentIntentId: 'pi_private', stripeEventId: 'evt_private', expectedAmountCents: 4321 }
const review = (userId = 'buyer', sessionId = 'cs_review') => ({ sessionId, userId, status: 'reconciliation_required',
    processed: true, createdAt: at, reconciliation: { ...receipt }, digitalProductData: { secret: 'private-download' }, salesData: { secret: 'internal' } })
const request = path => new Request(`https://fit.example${path}`)
const patch = body => new Request('https://fit.example/api/admin/sessions', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const field = (row, path) => path.split('.').reduce((value, key) => value?.[key], row)
const matches = (row, query) => Object.entries(query).every(([key, value]) => {
    const actual = field(row, key)
    if (value && typeof value === 'object') {
        if ('$ne' in value) return actual !== value.$ne
        if ('$gte' in value) return new Date(actual) >= value.$gte && new Date(actual) <= value.$lte
    }
    return actual === value
})
const chain = rows => ({ sort() { return this }, limit(count) { rows = rows.slice(0, count); return this },
    lean: async () => rows, then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject) })
const atomicUpdate = async (query, update) => {
    const row = state.sessions.find(candidate => matches(candidate, query))
    if (!row) return null
    Object.assign(row, update)
    return row
}

beforeEach(() => {
    vi.clearAllMocks()
    state.actor = 'buyer'; state.admin = false
    state.users = { buyer: { orderHistory: [] }, other: { orderHistory: [] } }
    state.sessions = [review(), review('other', 'cs_other'), { sessionId: 'cs_normal', userId: 'buyer', status: 'completed', processed: false, createdAt: at }]
    mocks.find.mockImplementation(query => chain(state.sessions.filter(row => matches(row, query))))
    mocks.update.mockImplementation(atomicUpdate)
    mocks.exists.mockImplementation(async query => state.sessions.some(row => matches(row, query)))
})

describe('customer payment reviews', () => {
    it('requires authentication before reading payment records', async () => {
        state.actor = null
        expect((await customerOrders(request('/api/user/orders'))).status).toBe(401)
        expect(mocks.find).not.toHaveBeenCalled()
    })
    it('returns only the owner receipt fields, even with no fulfilled orders', async () => {
        const response = await customerOrders(request('/api/user/orders?userId=other'))
        expect(await response.json()).toEqual({ orders: [], paymentReviews: [{
            sessionId: 'cs_review', status: 'reconciliation_required',
            receipt: { amountTotalCents: 1234, currency: 'sgd', recordedAt: at },
        }] })
        expect(mocks.find.mock.calls[0][0]).toEqual({ userId: 'buyer', status: 'reconciliation_required', 'reconciliation.paymentStatus': 'paid' })
    })
    it('keeps a captured receipt visible if the old user order document is missing', async () => {
        delete state.users.buyer
        const response = await customerOrders(request('/api/user/orders'))
        expect(response.status).toBe(200)
        expect((await response.json()).paymentReviews).toHaveLength(1)
    })
    it('does not present an incomplete receipt as a confirmed paid review', async () => {
        state.sessions[0].reconciliation.paymentStatus = 'unpaid'
        expect((await (await customerOrders(request('/api/user/orders'))).json()).paymentReviews).toEqual([])
    })
})

describe('admin payment review visibility and locking', () => {
    it('rejects signed-out and non-admin readers/writers before querying sessions', async () => {
        state.actor = null
        expect((await adminSessions(request('/api/admin/sessions'))).status).toBe(401)
        expect((await adminUpdate(patch({ sessionId: 'cs_review', processed: true }))).status).toBe(401)
        state.actor = 'buyer'
        expect((await adminSessions(request('/api/admin/sessions'))).status).toBe(403)
        expect((await adminUpdate(patch({ sessionId: 'cs_review', processed: true }))).status).toBe(403)
        expect(mocks.find).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled()
    })
    it.each(['true', 'false'])('keeps all review receipts visible with processed=%s', async processed => {
        state.admin = true
        const { sessions } = await (await adminSessions(request(`/api/admin/sessions?processed=${processed}`))).json()
        expect(sessions.filter(row => row.status === 'reconciliation_required').map(row => row.sessionId)).toEqual(['cs_review', 'cs_other'])
        expect(mocks.find.mock.calls[1][0]).toEqual({ status: 'reconciliation_required' })
    })
    it('does not let normal-session page limits hide reviews', async () => {
        state.admin = true
        state.sessions.unshift(...Array.from({ length: 150 }, (_, i) => ({ sessionId: `cs_${i}`, status: 'completed', processed: false })))
        const { sessions } = await (await adminSessions(request('/api/admin/sessions?processed=false'))).json()
        expect(sessions).toHaveLength(102)
        expect(sessions[0].status).toBe('reconciliation_required')
    })
    it('rejects processing a review with an atomic status predicate', async () => {
        state.admin = true
        expect((await adminUpdate(patch({ sessionId: 'cs_review', processed: false }))).status).toBe(409)
        expect(state.sessions[0].processed).toBe(true)
        expect(mocks.update.mock.calls[0][0]).toEqual({ sessionId: 'cs_review', status: { $ne: 'reconciliation_required' } })
    })
    it('blocks a processed toggle when the webhook marks the row for review just before the update', async () => {
        state.admin = true
        mocks.update.mockImplementationOnce(async (query, update) => {
            state.sessions[2].status = 'reconciliation_required'
            return atomicUpdate(query, update)
        })
        expect((await adminUpdate(patch({ sessionId: 'cs_normal', processed: true }))).status).toBe(409)
        expect(state.sessions[2].processed).toBe(false)
    })
    it('preserves the processed toggle for normal sessions', async () => {
        state.admin = true
        expect((await adminUpdate(patch({ sessionId: 'cs_normal', processed: true }))).status).toBe(200)
        expect(state.sessions[2].processed).toBe(true)
    })
    it('rejects object session IDs and invalid filters', async () => {
        state.admin = true
        expect((await adminUpdate(patch({ sessionId: { $ne: null }, processed: true }))).status).toBe(400)
        expect((await adminSessions(request('/api/admin/sessions?processed=anything'))).status).toBe(400)
        expect((await adminSessions(request('/api/admin/sessions?startDate=invalid&endDate=2026-09-23'))).status).toBe(400)
        expect(mocks.update).not.toHaveBeenCalled()
    })
})
