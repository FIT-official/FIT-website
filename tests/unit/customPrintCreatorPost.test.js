// /api/custom-print with creator routing: POST accepts an optional JSON
// { creatorUserId } and only honours it when that creator's print service is
// enabled (400 otherwise); creator jobs carry no platform base price. PUT
// stores the sanitised customerNote and notifies the creator (best effort)
// when a creator job first reaches 'configured'.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
    userId: 'user_buyer',
    serviceDoc: null,
    constructed: [],
    existing: null,
    notifyCalls: [],
    notifyThrows: false,
}))

vi.mock('@/lib/creatorQuota', () => ({
    reserveCreatorQuota: vi.fn(async () => ({ release: vi.fn() })),
    releaseProductQuota: vi.fn(),
    CreatorQuotaError: class CreatorQuotaError extends Error {},
}))
vi.mock('@/lib/authenticate', () => {
    class UnauthorizedError extends Error { }
    return {
        UnauthorizedError,
        unauthorizedResponse: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
        authenticate: vi.fn(async () => {
            if (!state.userId) throw new UnauthorizedError('no')
            return { userId: state.userId }
        }),
    }
})
vi.mock('@clerk/nextjs/server', () => ({
    clerkClient: vi.fn(async () => ({
        users: {
            getUser: vi.fn(async () => ({ emailAddresses: [{ emailAddress: 'buyer@x.com' }], firstName: 'Bu', lastName: 'Yer' })),
        },
    })),
}))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn(async () => { }) }))
vi.mock('@aws-sdk/client-s3', () => ({ S3Client: class { }, DeleteObjectCommand: class { } }))
vi.mock('uuid', () => ({ v4: () => '11111111-2222-4333-8444-555555555555' }))
vi.mock('@/models/Product', () => ({
    default: { findOne: vi.fn(() => ({ lean: async () => ({ basePrice: { presentmentAmount: 12 } }) })) },
}))
vi.mock('@/models/CreatorPrintService', () => ({
    default: { findOne: vi.fn(() => ({ lean: async () => state.serviceDoc })) },
}))
vi.mock('@/lib/notifications/creatorPrint', () => ({
    notifyCreatorNewRequest: vi.fn(async (args) => {
        state.notifyCalls.push(args)
        if (state.notifyThrows) throw new Error('smtp down')
    }),
}))
vi.mock('@/models/CustomPrintRequest', () => {
    class FakeRequest {
        constructor(fields) {
            Object.assign(this, fields)
            state.constructed.push(this)
        }
        async save() { this.savedAt = new Date() }
        toObject() {
            const { save, toObject, ...rest } = this
            return rest
        }
    }
    FakeRequest.findOne = vi.fn(async () => state.existing)
    FakeRequest.deleteMany = vi.fn(async () => ({}))
    return { default: FakeRequest }
})

const post = async (body, headers) => {
    const { POST } = await import('@/app/api/custom-print/route')
    const init = { method: 'POST' }
    if (body !== undefined) {
        init.headers = { 'Content-Type': 'application/json', ...(headers || {}) }
        init.body = JSON.stringify(body)
    }
    return POST(new Request('http://t/api/custom-print', init))
}

const put = async (body) => {
    const { PUT } = await import('@/app/api/custom-print/route')
    return PUT(new Request('http://t/api/custom-print', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }))
}

beforeEach(() => {
    state.userId = 'user_buyer'
    state.serviceDoc = null
    state.constructed = []
    state.existing = null
    state.notifyCalls = []
    state.notifyThrows = false
    vi.clearAllMocks()
})

describe('POST /api/custom-print with creatorUserId', () => {
    it('without a body behaves as before: FIT job with the platform base price', async () => {
        const res = await post(undefined)
        expect(res.status).toBe(201)
        const body = await res.json()
        expect(body.requestId).toBe('11111111-2222-4333-8444-555555555555')
        expect(body.creatorUserId).toBeNull()
        expect(state.constructed[0]).toMatchObject({ creatorUserId: null, basePrice: 12, userEmail: 'buyer@x.com', userName: 'Bu Yer' })
    })

    it('returns 400 when the creator has no service or it is disabled', async () => {
        expect((await post({ creatorUserId: 'user_creator' })).status).toBe(400)
        state.serviceDoc = { enabled: false }
        const res = await post({ creatorUserId: 'user_creator' })
        expect(res.status).toBe(400)
        expect((await res.json()).error).toMatch(/not accepting/i)
        expect(state.constructed).toHaveLength(0)
    })

    it('rejects a malformed creatorUserId', async () => {
        expect((await post({ creatorUserId: 42 })).status).toBe(400)
        expect((await post({ creatorUserId: 'x'.repeat(65) })).status).toBe(400)
    })

    it('routes the job to an enabled creator with no platform base price', async () => {
        state.serviceDoc = { enabled: true }
        const res = await post({ creatorUserId: 'user_creator' })
        expect(res.status).toBe(201)
        expect((await res.json()).creatorUserId).toBe('user_creator')
        expect(state.constructed[0]).toMatchObject({ creatorUserId: 'user_creator', basePrice: 0, status: 'pending_upload' })
    })

    it('rejects unauthenticated callers with 401', async () => {
        state.userId = null
        expect((await post({ creatorUserId: 'user_creator' })).status).toBe(401)
    })
})

describe('PUT /api/custom-print for a creator job', () => {
    const existingCreatorJob = () => ({
        requestId: 'req-1',
        userId: 'user_buyer',
        creatorUserId: 'user_creator',
        status: 'pending_upload',
        statusHistory: [],
        save: vi.fn(async function () { this.savedAt = new Date() }),
        toObject() {
            const { save, toObject, ...rest } = this
            return rest
        },
    })

    it('does not let a customer set their own price or mark a request paid', async () => {
        state.existing = existingCreatorJob()
        expect((await put({ requestId: 'req-1', pricing: { printFee: 0 } })).status).toBe(403)
        expect((await put({ requestId: 'req-1', status: 'paid' })).status).toBe(403)
        expect(state.existing.save).not.toHaveBeenCalled()
    })

    it('requires store review before changing an already quoted model', async () => {
        state.existing = { ...existingCreatorJob(), status: 'quoted', printFee: 40 }
        expect((await put({ requestId: 'req-1', printConfiguration: { isConfigured: true } })).status).toBe(409)
        expect(state.existing.save).not.toHaveBeenCalled()
    })

    it('rejects a model key from another customer', async () => {
        state.existing = existingCreatorJob()
        expect((await put({ requestId: 'req-1', modelFile: { s3Key: 'models/user_victim/a.stl' } })).status).toBe(400)
        expect(state.existing.save).not.toHaveBeenCalled()
    })

    it('stores a sanitised customerNote and notifies the creator once configured', async () => {
        state.existing = existingCreatorJob()
        const res = await put({
            requestId: 'req-1',
            modelFile: { originalName: 'a.stl', s3Key: 'models/user_buyer/a.stl', fileSize: 10 },
            customerNote: '  Need it by <Friday> $$ ',
            printConfiguration: { generic: { material: 'PLA', colour: 'Red' }, isConfigured: true },
        })
        expect(res.status).toBe(200)
        expect(state.existing.customerNote).toBe('Need it by Friday')
        expect(state.existing.status).toBe('configured')
        expect(state.notifyCalls).toHaveLength(1)
        expect(state.notifyCalls[0].request).toMatchObject({ requestId: 'req-1', creatorUserId: 'user_creator' })
    })

    it('does not notify a FIT job, and survives a failing notification', async () => {
        state.existing = { ...existingCreatorJob(), creatorUserId: null }
        await put({ requestId: 'req-1', printConfiguration: { isConfigured: true }, modelFile: { originalName: 'a.stl', s3Key: 'models/user_buyer/a.stl' } })
        expect(state.notifyCalls).toHaveLength(0)

        state.existing = existingCreatorJob()
        state.notifyThrows = true
        const res = await put({ requestId: 'req-1', printConfiguration: { isConfigured: true }, modelFile: { originalName: 'a.stl', s3Key: 'models/user_buyer/a.stl' } })
        expect(res.status).toBe(200)
        expect(state.notifyCalls).toHaveLength(1)
    })

    it('does not re-notify a job that was already configured', async () => {
        state.existing = { ...existingCreatorJob(), status: 'configured' }
        await put({ requestId: 'req-1', customerNote: 'update' })
        expect(state.notifyCalls).toHaveLength(0)
        expect(state.existing.customerNote).toBe('update')
    })
})
