// GET /api/checkout/breakdown with custom-print lines (LIVE-A regression).
// The route used to fetch /api/product/custom-print-config over HTTP with no
// session cookie, got a 401, and dropped every custom-print line, so the cart
// summary said "No items in cart" while a quoted line was visible. It now reads
// the custom-print product from the database, keeps quoted lines priced by
// customPrintDisplayPrice, tolerates a missing address (flagged, not a 400) and
// keeps a line whose cart delivery type no longer matches the request.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
    userId: 'user_1',
    user: null,
    request: null,
    product: null,
}))

vi.mock('@/lib/authenticate', () => ({
    authenticate: vi.fn(async () => ({ userId: state.userId })),
    UnauthorizedError: class UnauthorizedError extends Error {},
    unauthorizedResponse: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
}))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn(async () => {}) }))
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: state.userId })) }))
vi.mock('@/models/User', () => ({ default: { findOne: vi.fn(async () => state.user) } }))
vi.mock('@/models/Event', () => ({ default: { find: vi.fn(() => ({ lean: async () => [] })) } }))
vi.mock('@/models/CustomPrintRequest', () => ({
    default: { findOne: vi.fn(async ({ requestId, userId }) => (state.request?.requestId === requestId && userId === state.userId ? state.request : null)) },
}))
vi.mock('@/models/Product', () => ({
    default: { findOne: vi.fn(({ slug }) => ({ lean: async () => (slug === 'custom-print-request' ? state.product : null) })) },
}))
vi.mock('../../app/api/checkout/calculateBreakdown', () => ({
    calculateCartItemBreakdown: vi.fn(async ({ item, product }) => ({
        productId: String(product._id),
        name: product.name,
        quantity: item.quantity || 1,
        price: 10,
        priceBeforeDiscount: 10,
        basePrice: 10,
        variantInfo: [],
        chosenDeliveryType: item.chosenDeliveryType,
        deliveryFee: 2,
        total: 12,
        currency: 'SGD',
    })),
}))

const quotedInstantRequest = () => ({
    requestId: 'req_1',
    userId: 'user_1',
    status: 'quoted',
    quoteMode: 'instant',
    quote: { total: 18.5 },
    basePrice: 0,
    printFee: 0,
    currency: 'sgd',
    delivery: { deliveryTypes: [{ type: 'courier', price: 4 }, { type: 'pickup', price: 0 }] },
})

const fullAddress = { street: '1 Test St', unitNumber: '#01-01', city: 'Singapore', state: 'Singapore', postalCode: '123456', country: 'Singapore' }

beforeEach(() => {
    vi.clearAllMocks()
    state.userId = 'user_1'
    state.request = quotedInstantRequest()
    state.product = { _id: 'prod_cp', name: 'Custom 3D Print', slug: 'custom-print-request', creatorUserId: 'admin' }
    state.user = {
        userId: 'user_1',
        contact: { address: fullAddress },
        cart: [{ productId: 'custom-print:req_1', requestId: 'req_1', quantity: 1, chosenDeliveryType: 'courier', price: 18.5 }],
    }
    global.fetch = vi.fn(async () => { throw new Error('breakdown must not call HTTP for the custom-print product') })
})

const get = async () => {
    const { GET } = await import('@/app/api/checkout/breakdown/route')
    const res = await GET(new Request('https://x/api/checkout/breakdown'))
    return { res, data: await res.json() }
}

describe('GET /api/checkout/breakdown with a quoted custom print', () => {
    it('counts and sums the quoted instant line without fetching custom-print-config over HTTP', async () => {
        const { res, data } = await get()
        expect(res.status).toBe(200)
        expect(data.cartBreakdown).toHaveLength(1)
        const line = data.cartBreakdown[0]
        expect(line).toMatchObject({
            productId: 'custom-print:req_1',
            name: 'Custom 3D Print',
            quantity: 1,
            price: 18.5,
            chosenDeliveryType: 'courier',
            deliveryFee: 4,
            total: 22.5,
            currency: 'SGD',
            customPrintRequestId: 'req_1',
            customPrintStatus: 'quoted',
            needsDeliveryAddress: true,
        })
        expect(data.addressMissing).toBe(false)
        expect(data.needsDeliveryAddress).toBe(true)
        expect(global.fetch).not.toHaveBeenCalled()
    })

    it('charges basePrice + printFee for a manual quote', async () => {
        state.request = { ...quotedInstantRequest(), quoteMode: 'manual', quote: undefined, basePrice: 12, printFee: 3 }
        const { data } = await get()
        expect(data.cartBreakdown[0]).toMatchObject({ price: 15, total: 19 })
    })

    it('still returns the summary when the user has no address, flagged as addressMissing', async () => {
        state.user.contact = {}
        const { res, data } = await get()
        expect(res.status).toBe(200)
        expect(data.cartBreakdown).toHaveLength(1)
        expect(data.cartBreakdown[0].price).toBe(18.5)
        expect(data.addressMissing).toBe(true)
        expect(data.address).toBeNull()
    })

    it('returns a partial saved address raw (known keys only) so the form can prefill it', async () => {
        state.user.contact = { address: { _id: 'addr1', street: '9 Partial Rd', city: 'Singapore', country: 'Singapore' } }
        const { data } = await get()
        expect(data.addressMissing).toBe(true)
        expect(data.address).toEqual({ street: '9 Partial Rd', unitNumber: '', city: 'Singapore', state: '', postalCode: '', country: 'Singapore' })
    })

    it('treats an address without unit number or state as complete', async () => {
        state.user.contact = { address: { ...fullAddress, unitNumber: '', state: '' } }
        const { data } = await get()
        expect(data.addressMissing).toBe(false)
    })

    it('marks a pickup line as not needing an address', async () => {
        state.user.cart[0].chosenDeliveryType = 'pickup'
        const { data } = await get()
        expect(data.cartBreakdown[0]).toMatchObject({ chosenDeliveryType: 'pickup', deliveryFee: 0, needsDeliveryAddress: false })
        expect(data.needsDeliveryAddress).toBe(false)
    })

    it('keeps a line whose cart delivery type the request no longer offers, priced with the default and flagged', async () => {
        state.user.cart[0].chosenDeliveryType = 'drone'
        const { data } = await get()
        expect(data.cartBreakdown).toHaveLength(1)
        expect(data.cartBreakdown[0]).toMatchObject({
            deliveryTypeMismatch: true,
            chosenDeliveryType: 'courier',
            deliveryFee: 4,
            total: 22.5,
        })
        expect(data.cartBreakdown[0].warning).toMatch(/"drone" is no longer offered/)
    })

    it('prices an unquoted custom print at 0 but keeps the line', async () => {
        state.request = { ...quotedInstantRequest(), status: 'pending_config' }
        const { data } = await get()
        expect(data.cartBreakdown).toHaveLength(1)
        expect(data.cartBreakdown[0]).toMatchObject({ price: 0, total: 0, customPrintStatus: 'pending_config' })
    })

    it('blocks a summary whose product is unavailable instead of silently dropping its charge', async () => {
        state.product = null
        const { data } = await get()
        expect(data.error).toContain('no longer available')
    })
})
