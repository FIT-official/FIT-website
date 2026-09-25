// Creator print-farm pricing on the server: POST /api/quote with a
// creatorUserId (live estimate priced with the farm's saved profile, rush
// rules) and POST /api/custom-print/estimate (owner only, creator requests
// only, stored model re-measured, saved as `estimate`, never `quote`).
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
    userId: 'buyer',
    service: null,
    request: null,
    metrics: null,
    updates: [],
    appSettings: { quotingConfig: { materialRatePerGram: 0.1, printTimeRatePerHour: 3, baseFee: 2, minimumPrice: 0, priorityFee: 4 },
        machineLimits: { maxLengthCm: 25, maxWidthCm: 25, maxHeightCm: 25 }, additionalDeliveryTypes: [] },
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: state.userId })) }))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn(async () => {}) }))
vi.mock('@/lib/rateLimit', () => ({ limitQuoteRequest: vi.fn(async () => ({ allowed: true, headers: {} })) }))
vi.mock('@/lib/appSettingsId', () => ({ getAppSettingsId: () => 'settings' }))
vi.mock('@/models/AppSettings', () => ({ default: { findById: vi.fn(() => ({ lean: async () => state.appSettings })) } }))
vi.mock('@/models/Product', () => ({ default: { findOne: vi.fn(() => ({ lean: async () => null })) } }))
vi.mock('@/models/CustomPrintRequest', () => ({
    default: {
        findOne: vi.fn(() => ({ lean: async () => state.request })),
        findOneAndUpdate: vi.fn(async (filter, update) => { state.updates.push({ filter, update }); return { ok: true } }),
    },
}))
vi.mock('@/lib/quoting/loadFarmProfile', async () => {
    const { resolveFarmPricing } = await import('@/lib/quoting/farmProfile')
    return {
        loadFarmProfile: vi.fn(async (creatorUserId, { appSettings } = {}) => {
            const service = state.service && state.service.creatorUserId === creatorUserId ? state.service : null
            return { service, profile: service ? resolveFarmPricing({ recommended: appSettings || state.appSettings, service,
                recommendedDelivery: [{ type: 'pickup', displayName: 'Collect at Sunview', description: '', price: 0, needsAddress: false }] }) : null }
        }),
    }
})
vi.mock('@/lib/quoting/serverGeometry', () => ({
    supportsServerRecompute: (name) => /\.(stl|obj|3mf)$/i.test(name),
    recomputeMetricsFromModel: vi.fn(async () => state.metrics),
}))
vi.mock('@/lib/s3', () => ({ s3: { send: vi.fn(async () => ({ ContentLength: 3, Body: (async function* () { yield new Uint8Array([1, 2, 3]) })() })) } }))
vi.mock('@aws-sdk/client-s3', () => ({ GetObjectCommand: class { constructor(input) { this.input = input } } }))
vi.mock('@/lib/modelImport/file', () => ({ validate3mfBytes: () => {} }))
vi.mock('@/lib/filamentInventory', () => ({ getFilamentAvailability: vi.fn(async () => []), rushAvailability: () => 'out_of_stock' }))
vi.mock('@/lib/notifications/customPrint', () => ({ notifyCustomPrintEvent: vi.fn() }))
vi.mock('@/lib/posthog-server', () => ({ getPostHogClient: () => ({ capture: vi.fn() }) }))

import { POST as quotePOST } from '@/app/api/quote/route'
import { POST as estimatePOST } from '@/app/api/custom-print/estimate/route'
import { getFilamentAvailability } from '@/lib/filamentInventory'
import { calculateInstantQuote } from '@/lib/quoting/quote'

const post = (handler, body) => handler(new Request('http://t/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
const metrics = { volumeCm3: 24, dimensionsCm: { length: 8, width: 4.2, height: 1.8 }, confidence: 'high' }
const settings = { infillPercent: 20, wallLoops: 2, nozzleMm: 0.4, layerHeightMm: 0.2, enableSupport: false }
const preview = (extra = {}) => ({ ...metrics, settings, creatorUserId: 'creator-1', preview: true, selection: { filament: 'petg', colour: 'White' }, ...extra })
const farmService = (pricing = {}) => ({
    creatorUserId: 'creator-1', enabled: true, leadTimeDays: 5,
    pricing: { overrides: { materialRatePerGram: 0.2, printTimeRatePerHour: 1 }, materials: [{ filament: 'petg', priceMultiplier: 1.5 }],
        delivery: [{ type: 'courier', label: 'Courier', price: 8, needsAddress: true }], version: 7, ...pricing },
})
const REQUEST_ID = '11111111-2222-4333-8444-555555555555'
const creatorRequest = (extra = {}) => ({
    requestId: REQUEST_ID, userId: 'buyer', creatorUserId: 'creator-1', status: 'configured', paidAt: null,
    modelFile: { originalName: 'part.stl', s3Key: 'models/buyer/part.stl' },
    printConfiguration: { isConfigured: true, generic: { strength: 'Normal', quality: 'Medium', material: 'PETG', filament: 'petg', colour: 'White' } },
    ...extra,
})

beforeEach(() => {
    vi.clearAllMocks()
    state.userId = 'buyer'
    state.service = farmService()
    state.request = creatorRequest()
    state.metrics = { ...metrics }
    state.updates = []
})

describe('POST /api/quote for a creator print farm', () => {
    it('prices with the farm profile loaded server-side, not Fix It Today rates', async () => {
        const res = await post(quotePOST, preview())
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.estimateOnly).toBe(true)
        expect(body.pricedWith).toEqual({ profile: 'farm', creatorUserId: 'creator-1', version: 7 })
        const expected = calculateInstantQuote({ metrics, settings: { ...settings, materialType: 'petg' },
            pricingOverrides: { ...state.appSettings.quotingConfig, materialRatePerGram: 0.2, printTimeRatePerHour: 1 }, materialMultiplier: 1.5 })
        expect(body.quote.total).toBe(expected.total)
        expect(body.quote.lines.find(l => l.key === 'material').amount).toBe(expected.lines.find(l => l.key === 'material').amount)
        const fit = calculateInstantQuote({ metrics, settings: { ...settings, materialType: 'petg' }, pricingOverrides: state.appSettings.quotingConfig })
        expect(body.quote.total).not.toBe(fit.total)
    })

    it('rejects client-sent rates and takes density from the chosen filament', async () => {
        expect((await post(quotePOST, preview({ materialRatePerGram: 0 }))).status).toBe(400)
        const cheap = await (await post(quotePOST, preview({ settings: { ...settings, materialType: 'abs' } }))).json()
        const plain = await (await post(quotePOST, preview())).json()
        expect(cheap.quote.total).toBe(plain.quote.total)
    })

    it('needs preview:true and no requestId, an enabled farm, and a material and colour it offers', async () => {
        expect((await post(quotePOST, preview({ preview: false }))).status).toBe(400)
        expect((await post(quotePOST, preview({ requestId: REQUEST_ID }))).status).toBe(400)
        expect((await post(quotePOST, preview({ selection: { filament: 'pla', colour: 'Black' } }))).status).toBe(400)
        expect((await post(quotePOST, preview({ selection: { filament: 'petg', colour: 'Hot Pink' } }))).status).toBe(400)
        state.service = { ...farmService(), enabled: false }
        expect((await post(quotePOST, preview())).status).toBe(404)
        expect((await post(quotePOST, preview({ creatorUserId: 'someone-else' }))).status).toBe(404)
    })

    it('rejects rush and priority unless the farm set those fees, and never checks FIT stock', async () => {
        expect((await post(quotePOST, preview({ options: { priority: true } }))).status).toBe(409)
        expect((await post(quotePOST, preview({ options: { expedite: true } }))).status).toBe(409)
        state.service = farmService({ overrides: { priorityFee: 5, expediteSurchargePercent: 30 } })
        const res = await post(quotePOST, preview({ options: { priority: true, expedite: true } }))
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.quote.lines.find(l => l.key === 'priority').amount).toBe(5)
        expect(body.quote.expedite.applied).toBe(true)
        expect(getFilamentAvailability).not.toHaveBeenCalled()
    })

    it('applies the farm machine limits', async () => {
        state.service = farmService({ overrides: { machineLimits: { maxLengthCm: 5 } } })
        const res = await post(quotePOST, preview())
        expect(res.status).toBe(422)
        expect((await res.json()).error).toMatch(/larger than we can print/)
    })
})

describe('POST /api/custom-print/estimate', () => {
    it('re-measures the stored model, prices it with the farm profile and saves only the estimate', async () => {
        const res = await post(estimatePOST, { requestId: REQUEST_ID, options: { postProcessing: true }, deliveryType: 'courier' })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.estimateOnly).toBe(true)
        expect(body.estimate.delivery).toEqual({ type: 'courier', label: 'Courier', price: 8 })
        expect(body.estimate.lines.find(l => l.key === 'delivery').amount).toBe(8)
        expect(body.estimate.inputs.materialMultiplier).toBe(1.5)
        expect(body.estimate.inputs.options).toMatchObject({ postProcessing: true, priority: false })
        const [{ filter, update }] = state.updates
        expect(filter).toMatchObject({ requestId: REQUEST_ID, userId: 'buyer', creatorUserId: 'creator-1', status: 'configured' })
        expect(Object.keys(update.$set).sort()).toEqual(['estimate', 'estimatedAt', 'pricedWith'])
        expect(update.$set.pricedWith).toEqual({ profile: 'farm', creatorUserId: 'creator-1', version: 7 })
        expect(update).not.toHaveProperty('$push')
    })

    it('is for the signed-in owner of a creator request only', async () => {
        state.userId = null
        expect((await post(estimatePOST, { requestId: REQUEST_ID })).status).toBe(401)
        state.userId = 'intruder'
        expect((await post(estimatePOST, { requestId: REQUEST_ID })).status).toBe(403)
        state.userId = 'buyer'
        state.request = creatorRequest({ creatorUserId: null })
        expect((await post(estimatePOST, { requestId: REQUEST_ID })).status).toBe(409)
        state.request = null
        expect((await post(estimatePOST, { requestId: REQUEST_ID })).status).toBe(404)
        expect(state.updates).toHaveLength(0)
    })

    it('refuses once the creator has quoted, and when the farm does not offer the saved material', async () => {
        state.request = creatorRequest({ status: 'quoted' })
        expect((await post(estimatePOST, { requestId: REQUEST_ID })).status).toBe(409)
        state.request = creatorRequest({ printConfiguration: { generic: { material: 'TPU', filament: 'tpu', colour: 'Black' } } })
        expect((await post(estimatePOST, { requestId: REQUEST_ID })).status).toBe(422)
        expect(state.updates).toHaveLength(0)
    })

    it('rejects an unknown delivery option and rush the farm does not offer', async () => {
        expect((await post(estimatePOST, { requestId: REQUEST_ID, deliveryType: 'drone' })).status).toBe(400)
        expect((await post(estimatePOST, { requestId: REQUEST_ID, options: { expedite: true } })).status).toBe(409)
        expect(state.updates).toHaveLength(0)
    })

    it('refuses (409) when the print service is switched off, writing nothing', async () => {
        state.service = { ...farmService(), enabled: false }
        expect((await post(estimatePOST, { requestId: REQUEST_ID })).status).toBe(409)
        expect(state.updates).toHaveLength(0)
    })

    it('asks for review when the stored model cannot be measured', async () => {
        state.metrics = null
        const res = await post(estimatePOST, { requestId: REQUEST_ID })
        expect(res.status).toBe(422)
        expect((await res.json()).manualReviewRequired).toBe(true)
    })
})
