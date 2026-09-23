// Product.listing: POST sets it from the poster's role (client value
// ignored), PUT never changes it, GET honours an optional `listing` filter.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
    userId: 'user_creator',
    role: 'user',
    created: null,
    prevProduct: null,
    updated: null,
    findFilter: null,
}))

vi.mock('@/lib/creatorQuota', () => ({
    reserveCreatorQuota: vi.fn(async () => ({ release: vi.fn() })),
    releaseProductQuota: vi.fn(),
    CreatorQuotaError: class CreatorQuotaError extends Error {},
}))
vi.mock('@clerk/nextjs/server', () => ({
    auth: vi.fn(async () => ({ userId: state.userId })),
    clerkClient: vi.fn(async () => ({
        users: { getUser: vi.fn(async () => ({ publicMetadata: { role: state.role } })) },
    })),
}))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn(async () => { }) }))
vi.mock('@/lib/s3', () => ({ s3: { send: vi.fn(async () => ({})) } }))
vi.mock('@/lib/categoriesHelper', () => ({
    getAllCategoriesServer: vi.fn(async () => []),
    getAllSubcategoriesServer: vi.fn(async () => []),
}))
vi.mock('@/models/User', () => ({
    default: { findOne: vi.fn(() => ({ lean: async () => null })), findOneAndUpdate: vi.fn(async () => null) },
}))
vi.mock('@/models/Product', () => {
    const query = (result) => {
        const q = {
            select: () => q,
            limit: () => q,
            lean: async () => result,
        }
        return q
    }
    return {
        default: {
            findOne: vi.fn(async () => null),
            create: vi.fn(async (doc) => { state.created = doc; return { _id: 'p1', ...doc } }),
            findById: vi.fn(() => ({ lean: async () => state.prevProduct })),
            findByIdAndUpdate: vi.fn(async (id, update) => { state.updated = update; return { _id: id, ...update } }),
            find: vi.fn((filter) => { state.findFilter = filter; return query([]) }),
        },
    }
})

const productBody = (extra = {}) => ({
    creatorUserId: 'user_creator',
    name: 'Vase',
    description: 'A vase',
    images: ['k1'],
    paidAssets: [],
    basePrice: { presentmentCurrency: 'SGD', presentmentAmount: 5 },
    priceCredits: 5,
    productType: 'print',
    ...extra,
})

const json = (url, method, body) =>
    new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

beforeEach(() => {
    state.userId = 'user_creator'
    state.role = 'user'
    state.created = null
    state.prevProduct = null
    state.updated = null
    state.findFilter = null
    vi.clearAllMocks()
})

describe('POST /api/product listing', () => {
    it('binds ownership to the signed-in creator and ignores forged sales and moderation fields', async () => {
        const { POST } = await import('@/app/api/product/route')
        const res = await POST(json('http://t/api/product', 'POST', productBody({ creatorUserId: 'user_victim', sales: [{ price: 500 }], flaggedForModeration: false })))
        expect(res.status).toBe(201)
        expect(state.created.creatorUserId).toBe('user_creator')
        expect(state.created).not.toHaveProperty('sales')
        expect(state.created).not.toHaveProperty('flaggedForModeration')
    })

    it('rejects another account model asset before creating a listing', async () => {
        const { POST } = await import('@/app/api/product/route')
        const res = await POST(json('http://t/api/product', 'POST', productBody({ paidAssets: ['models/user_other/a.stl'] })))
        expect(res.status).toBe(400)
        expect(state.created).toBeNull()
    })

    it("creator posts are listing='creator' even when the client claims 'fit'", async () => {
        const { POST } = await import('@/app/api/product/route')
        const res = await POST(json('http://t/api/product', 'POST', productBody({ listing: 'fit' })))
        expect(res.status).toBe(201)
        expect(state.created.listing).toBe('creator')
    })

    it("admin posts are listing='fit'", async () => {
        state.role = 'admin'
        const { POST } = await import('@/app/api/product/route')
        const res = await POST(json('http://t/api/product', 'POST', productBody({ productType: 'shop' })))
        expect(res.status).toBe(201)
        expect(state.created.listing).toBe('fit')
    })
})

describe('PUT /api/product listing', () => {
    it('preserves an existing URL when only price or stock changes', async () => {
        state.prevProduct = { _id: 'p1', name: 'Vase', slug: 'vase', creatorUserId: 'user_creator', listing: 'creator', images: ['k1'], paidAssets: [] }
        const { PUT } = await import('@/app/api/product/route')
        const res = await PUT(json('http://t/api/product?productId=p1', 'PUT', productBody({ stock: 10, slug: 'forged-url' })))
        expect(res.status).toBe(200)
        expect(state.updated.slug).toBe('vase')
    })

    it('rejects a foreign product before updates or asset deletion', async () => {
        state.prevProduct = { _id: 'p1', creatorUserId: 'user_other', listing: 'creator', images: ['k1'], paidAssets: [] }
        const { PUT } = await import('@/app/api/product/route')
        const res = await PUT(json('http://t/api/product?productId=p1', 'PUT', productBody()))
        expect(res.status).toBe(403)
        expect(state.updated).toBeNull()
    })
    it('keeps the previous listing regardless of the client value', async () => {
        state.prevProduct = { _id: 'p1', creatorUserId: 'user_creator', listing: 'creator', images: ['k1'], paidAssets: [] }
        const { PUT } = await import('@/app/api/product/route')
        const res = await PUT(json('http://t/api/product?productId=p1', 'PUT', productBody({ listing: 'fit' })))
        expect(res.status).toBe(200)
        expect(state.updated.listing).toBe('creator')
    })
})

describe('GET /api/product listing filter', () => {
    it('applies listing=fit to the catalogue filter and ignores unknown values', async () => {
        const { GET } = await import('@/app/api/product/route')
        await GET(new Request('http://t/api/product?productType=shop&listing=fit'))
        expect(state.findFilter).toMatchObject({ productType: 'shop', listing: 'fit', hidden: false })
        await GET(new Request('http://t/api/product?productType=shop&listing=everything'))
        expect(state.findFilter).not.toHaveProperty('listing')
        await GET(new Request('http://t/api/product?creatorUserId=user_creator'))
        expect(state.findFilter).toEqual({ creatorUserId: 'user_creator' })
    })
})
