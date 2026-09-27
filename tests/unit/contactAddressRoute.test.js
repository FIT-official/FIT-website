// POST /api/user/contact/address: unit number and state are optional, only
// the known address keys are stored, and the required fields still gate.
// Also pins the shared lib/checkoutAddressGate helpers the cart, checkout,
// breakdown and session routes agree through.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    isAddressComplete,
    missingAddressFields,
    pickAddressFields,
    addressesEqual,
    lineNeedsDeliveryAddress,
    cartNeedsDeliveryAddress,
    deliveryMismatchReason,
    NO_ADDRESS_DELIVERY_TYPES,
} from '@/lib/checkoutAddressGate'

const state = vi.hoisted(() => ({ userId: 'user_1', update: null, stripeUpdate: null }))

vi.mock('@clerk/nextjs/server', () => ({
    auth: vi.fn(async () => ({ userId: state.userId })),
    clerkClient: vi.fn(async () => ({ users: { getUser: vi.fn(async () => ({ publicMetadata: { stripeCustomerId: 'cus_1' } })) } })),
}))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn(async () => {}) }))
vi.mock('@/models/User', () => ({
    default: {
        findOneAndUpdate: vi.fn(async (filter, update) => {
            state.update = update
            return { contact: { address: update.$set['contact.address'] } }
        }),
    },
}))
vi.mock('stripe', () => ({
    default: class { customers = { update: vi.fn(async (id, data) => { state.stripeUpdate = data; return {} }) } },
}))

const post = async (body) => {
    const { POST } = await import('@/app/api/user/contact/address/route')
    return POST(new Request('http://t/api/user/contact/address', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }))
}

beforeEach(() => {
    vi.clearAllMocks()
    state.userId = 'user_1'
    state.update = null
    state.stripeUpdate = null
})

describe('POST /api/user/contact/address', () => {
    it('saves an address with no unit number and no state', async () => {
        const res = await post({ address: { street: '1 Test St', city: 'Singapore', postalCode: '123456', country: 'Singapore' } })
        expect(res.status).toBe(200)
        expect(state.update.$set['contact.address']).toEqual({
            street: '1 Test St', unitNumber: '', city: 'Singapore', state: '', postalCode: '123456', country: 'Singapore',
        })
        expect(state.stripeUpdate.address).toEqual({ line1: '1 Test St', city: 'Singapore', postal_code: '123456', country: 'Singapore' })
        expect(state.stripeUpdate.address).not.toHaveProperty('state')
    })

    it('stores only the known address keys', async () => {
        const res = await post({ address: { street: ' 1 Test St ', unitNumber: '#01-01', city: 'Singapore', state: 'SG', postalCode: '123456', country: 'Singapore', _id: 'x', evil: 'y' } })
        expect(res.status).toBe(200)
        const saved = state.update.$set['contact.address']
        expect(saved).not.toHaveProperty('_id')
        expect(saved).not.toHaveProperty('evil')
        expect(saved.street).toBe('1 Test St')
        expect(state.stripeUpdate.address).toMatchObject({ line1: '1 Test St, #01-01', state: 'SG' })
    })

    it.each([
        ['street', { city: 'Singapore', postalCode: '123456', country: 'Singapore' }],
        ['city', { street: '1 Test St', postalCode: '123456', country: 'Singapore' }],
        ['postalCode', { street: '1 Test St', city: 'Singapore', country: 'Singapore' }],
        ['country', { street: '1 Test St', city: 'Singapore', postalCode: '123456' }],
    ])('still rejects an address missing %s', async (_field, address) => {
        const res = await post({ address })
        expect(res.status).toBe(400)
        expect(state.update).toBeNull()
    })

    it('rejects a missing address body', async () => {
        expect((await post({})).status).toBe(400)
    })

    it('requires sign-in', async () => {
        state.userId = null
        expect((await post({ address: {} })).status).toBe(401)
    })
})

describe('checkoutAddressGate helpers', () => {
    it('counts an address complete without unit number or state', () => {
        expect(isAddressComplete({ street: 'a', city: 'b', postalCode: 'c', country: 'd' })).toBe(true)
        expect(isAddressComplete({ street: 'a', city: 'b', postalCode: '', country: 'd' })).toBe(false)
        expect(missingAddressFields({ street: ' ', country: 'd' })).toEqual(['street', 'city', 'postalCode'])
        expect(isAddressComplete(null)).toBe(false)
    })

    it('picks and compares only the known keys', () => {
        const a = { street: ' 1 St ', city: 'x', postalCode: '1', country: 'SG', _id: 'id1' }
        const b = { street: '1 St', city: 'x', postalCode: '1', country: 'SG', _id: 'id2', unitNumber: '' }
        expect(pickAddressFields(a)).not.toHaveProperty('_id')
        expect(addressesEqual(a, b)).toBe(true)
        expect(addressesEqual(a, { ...b, city: 'y' })).toBe(false)
    })

    it('exempts digital and pickup/collection delivery types from needing an address', () => {
        expect(NO_ADDRESS_DELIVERY_TYPES).toContain('digital')
        expect(lineNeedsDeliveryAddress('digital')).toBe(false)
        expect(lineNeedsDeliveryAddress('Self Pickup')).toBe(false)
        expect(lineNeedsDeliveryAddress('self_collection')).toBe(false)
        expect(lineNeedsDeliveryAddress('courier')).toBe(true)
        expect(lineNeedsDeliveryAddress('printDelivery')).toBe(true)
        expect(lineNeedsDeliveryAddress('')).toBe(true)
        expect(cartNeedsDeliveryAddress([{ chosenDeliveryType: 'digital' }, { chosenDeliveryType: 'pickup' }])).toBe(false)
        expect(cartNeedsDeliveryAddress([{ chosenDeliveryType: 'digital' }, { chosenDeliveryType: 'singpost' }])).toBe(true)
    })

    it('names the first mismatched line in the checkout reason', () => {
        expect(deliveryMismatchReason([{ name: 'A' }, { name: 'Custom 3D Print', deliveryTypeMismatch: true }]))
            .toBe('Pick a delivery option for Custom 3D Print in the cart.')
        expect(deliveryMismatchReason([{ name: 'A' }])).toBeNull()
    })
})
