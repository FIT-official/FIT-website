// /api/cron/blog-scheduled: auth edges, due-post publishing, and the failure
// contract added after run #1481 (18 Oct 2026; the function log shows a
// MongoWaitQueueTimeoutError pool-checkout timeout, cause of exhaustion unknown):
// a database failure returns a retryable 503 instead of throwing into a bare
// 500, and one bad post never blocks the rest of the batch. Convention: mock
// Mongoose at the edges; nothing here proves behaviour against a real MongoDB.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { connectToDatabase, find, updateOne } = vi.hoisted(() => ({ connectToDatabase: vi.fn(), find: vi.fn(), updateOne: vi.fn() }))

vi.mock('@/lib/db', () => ({ connectToDatabase }))
vi.mock('@/models/BlogPost', () => ({ default: { find, updateOne } }))

import { GET } from '@/app/api/cron/blog-scheduled/route'

const request = (token = 'Bearer test-secret') =>
    new Request('http://localhost/api/cron/blog-scheduled', { headers: token ? { authorization: token } : {} })
const post = (id) => ({ _id: id, status: 'draft', scheduledFor: new Date('2026-10-18T00:00:00Z'), publishDate: null })

beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
    find.mockReturnValue({ limit: () => Promise.resolve([]) })
    updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 })
})

describe('auth', () => {
    it('503 when CRON_SECRET is unset, without touching the database', async () => {
        delete process.env.CRON_SECRET
        const res = await GET(request())
        expect(res.status).toBe(503)
        expect(connectToDatabase).not.toHaveBeenCalled()
    })
    it('401 on a wrong or missing bearer token', async () => {
        expect((await GET(request('Bearer nope'))).status).toBe(401)
        expect((await GET(request(''))).status).toBe(401)
        expect(connectToDatabase).not.toHaveBeenCalled()
    })
})

describe('publishing', () => {
    it('publishes every due draft with a compare-and-set write and reports the count', async () => {
        const posts = [post('a'), post('b')]
        find.mockReturnValue({ limit: () => Promise.resolve(posts) })
        const res = await GET(request())
        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({ ok: true, published: 2, alreadyPublished: 0, failed: [] })
        expect(updateOne).toHaveBeenCalledTimes(2)
        const [filter, update] = updateOne.mock.calls[0]
        expect(filter._id).toBe('a')
        expect(filter.$or).toBeDefined()                       // still a draft (statusQuery('draft'))
        expect(filter.scheduledFor).toEqual({ $ne: null, $lte: expect.any(Date) })
        expect(update.$set).toMatchObject({ status: 'published', published: true, scheduledFor: null })
        expect(update.$set.publishDate).toBeInstanceOf(Date)
    })
    it('queries only drafts whose scheduledFor is set and due', async () => {
        await GET(request())
        const filter = find.mock.calls[0][0]
        expect(filter.scheduledFor.$ne).toBeNull()
        expect(filter.scheduledFor.$lte).toBeInstanceOf(Date)
    })
})

describe('idempotency', () => {
    it('a retry after a lost response publishes nothing twice: the post is no longer a due draft', async () => {
        // first request: post is due and gets published
        find.mockReturnValueOnce({ limit: () => Promise.resolve([post('a')]) })
        expect(await (await GET(request())).json()).toMatchObject({ published: 1 })
        // retried request (curl --retry / next tick): the query no longer returns it
        find.mockReturnValueOnce({ limit: () => Promise.resolve([]) })
        expect(await (await GET(request())).json()).toMatchObject({ ok: true, published: 0, failed: [] })
        expect(updateOne).toHaveBeenCalledTimes(1)
    })
    it('a concurrent scheduler that already flipped the post is detected by the compare-and-set, not double-published', async () => {
        find.mockReturnValue({ limit: () => Promise.resolve([post('a')]) })
        updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 }) // the other run won
        const res = await GET(request())
        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({ ok: true, published: 0, alreadyPublished: 1, failed: [] })
    })
    it('keeps an existing publishDate (re-publish of a previously published post does not re-stamp)', async () => {
        const p = post('a'); p.publishDate = new Date('2026-01-01T00:00:00Z')
        find.mockReturnValue({ limit: () => Promise.resolve([p]) })
        await GET(request())
        expect(updateOne.mock.calls[0][1].$set.publishDate).toEqual(new Date('2026-01-01T00:00:00Z'))
    })
})

describe('failure contract (hardening after run #1481)', () => {
    it('the exact production error (pool checkout timeout thrown by the query) -> 503 retryable, not a 500', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const err = new Error('Timed out while checking out a connection from connection pool: timed out after 8000ms')
        err.name = 'MongoWaitQueueTimeoutError'
        find.mockReturnValue({ limit: () => Promise.reject(err) })
        const res = await GET(request())
        errorSpy.mockRestore()
        expect(res.status).toBe(503)
        expect(await res.json()).toEqual({ ok: false, retryable: true, error: 'Database unavailable' })
        expect(updateOne).not.toHaveBeenCalled()
    })
    it('database connection failure -> 503 retryable JSON, never a thrown 500, no secret in the body or log', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        connectToDatabase.mockRejectedValueOnce(new Error('MongoServerSelectionError: connection timed out mongodb+srv://user:pw@cluster'))
        const res = await GET(request())
        expect(JSON.stringify(errorSpy.mock.calls)).not.toMatch(/pw@|mongodb\+srv:\/\/user/)
        errorSpy.mockRestore()
        expect(res.status).toBe(503)
        const body = await res.json()
        expect(body).toEqual({ ok: false, retryable: true, error: 'Database unavailable' })
        expect(JSON.stringify(body)).not.toMatch(/mongodb|pw@|test-secret/)
    })
    it('query failure after connect -> 503 retryable', async () => {
        find.mockReturnValue({ limit: () => Promise.reject(new Error('topology closed')) })
        const res = await GET(request())
        expect(res.status).toBe(503)
        expect(await res.json()).toMatchObject({ ok: false, retryable: true })
    })
    it('one post failing to write does not block the others, is reported, and the response is NOT success (207, ok:false)', async () => {
        find.mockReturnValue({ limit: () => Promise.resolve([post('bad'), post('good')]) })
        updateOne.mockRejectedValueOnce(new Error('write conflict')).mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 })
        const res = await GET(request())
        expect(res.status).toBe(207)
        expect(await res.json()).toMatchObject({ ok: false, published: 1, failed: ['bad'] })
    })
})
