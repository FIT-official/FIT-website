// lib/quoting/persistInstantQuote: the shared "re-measure the stored model and
// price it" step behind POST /api/quote and the config route's re-quote.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mapPurposeToConfiguration } from '@/lib/quoting/genericPresets'

const state = vi.hoisted(() => ({ updates: [], saved: null, metrics: null, s3Fails: false, stock: 'in_stock', notified: [] }))

vi.mock('@/lib/s3', () => ({ s3: { send: vi.fn(async () => { if (state.s3Fails) throw new Error('boom'); return { ContentLength: 3, Body: (async function* () { yield new Uint8Array([1, 2, 3]) })() } }) } }))
vi.mock('@aws-sdk/client-s3', () => ({ GetObjectCommand: class { constructor(input) { this.input = input } } }))
vi.mock('@/lib/quoting/serverGeometry', () => ({
    supportsServerRecompute: (name) => /\.(stl|obj|3mf)$/i.test(name),
    recomputeMetricsFromModel: vi.fn(async () => state.metrics),
}))
vi.mock('@/lib/modelImport/file', () => ({ validate3mfBytes: () => {} }))
vi.mock('@/lib/filamentInventory', () => ({
    getFilamentAvailability: vi.fn(async () => [{ filament: 'pla', name: 'Jade White', stockStatus: state.stock }]),
    rushAvailability: (colours, filament, colour) => colours.find(c => c.filament === filament && c.name === colour)?.stockStatus || 'unknown',
}))
vi.mock('@/lib/notifications/customPrint', () => ({ notifyCustomPrintEvent: vi.fn(async (args) => { state.notified.push(args.event) }) }))
vi.mock('@/lib/posthog-server', () => ({ getPostHogClient: () => ({ capture: vi.fn() }) }))
vi.mock('@/models/Product', () => ({ default: { findOne: vi.fn(() => ({ lean: async () => ({ delivery: { deliveryTypes: [{ type: 'pickup', price: 0 }, { type: 'courier', price: 6 }] } }) })) } }))
vi.mock('@/models/CustomPrintRequest', () => ({
    default: { findOneAndUpdate: vi.fn(async (filter, update) => { state.updates.push({ filter, update }); return state.saved }) },
}))

import { persistInstantQuote } from '@/lib/quoting/persistInstantQuote'

const request = (overrides = {}) => ({ requestId: '11111111-2222-4333-8444-555555555555', userId: 'buyer', status: 'configured', quoteMode: 'instant',
    paidAt: null, creatorUserId: null, updatedAt: new Date('2026-09-24T01:00:00Z'),
    modelFile: { originalName: 'part.stl', s3Key: 'models/buyer/part.stl' },
    printConfiguration: { ...mapPurposeToConfiguration({ purpose: 'Normal', colour: 'Jade White' }), isConfigured: true, configuredAt: new Date('2026-09-24T01:00:00Z') },
    ...overrides })
const appSettings = { quotingConfig: { minimumPrice: 0 }, additionalDeliveryTypes: [], machineLimits: { maxLengthCm: 20 } }

beforeEach(() => {
    state.updates = []; state.s3Fails = false; state.stock = 'in_stock'; state.notified = []
    state.metrics = { volumeCm3: 50, dimensionsCm: { length: 5, width: 4, height: 3 }, confidence: 'high' }
    state.saved = { toObject: () => ({ requestId: 'r' }) }
    vi.clearAllMocks()
})

describe('persistInstantQuote', () => {
    it('prices the stored model and writes the verified quote, status and delivery defaults', async () => {
        const result = await persistInstantQuote({ request: request(), userId: 'buyer', body: { options: { postProcessing: true } }, appSettings })
        expect(result.status).toBe(200)
        expect(result.body.quote.total).toBeGreaterThan(0)
        expect(result.body.quote.inputs.options).toEqual({ postProcessing: true, specialRequest: false, priority: false, expedite: false })
        expect(state.updates).toHaveLength(1)
        const { filter, update } = state.updates[0]
        expect(filter).toMatchObject({ requestId: request().requestId, userId: 'buyer', status: 'configured', quoteMode: 'instant', 'modelFile.s3Key': 'models/buyer/part.stl' })
        expect(update.$set).toMatchObject({ status: 'quoted', quoteMode: 'instant', delivery: { deliveryTypes: [{ type: 'pickup', price: 0 }, { type: 'courier', price: 6 }] } })
        expect(update.$set.quote.inputs.volumeCm3).toBe(50)
        expect(state.notified).toEqual(['quote-ready'])
    })
    it('previews with unsaved settings and writes nothing', async () => {
        const result = await persistInstantQuote({ request: request({ status: 'pending_config', quoteMode: null }), userId: 'buyer', preview: true,
            body: { settings: { wallLoops: 4, infillPercent: 40, materialType: 'pla' }, options: {} }, appSettings })
        expect(result.status).toBe(200)
        expect(result.body).toMatchObject({ preview: true, geometryVerified: true })
        expect(state.updates).toHaveLength(0)
    })
    it('asks for a manual review when the stored model cannot be re-measured', async () => {
        state.s3Fails = true
        const result = await persistInstantQuote({ request: request(), userId: 'buyer', body: {}, appSettings })
        expect(result).toMatchObject({ status: 422, body: { manualReviewRequired: true } })
        expect(state.updates).toHaveLength(0)
    })
    it('refuses rush for an out-of-stock colour and enforces machine limits', async () => {
        state.stock = 'out_of_stock'
        expect((await persistInstantQuote({ request: request(), userId: 'buyer', body: { options: { expedite: true } }, appSettings })).status).toBe(409)
        state.stock = 'in_stock'
        state.metrics = { volumeCm3: 50, dimensionsCm: { length: 25, width: 4, height: 3 }, confidence: 'high' }
        const result = await persistInstantQuote({ request: request(), userId: 'buyer', body: {}, appSettings })
        expect(result.status).toBe(422)
        expect(result.body.error).toMatch(/larger than we can print/)
    })
    it('guards ownership, creator jobs, locked statuses and unsaved settings', async () => {
        expect((await persistInstantQuote({ request: request(), userId: 'other', body: {}, appSettings })).status).toBe(403)
        expect((await persistInstantQuote({ request: request({ creatorUserId: 'c' }), userId: 'buyer', body: {}, appSettings })).status).toBe(409)
        expect((await persistInstantQuote({ request: request({ status: 'paid' }), userId: 'buyer', body: {}, appSettings })).status).toBe(409)
        expect((await persistInstantQuote({ request: request({ quoteMode: 'manual' }), userId: 'buyer', body: {}, appSettings })).status).toBe(409)
    })
    it('reports a concurrent change when the guarded update matches nothing', async () => {
        state.saved = null
        const result = await persistInstantQuote({ request: request(), userId: 'buyer', body: {}, appSettings })
        expect(result.status).toBe(409)
        expect(result.body.error).toMatch(/changed while its quote/)
    })
})
