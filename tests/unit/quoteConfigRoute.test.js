// GET /api/quote/config is public and now also carries the custom-print
// delivery options (named from AppSettings) and the machine limits the
// request page needs to preview a job before sign-in.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ settings: null, product: null, fail: false }))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn(async () => { if (state.fail) throw new Error('db down') }) }))
vi.mock('@/lib/appSettingsId', () => ({ getAppSettingsId: () => 'settings' }))
vi.mock('@/models/AppSettings', () => ({ default: { findById: vi.fn(() => ({ lean: async () => state.settings })) } }))
vi.mock('@/models/Product', () => ({ default: { findOne: vi.fn(() => ({ select: () => ({ lean: async () => state.product }) })) } }))

const get = async () => (await import('@/app/api/quote/config/route')).GET()

beforeEach(() => {
    state.fail = false
    state.settings = {
        printColours: [{ name: 'Blue', hex: '#2356c7' }],
        additionalDeliveryTypes: [
            { name: 'pickup', displayName: 'Collect at Sunview', description: 'Weekdays 10–6' },
            { name: 'courier', displayName: 'Courier (Singapore)', description: '1 to 2 working days' },
        ],
        machineLimits: { maxLengthCm: 25.6, maxWidthCm: 25.6, maxHeightCm: 25.6, maxWeightKg: null },
    }
    state.product = { delivery: { deliveryTypes: [{ type: 'pickup', price: 0 }, { type: 'courier', price: 4, customPrice: 6, customDescription: 'Next day' }] } }
})

describe('GET /api/quote/config', () => {
    it('names the custom-print delivery options, uses the admin override price and exposes machine limits', async () => {
        const body = await (await get()).json()
        expect(body.printColours).toEqual([{ name: 'Blue', hex: '#2356c7' }])
        expect(body.deliveryTypes).toEqual([
            { type: 'pickup', displayName: 'Collect at Sunview', description: 'Weekdays 10–6', price: 0, needsAddress: false },
            { type: 'courier', displayName: 'Courier (Singapore)', description: 'Next day', price: 6, needsAddress: true },
        ])
        expect(body.machineLimits).toEqual({ maxLengthCm: 25.6, maxWidthCm: 25.6, maxHeightCm: 25.6, maxWeightKg: null })
        expect(JSON.stringify(body)).not.toMatch(/quotingConfig|materialRatePerGram/)
    })
    it('offers a collection fallback when no delivery types are configured and no limits when none are set', async () => {
        state.product = null; state.settings = { printColours: [] }
        const body = await (await get()).json()
        expect(body.deliveryTypes).toEqual([expect.objectContaining({ type: 'custom_print', needsAddress: false, fallback: true })])
        expect(body.machineLimits).toBeNull()
        expect(body.printColours.length).toBeGreaterThan(0)
    })
    it('degrades to defaults with a 200 when the database is unavailable', async () => {
        state.fail = true
        const res = await get()
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.deliveryTypes[0].type).toBe('custom_print')
        expect(body.machineLimits).toBeNull()
    })
})
