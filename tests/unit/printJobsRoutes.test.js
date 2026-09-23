// Creator print jobs API: GET /api/user/print-jobs (own creatorUserId only,
// bounded projection) and PATCH /api/user/print-jobs/[requestId] (ownership in
// the query, transitions via lib/creatorPrintService/jobTransitions, quote
// sets the price + notifies the customer best-effort, reject needs a reason).
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
    userId: 'user_creator',
    isCreator: true,
    jobs: [],
    findArgs: null,
    saved: [],
    notifyCalls: [],
    notifyThrows: false,
}))

vi.mock('@clerk/nextjs/server', () => ({
    auth: vi.fn(async () => ({ userId: state.userId })),
}))
vi.mock('@/lib/requireCreator', () => ({
    requireCreator: vi.fn(async () => state.isCreator !== false),
}))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn(async () => { }) }))
vi.mock('@/lib/notifications/creatorPrint', () => ({
    notifyCustomerCreatorQuote: vi.fn(async (args) => {
        state.notifyCalls.push(args)
        if (state.notifyThrows) throw new Error('smtp down')
    }),
}))

// Minimal document double: findOne(filter) matches on requestId + creatorUserId
// and returns a mutable object with save()/toObject().
const makeDoc = (raw) => {
    const doc = { ...raw, statusHistory: [...(raw.statusHistory || [])] }
    doc.save = vi.fn(async () => { state.saved.push({ ...doc, statusHistory: [...doc.statusHistory] }) })
    doc.toObject = () => {
        const { save, toObject, ...rest } = doc
        return rest
    }
    return doc
}
vi.mock('@/models/CustomPrintRequest', () => ({
    default: {
        find: vi.fn((filter, projection) => {
            state.findArgs = { filter, projection }
            return { sort: () => ({ lean: async () => state.jobs.filter((j) => j.creatorUserId === filter.creatorUserId) }) }
        }),
        findOne: vi.fn(async (filter) => {
            const hit = state.jobs.find((j) => j.requestId === filter.requestId && j.creatorUserId === filter.creatorUserId)
            return hit ? makeDoc(hit) : null
        }),
    },
}))

const patch = async (requestId, body) => {
    const { PATCH } = await import('@/app/api/user/print-jobs/[requestId]/route')
    const req = new Request(`http://t/api/user/print-jobs/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    })
    return PATCH(req, { params: Promise.resolve({ requestId }) })
}

beforeEach(() => {
    state.userId = 'user_creator'
    state.isCreator = true
    state.findArgs = null
    state.saved = []
    state.notifyCalls = []
    state.notifyThrows = false
    state.jobs = [
        {
            requestId: 'req-1', creatorUserId: 'user_creator', userId: 'user_buyer', userEmail: 'b@x.com',
            status: 'configured', basePrice: 0, printFee: 0, currency: 'sgd', modelFile: { originalName: 'a.stl', s3Key: 'models/a.stl' },
            statusHistory: [{ status: 'configured', note: 'x' }],
        },
        { requestId: 'req-2', creatorUserId: 'user_creator', userId: 'user_buyer', status: 'quoted', printFee: 20, currency: 'sgd', statusHistory: [] },
        { requestId: 'req-3', creatorUserId: 'user_creator', userId: 'user_buyer', status: 'paid', statusHistory: [] },
        { requestId: 'req-other', creatorUserId: 'user_someone_else', userId: 'user_buyer', status: 'configured', statusHistory: [] },
    ]
    vi.clearAllMocks()
})

describe('GET /api/user/print-jobs', () => {
    it('gates: 401 unauthenticated, 403 without creator entitlement', async () => {
        const { GET } = await import('@/app/api/user/print-jobs/route')
        state.userId = null
        expect((await GET()).status).toBe(401)
        state.userId = 'user_creator'
        state.isCreator = false
        expect((await GET()).status).toBe(403)
    })

    it('lists only jobs routed to the caller, with a bounded projection', async () => {
        const { GET } = await import('@/app/api/user/print-jobs/route')
        const res = await GET()
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.jobs.map((j) => j.requestId)).toEqual(['req-1', 'req-2', 'req-3'])
        expect(state.findArgs.filter).toEqual({ creatorUserId: 'user_creator' })
        expect(state.findArgs.projection).toMatchObject({ customerNote: 1, modelFile: 1, statusHistory: 1 })
        expect(state.findArgs.projection).not.toHaveProperty('shippingAddress')
        expect(state.findArgs.projection).not.toHaveProperty('stripeSessionId')
    })
})

describe('PATCH /api/user/print-jobs/[requestId]', () => {
    it('gates: 401 / 403 / invalid JSON 400', async () => {
        state.userId = null
        expect((await patch('req-1', { action: 'quote', amount: 1 })).status).toBe(401)
        state.userId = 'user_creator'
        state.isCreator = false
        expect((await patch('req-1', { action: 'quote', amount: 1 })).status).toBe(403)
        state.isCreator = true
        expect((await patch('req-1', '{nope')).status).toBe(400)
    })

    it('another creator job reads as 404 (ownership is in the query)', async () => {
        const res = await patch('req-other', { action: 'quote', amount: 10 })
        expect(res.status).toBe(404)
        expect(state.saved).toHaveLength(0)
    })

    it('rejects unknown actions and out-of-order transitions with 400', async () => {
        expect((await patch('req-1', { action: 'nuke' })).status).toBe(400)
        expect((await patch('req-1', { action: 'printing' })).status).toBe(400) // configured -> printing not allowed
        expect((await patch('req-1', { action: 'accept' })).status).toBe(400)
        expect(state.saved).toHaveLength(0)
    })

    it('quote: validates amount, sets the whole price on printFee, marks manual, notifies the customer', async () => {
        expect((await patch('req-1', { action: 'quote', amount: -1 })).status).toBe(400)
        expect((await patch('req-1', { action: 'quote', amount: 'abc' })).status).toBe(400)
        expect((await patch('req-1', { action: 'quote', amount: 1e9 })).status).toBe(400)

        const res = await patch('req-1', { action: 'quote', amount: 24.999, note: 'Collect <Fri>' })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.job).toMatchObject({ requestId: 'req-1', status: 'quoted', basePrice: 0, printFee: 25, adminNote: 'Collect Fri' })
        const saved = state.saved[0]
        expect(saved.quoteMode).toBe('manual')
        expect(saved.quotedAt).toBeInstanceOf(Date)
        expect(saved.statusHistory.at(-1)).toMatchObject({ status: 'quoted' })
        expect(state.notifyCalls).toHaveLength(1)
        expect(state.notifyCalls[0]).toMatchObject({ amount: 25, note: 'Collect Fri' })
        expect(state.notifyCalls[0].request.requestId).toBe('req-1')
    })

    it('quote still succeeds when the notification leg throws', async () => {
        state.notifyThrows = true
        const res = await patch('req-1', { action: 'quote', amount: 10 })
        expect(res.status).toBe(200)
        expect(state.saved).toHaveLength(1)
    })

    it('accept moves a quoted job to paid; printing/ready/completed follow in order', async () => {
        expect((await (await patch('req-2', { action: 'accept' })).json()).job.status).toBe('paid')
        expect((await (await patch('req-3', { action: 'printing' })).json()).job.status).toBe('printing')
        state.jobs[2].status = 'printing'
        expect((await (await patch('req-3', { action: 'ready' })).json()).job.status).toBe('printed')
        state.jobs[2].status = 'printed'
        expect((await (await patch('req-3', { action: 'completed' })).json()).job.status).toBe('delivered')
        expect(state.notifyCalls).toHaveLength(0)
    })

    it('reject requires a reason and records it in the history as cancelled', async () => {
        expect((await patch('req-1', { action: 'reject' })).status).toBe(400)
        expect((await patch('req-1', { action: 'reject', reason: '   ' })).status).toBe(400)
        const res = await patch('req-1', { action: 'reject', reason: 'Too large for my printer' })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.job.status).toBe('cancelled')
        expect(body.job.statusHistory.at(-1)).toMatchObject({ status: 'cancelled', note: 'Declined by the creator: Too large for my printer' })
    })
})
