// Creator shop settings API: GET/PUT /api/user/shop (owner-scoped, zod
// .strict(), bounded fields, server-authoritative S3-key prefixes) and the
// creator-scoped image upload POST /api/user/shop/upload.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
    userId: 'user_abc',
    userDoc: null,
    updatedDoc: null,
    updateArgs: null,
    s3Sends: [],
}))

vi.mock('@clerk/nextjs/server', () => ({
    auth: vi.fn(async () => ({ userId: state.userId })),
}))
// Creator gate (admin or paid subscription): true by default, flipped in the
// entitlement tests below.
vi.mock('@/lib/requireCreator', () => ({
    requireCreator: vi.fn(async () => state.isCreator !== false),
}))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn(async () => { }) }))
vi.mock('@/models/User', () => ({
    default: {
        findOne: vi.fn(() => ({ lean: async () => state.userDoc })),
        findOneAndUpdate: vi.fn((filter, update, opts) => {
            state.updateArgs = { filter, update, opts }
            return { lean: async () => state.updatedDoc }
        }),
    },
}))
vi.mock('@/lib/s3', () => ({
    s3: { send: vi.fn(async (cmd) => { state.s3Sends.push(cmd); return {} }) },
}))
vi.mock('sharp', () => ({ default: null }))

const putRequest = (body, headers = {}) => {
    const payload = typeof body === 'string' ? body : JSON.stringify(body)
    return new Request('http://t/api/user/shop', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: payload,
    })
}

beforeEach(() => {
    state.userId = 'user_abc'
    state.isCreator = true
    state.userDoc = null
    state.updatedDoc = null
    state.updateArgs = null
    state.s3Sends = []
    vi.clearAllMocks()
})

describe('creator entitlement gate', () => {
    it('PUT returns 403 without admin or paid subscription', async () => {
        state.isCreator = false
        const { PUT } = await import('@/app/api/user/shop/route')
        const res = await PUT(putRequest({ description: 'hi' }))
        expect(res.status).toBe(403)
    })

    it('upload returns 403 without admin or paid subscription', async () => {
        state.isCreator = false
        const { POST } = await import('@/app/api/user/shop/upload/route')
        const form = new FormData()
        form.set('kind', 'logo')
        const res = await POST(new Request('http://x/api/user/shop/upload', { method: 'POST', body: form }))
        expect(res.status).toBe(403)
    })
})

describe('GET /api/user/shop', () => {
    it('rejects unauthenticated callers with 401', async () => {
        state.userId = null
        const { GET } = await import('@/app/api/user/shop/route')
        const res = await GET()
        expect(res.status).toBe(401)
    })

    it('returns empty defaults when the user has no shop yet', async () => {
        state.userDoc = null
        const { GET } = await import('@/app/api/user/shop/route')
        const body = await (await GET()).json()
        expect(body.shop).toEqual({
            bannerImage: '',
            logoImage: '',
            description: '',
            links: [],
            featuredProductIds: [],
            accentColor: '',
            theme: { mode: 'light', font: 'sans' },
            blocks: [],
            published: true,
        })
    })

    it('returns the caller shop subdocument', async () => {
        state.userDoc = {
            shop: {
                bannerImage: 'shops/user_abc/banner-1.jpg',
                description: 'Hello',
                links: [{ label: 'Site', url: 'https://example.com' }],
            },
        }
        const { GET } = await import('@/app/api/user/shop/route')
        const body = await (await GET()).json()
        expect(body.shop.bannerImage).toBe('shops/user_abc/banner-1.jpg')
        expect(body.shop.description).toBe('Hello')
        expect(body.shop.links).toEqual([{ label: 'Site', url: 'https://example.com' }])
        expect(body.shop.logoImage).toBe('') // defaults filled in
    })
})

describe('PUT /api/user/shop', () => {
    it('rejects unauthenticated callers with 401', async () => {
        state.userId = null
        const { PUT } = await import('@/app/api/user/shop/route')
        const res = await PUT(putRequest({ description: 'x' }))
        expect(res.status).toBe(401)
    })

    it('rejects oversized payloads via the Content-Length guard', async () => {
        const { PUT } = await import('@/app/api/user/shop/route')
        const res = await PUT(putRequest({ description: 'x' }, { 'content-length': String(100_000) }))
        expect(res.status).toBe(413)
    })

    it('rejects invalid JSON', async () => {
        const { PUT } = await import('@/app/api/user/shop/route')
        const res = await PUT(putRequest('{nope'))
        expect(res.status).toBe(400)
    })

    it('rejects unknown fields (strict schema)', async () => {
        const { PUT } = await import('@/app/api/user/shop/route')
        const res = await PUT(putRequest({ description: 'ok', isAdmin: true }))
        expect(res.status).toBe(422)
    })

    it('rejects price/rate-style injected fields', async () => {
        const { PUT } = await import('@/app/api/user/shop/route')
        const res = await PUT(putRequest({ price: 0 }))
        expect(res.status).toBe(422)
    })

    it('rejects an oversize description', async () => {
        const { PUT } = await import('@/app/api/user/shop/route')
        const res = await PUT(putRequest({ description: 'x'.repeat(601) }))
        expect(res.status).toBe(422)
    })

    it('rejects more than 6 links and non-http(s) link urls', async () => {
        const { PUT } = await import('@/app/api/user/shop/route')
        const many = Array.from({ length: 7 }, (_, i) => ({ label: `L${i}`, url: 'https://example.com' }))
        expect((await PUT(putRequest({ links: many }))).status).toBe(422)
        expect((await PUT(putRequest({ links: [{ label: 'Bad', url: 'ftp://example.com' }] }))).status).toBe(422)
        expect((await PUT(putRequest({ links: [{ label: 'Bad', url: 'javascript:alert(1)' }] }))).status).toBe(422)
    })

    it('rejects more than 8 featured products', async () => {
        const { PUT } = await import('@/app/api/user/shop/route')
        const ids = Array.from({ length: 9 }, (_, i) => `p${i}`)
        expect((await PUT(putRequest({ featuredProductIds: ids }))).status).toBe(422)
    })

    it('rejects a non-hex accent colour', async () => {
        const { PUT } = await import('@/app/api/user/shop/route')
        expect((await PUT(putRequest({ accentColor: 'red' }))).status).toBe(422)
        expect((await PUT(putRequest({ accentColor: '#12345' }))).status).toBe(422)
    })

    it('rejects image keys outside the caller own shops/<userId>/ prefix', async () => {
        const { PUT } = await import('@/app/api/user/shop/route')
        expect((await PUT(putRequest({ bannerImage: 'shops/user_OTHER/banner.jpg' }))).status).toBe(422)
        expect((await PUT(putRequest({ logoImage: 'admin/uploads/secret.jpg' }))).status).toBe(422)
        expect((await PUT(putRequest({ bannerImage: 'shops/user_abc/../x.jpg' }))).status).toBe(422)
    })

    it('happy path: $sets only provided fields, upserting by userId', async () => {
        state.updatedDoc = {
            shop: {
                description: 'My shop',
                links: [{ label: 'Site', url: 'https://example.com' }],
                featuredProductIds: ['p1', 'p2'],
                accentColor: '#f59e0b',
            },
        }
        const { PUT } = await import('@/app/api/user/shop/route')
        const res = await PUT(putRequest({
            description: 'My shop',
            links: [{ label: 'Site', url: 'https://example.com' }],
            featuredProductIds: ['p1', 'p2'],
            accentColor: '#f59e0b',
        }))
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.shop.description).toBe('My shop')

        expect(state.updateArgs.filter).toEqual({ userId: 'user_abc' })
        expect(state.updateArgs.update.$set).toEqual({
            'shop.description': 'My shop',
            'shop.links': [{ label: 'Site', url: 'https://example.com' }],
            'shop.featuredProductIds': ['p1', 'p2'],
            'shop.accentColor': '#f59e0b',
        })
        expect(state.updateArgs.opts).toMatchObject({ upsert: true, new: true })
    })

    it('accepts clearing an image with an empty string', async () => {
        state.updatedDoc = { shop: { bannerImage: '' } }
        const { PUT } = await import('@/app/api/user/shop/route')
        const res = await PUT(putRequest({ bannerImage: '' }))
        expect(res.status).toBe(200)
        expect(state.updateArgs.update.$set).toEqual({ 'shop.bannerImage': '' })
    })

    it('accepts an own-prefix image key', async () => {
        state.updatedDoc = { shop: { bannerImage: 'shops/user_abc/banner-9.jpg' } }
        const { PUT } = await import('@/app/api/user/shop/route')
        const res = await PUT(putRequest({ bannerImage: 'shops/user_abc/banner-9.jpg' }))
        expect(res.status).toBe(200)
    })

    // Page builder fields: theme, blocks (validateBlocks), published.
    it('accepts theme, published and a valid blocks list, storing the sanitised blocks', async () => {
        state.updatedDoc = { shop: {} }
        const { PUT } = await import('@/app/api/user/shop/route')
        const res = await PUT(putRequest({
            theme: { mode: 'dark', font: 'serif' },
            published: false,
            blocks: [
                { id: 'abcdefgh', type: 'hero', settings: { headline: 'Hi <b>', showBanner: false } },
                { id: 'abcdefgh2', type: 'text', settings: { heading: 'About', body: 'Made in SG' } },
            ],
        }))
        expect(res.status).toBe(200)
        expect(state.updateArgs.update.$set['shop.theme']).toEqual({ mode: 'dark', font: 'serif' })
        expect(state.updateArgs.update.$set['shop.published']).toBe(false)
        expect(state.updateArgs.update.$set['shop.blocks']).toEqual([
            { id: 'abcdefgh', type: 'hero', settings: { headline: 'Hi b', subheadline: '', showBanner: false, showLogo: true } },
            { id: 'abcdefgh2', type: 'text', settings: { heading: 'About', body: 'Made in SG' } },
        ])
    })

    it('rejects an unknown theme mode/font (422) and an unknown block type (400)', async () => {
        const { PUT } = await import('@/app/api/user/shop/route')
        expect((await PUT(putRequest({ theme: { mode: 'neon', font: 'sans' } }))).status).toBe(422)
        expect((await PUT(putRequest({ theme: { mode: 'light', font: 'comic' } }))).status).toBe(422)
        const res = await PUT(putRequest({ blocks: [{ id: 'abcdefgh', type: 'iframe', settings: {} }] }))
        expect(res.status).toBe(400)
        expect((await res.json()).error).toMatch(/unknown block type/)
    })

    it('rejects more than 12 blocks and gallery keys outside the caller prefix', async () => {
        const { PUT } = await import('@/app/api/user/shop/route')
        const many = Array.from({ length: 13 }, (_, i) => ({ id: `block${String(i).padStart(4, '0')}`, type: 'text', settings: {} }))
        expect((await PUT(putRequest({ blocks: many }))).status).toBe(422)
        const foreign = await PUT(putRequest({
            blocks: [{ id: 'abcdefgh', type: 'gallery', settings: { images: ['shops/user_OTHER/g.jpg'] } }],
        }))
        expect(foreign.status).toBe(400)
        const own = await PUT(putRequest({
            blocks: [{ id: 'abcdefgh', type: 'gallery', settings: { images: ['shops/user_abc/gallery-1.jpg'] } }],
        }))
        expect(own.status).toBe(200)
    })
})

describe('POST /api/user/shop/upload', () => {
    // jsdom's FormData/File cannot be serialized into undici's Request, so the
    // route sees a duck-typed request: headers.get + formData() with the same
    // surface the handler reads (get -> file-like objects / strings).
    const fakeFile = (type = 'image/png', size = 10) => ({
        type,
        size,
        name: 'a.png',
        arrayBuffer: async () => new Uint8Array(size).buffer,
    })
    const makeUpload = (file, kind = 'banner', extra = {}) => {
        const fields = new Map(Object.entries({ file, kind, ...extra }))
        return {
            headers: { get: (h) => (h === 'content-length' ? '1000' : null) },
            formData: async () => ({ get: (k) => fields.get(k) ?? null }),
        }
    }

    it('rejects unauthenticated callers with 401', async () => {
        state.userId = null
        const { POST } = await import('@/app/api/user/shop/upload/route')
        const res = await POST(makeUpload(fakeFile()))
        expect(res.status).toBe(401)
    })

    it('rejects oversized bodies via the Content-Length guard', async () => {
        const { POST } = await import('@/app/api/user/shop/upload/route')
        const req = makeUpload(fakeFile())
        req.headers = { get: () => String(50 * 1024 * 1024) }
        const res = await POST(req)
        expect(res.status).toBe(413)
    })

    it('rejects non-image files', async () => {
        const { POST } = await import('@/app/api/user/shop/upload/route')
        const res = await POST(makeUpload(fakeFile('text/plain')))
        expect(res.status).toBe(400)
    })

    it('rejects files over 5MB', async () => {
        const { POST } = await import('@/app/api/user/shop/upload/route')
        const res = await POST(makeUpload(fakeFile('image/png', 6 * 1024 * 1024)))
        expect(res.status).toBe(400)
    })

    it('rejects an invalid kind', async () => {
        const { POST } = await import('@/app/api/user/shop/upload/route')
        const res = await POST(makeUpload(fakeFile(), 'avatar'))
        expect(res.status).toBe(400)
    })

    it('gallery uploads land under the caller prefix and never delete a previous object', async () => {
        const { POST } = await import('@/app/api/user/shop/upload/route')
        const res = await POST(makeUpload(fakeFile(), 'gallery', { existingKey: 'shops/user_abc/gallery-old.jpg' }))
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.key).toMatch(/^shops\/user_abc\/gallery-/)
        expect(state.s3Sends).toHaveLength(1)
    })

    it('uploads under shops/<userId>/ and only deletes existing keys in that prefix', async () => {
        const { POST } = await import('@/app/api/user/shop/upload/route')
        const res = await POST(makeUpload(fakeFile(), 'banner', { existingKey: 'admin/uploads/steal-me.jpg' }))
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.key).toMatch(/^shops\/user_abc\/banner-/)
        // one PutObject, and NO delete of the foreign key
        expect(state.s3Sends).toHaveLength(1)
        expect(state.s3Sends[0].input.Key).toBe(body.key)
    })

    it('deletes the previous image when it belongs to the caller', async () => {
        const { POST } = await import('@/app/api/user/shop/upload/route')
        const res = await POST(makeUpload(fakeFile(), 'logo', { existingKey: 'shops/user_abc/logo-old.jpg' }))
        expect(res.status).toBe(200)
        expect(state.s3Sends).toHaveLength(2)
        expect(state.s3Sends[1].input.Key).toBe('shops/user_abc/logo-old.jpg')
    })
})
