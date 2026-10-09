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
        const res = await POST(json('http://t/api/product', 'POST', productBody({ creatorUserId: 'user_victim', sales: [{ price: 500 }], flaggedForModeration: false, shippingCosts: { unitCost: 0, confirmed: true } })))
        expect(res.status).toBe(201)
        expect(state.created.creatorUserId).toBe('user_creator')
        expect(state.created).not.toHaveProperty('sales')
        expect(state.created).not.toHaveProperty('flaggedForModeration')
        expect(state.created).not.toHaveProperty('shippingCosts')
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
    it('saves complete admin costs and rejects incomplete confirmation', async () => {
        state.role = 'admin'
        const { POST } = await import('@/app/api/product/route')
        const costs = { unitCost: 3, packingCost: 1, deliveryCost: 6.2, confirmed: true }
        expect((await POST(json('http://t/api/product', 'POST', productBody({ productType: 'shop', shippingCosts: costs })))).status).toBe(201)
        expect(state.created.shippingCosts).toEqual(costs)
        state.created = null
        expect((await POST(json('http://t/api/product', 'POST', productBody({ productType: 'shop', shippingCosts: { confirmed: true } })))).status).toBe(400)
        expect(state.created).toBeNull()
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

    // /prints loads its whole catalogue with productType=print and no category
    // (LIVE-B: this used to 400 "Missing productCategory" and the page toasted
    // "Failed to fetch products").
    it('lists the public print catalogue without a category, still hiding hidden/flagged products', async () => {
        const { GET } = await import('@/app/api/product/route')
        const res = await GET(new Request('http://t/api/product?productType=print&listing=fit'))
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ products: [] })
        expect(state.findFilter).toMatchObject({
            productType: 'print',
            listing: 'fit',
            hidden: false,
            flaggedForModeration: { $ne: true },
        })
    })

    it('still requires a category for other unfiltered product types', async () => {
        const { GET } = await import('@/app/api/product/route')
        const res = await GET(new Request('http://t/api/product?productType=service'))
        expect(res.status).toBe(400)
    })
})

it('reads committed inventory on each product request and forbids HTTP caching',async()=>{
  const {GET,dynamic}=await import('@/app/api/product/route')
  const Product=(await import('@/models/Product')).default
  expect(dynamic).toBe('force-dynamic')
  for(const stock of [10,0,3]) {
    const row={_id:'111111111111111111111111',name:'Lanbo PLA',slug:'lanbo-pla',hidden:false,listing:'fit',productType:'shop',stock}
    Product.find.mockImplementationOnce(()=>{const q={select:()=>q,limit:()=>q,lean:async()=>[row]};return q})
    const response=await GET(new Request('http://t/api/product?productType=shop&productCategory=Filament'))
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect((await response.json()).products[0].stock).toBe(stock)
  }
})


describe('PUT /api/product legacy material editing', () => {
    it.each([null, '', 'PLA', 'PETG', 'TPU', 'PVA', 'ABS', 'ASA', 'Specialty', 'PA-CF', 'PC'])('retains an existing %s classification with server validation enabled', async subcategoryId => {
        state.role = 'admin'
        state.prevProduct = { _id: 'p1', creatorUserId: 'user_other', listing: 'fit', images: ['k1'], paidAssets: [], categoryId: 'Filament', subcategoryId }
        const { PUT } = await import('@/app/api/product/route')
        const Product = (await import('@/models/Product')).default
        const res = await PUT(json('http://t/api/product?productId=p1', 'PUT', productBody({ productType: 'shop', categoryId: 'Filament', subcategoryId })))
        expect(res.status).toBe(200)
        expect(state.updated).toMatchObject({ categoryId: 'Filament', subcategoryId, creatorUserId: 'user_other', listing: 'fit' })
        expect(Product.findByIdAndUpdate).toHaveBeenCalledWith('p1', expect.any(Object), { new: true, runValidators: true })
    })
    it('does not waive required product details for a legacy blank classification', async () => {
        state.role = 'admin'
        state.prevProduct = { _id: 'p1', creatorUserId: 'user_other', images: ['k1'], paidAssets: [] }
        const { PUT } = await import('@/app/api/product/route')
        const res = await PUT(json('http://t/api/product?productId=p1', 'PUT', productBody({ name: '', categoryId: 'Filament', subcategoryId: null })))
        expect(res.status).toBe(400)
        expect(state.updated).toBeNull()
    })
})
