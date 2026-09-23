// POST /api/quote hardening: body-size enforcement against real bytes (not a
// spoofable Content-Length header), and a machine-limit re-check against the
// server-recomputed dimensions (not just the client-submitted ones) once a
// server geometry recompute succeeds.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }))

vi.mock('@clerk/nextjs/server', () => ({ auth }))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/lib/rateLimit', () => ({
    limitQuoteRequest: vi.fn(async () => ({ allowed: true, headers: {} })),
}))
vi.mock('@/models/AppSettings', () => ({ default: { findById: vi.fn() } }))
vi.mock('@/models/CustomPrintRequest', () => ({ default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() } }))
vi.mock('@/models/Product', () => ({ default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() } }))
vi.mock('@/lib/quoting/serverGeometry', () => ({
    recomputeMetricsFromModel: vi.fn(),
    supportsServerRecompute: vi.fn(() => true),
}))
vi.mock('@/lib/s3', () => ({ s3: { send: vi.fn() } }))
vi.mock('@aws-sdk/client-s3', () => ({ GetObjectCommand: class {} }))
vi.mock('@/lib/notifications/customPrint', () => ({ notifyCustomPrintEvent: vi.fn() }))
vi.mock('@/lib/posthog-server', () => ({ getPostHogClient: () => ({ capture: vi.fn() }) }))

import { POST } from '@/app/api/quote/route'
import AppSettings from '@/models/AppSettings'
import CustomPrintRequest from '@/models/CustomPrintRequest'
import Product from '@/models/Product'
import { recomputeMetricsFromModel, supportsServerRecompute } from '@/lib/quoting/serverGeometry'
import { s3 } from '@/lib/s3'
import { notifyCustomPrintEvent } from '@/lib/notifications/customPrint'

const REQUEST_ID = '3f7c1e2a-5b4d-4c8e-9a1b-2d3e4f5a6b7c'
const SETTINGS = { materialType: 'PLA', infillPercent: 20, wallLoops: 2, layerHeightMm: 0.2 }

const baseBody = {
    volumeCm3: 64,
    dimensionsCm: { length: 1.6, width: 1.6, height: 25 },
    settings: SETTINGS,
}

const requestDoc = () => ({
    requestId: REQUEST_ID,
    userId: 'user_1',
    status: 'configured',
    quoteMode: 'instant',
    updatedAt: new Date('2026-09-22T10:00:00Z'),
    printConfiguration: { isConfigured: true, configuredAt: new Date('2026-09-22T09:00:00Z'), printSettings: { materialType: 'plastic', sparseInfillDensity: 20, wallLoops: 2, layerHeight: 0.2 } },
    statusHistory: [],
    modelFile: { s3Key: 'models/tower.stl', originalName: 'tower.stl' },
    save: vi.fn().mockResolvedValue({}),
})

beforeEach(() => {
    vi.clearAllMocks()
    supportsServerRecompute.mockReturnValue(true)
    auth.mockResolvedValue({ userId: 'user_1' })
    CustomPrintRequest.findOneAndUpdate.mockImplementation(async (_filter, update) => ({ ...update.$set, toObject: () => ({ ...update.$set, userId: 'user_1', requestId: REQUEST_ID }) }))
    Product.findOne.mockReturnValue({ lean: () => Promise.resolve(null) })
    s3.send.mockResolvedValue({
        ContentLength: 1024,
        Body: { async *[Symbol.asyncIterator]() { yield new Uint8Array([1, 2, 3]) } },
    })
})

describe('POST /api/quote — stored quote authority and payment locks', () => {
    const post = (changes = {}) => POST(new Request('https://x/api/quote', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...baseBody, requestId: REQUEST_ID, ...changes }),
    }))
    beforeEach(() => {
        AppSettings.findById.mockReturnValue({ lean: async () => ({ quotingConfig: {}, additionalDeliveryTypes: [] }) })
        CustomPrintRequest.findOne.mockResolvedValue(requestDoc())
        recomputeMetricsFromModel.mockResolvedValue({ volumeCm3: 64,
            dimensionsCm: { length: 1.6, width: 1.6, height: 25 }, confidence: 'high' })
    })

    it.each(['payment_pending', 'paid', 'printing', 'printed', 'shipped', 'delivered', 'cancelled'])('locks a %s request before reading the model', async status => {
        CustomPrintRequest.findOne.mockResolvedValue({ ...requestDoc(), status })
        expect((await post()).status).toBe(409)
        expect(s3.send).not.toHaveBeenCalled()
        expect(CustomPrintRequest.findOneAndUpdate).not.toHaveBeenCalled()
    })

    it.each([
        { source: 'product' }, { creatorUserId: 'creator_2' }, { paidAt: new Date() },
        { stripePaymentIntentId: 'pi_paid' }, { stripeSessionId: 'cs_pending' },
        { quoteMode: 'manual' }, { printConfiguration: { isConfigured: false } },
    ])('rejects a locked or unconfigured request %j', async properties => {
        CustomPrintRequest.findOne.mockResolvedValue({ ...requestDoc(), ...properties })
        expect((await post()).status).toBe(409)
        expect(CustomPrintRequest.findOneAndUpdate).not.toHaveBeenCalled()
        expect(s3.send).not.toHaveBeenCalled()
    })

    it('uses saved settings when a caller supplies a cheaper configuration', async () => {
        const doc = requestDoc()
        doc.printConfiguration.printSettings.sparseInfillDensity = 60
        CustomPrintRequest.findOne.mockResolvedValue(doc)
        const response = await post({ settings: { ...SETTINGS, infillPercent: 1 } })
        expect(response.status).toBe(200)
        expect(recomputeMetricsFromModel).toHaveBeenCalledWith(expect.any(Uint8Array), 'tower.stl',
            expect.objectContaining({ infillPercent: 60 }), undefined)
        const write = CustomPrintRequest.findOneAndUpdate.mock.calls[0][1]
        const browserEstimate = await (await post({ requestId: undefined, settings: { ...SETTINGS, infillPercent: 1 } })).json()
        expect(write.$set.quote.inputs.weightGrams).toBeGreaterThan(browserEstimate.quote.inputs.weightGrams)
    })

    it('requires manual review for an unsupported stored model instead of saving client geometry', async () => {
        supportsServerRecompute.mockReturnValue(false)
        const response = await post()
        expect(response.status).toBe(422)
        expect((await response.json()).manualReviewRequired).toBe(true)
        expect(s3.send).not.toHaveBeenCalled()
        expect(CustomPrintRequest.findOneAndUpdate).not.toHaveBeenCalled()
    })

    it.each([null, { volumeCm3: 0 }, { volumeCm3: Infinity }, { volumeCm3: 64, dimensionsCm: { length: 1, width: 0, height: 1 } }])('never persists an unverifiable model %j', async metrics => {
        recomputeMetricsFromModel.mockResolvedValue(metrics)
        const response = await post()
        expect(response.status).toBe(422)
        const body = await response.json()
        expect(body.manualReviewRequired).toBe(true)
        expect(body.quote).toBeUndefined()
        expect(CustomPrintRequest.findOneAndUpdate).not.toHaveBeenCalled()
    })

    it('stops verification when the object exceeds the bounded read limit', async () => {
        const destroy = vi.fn()
        s3.send.mockResolvedValue({ ContentLength: 76 * 1024 * 1024, Body: { destroy } })
        expect((await post()).status).toBe(422)
        expect(destroy).toHaveBeenCalledOnce()
        expect(recomputeMetricsFromModel).not.toHaveBeenCalled()
        expect(CustomPrintRequest.findOneAndUpdate).not.toHaveBeenCalled()
    })

    it('enforces the read limit against actual bytes when object metadata understates them', async () => {
        const destroy = vi.fn()
        const block = new Uint8Array(40 * 1024 * 1024)
        s3.send.mockResolvedValue({ ContentLength: 1024, Body: {
            destroy, async *[Symbol.asyncIterator]() { yield block; yield block },
        } })
        expect((await post()).status).toBe(422)
        expect(destroy).toHaveBeenCalledOnce()
        expect(recomputeMetricsFromModel).not.toHaveBeenCalled()
        expect(CustomPrintRequest.findOneAndUpdate).not.toHaveBeenCalled()
    })

    it('rejects malformed 3MF archives before the geometry parser runs', async () => {
        const doc = requestDoc()
        doc.modelFile = { originalName: 'corrupt.3mf', s3Key: 'models/corrupt.3mf' }
        CustomPrintRequest.findOne.mockResolvedValue(doc)
        expect((await post()).status).toBe(422)
        expect(recomputeMetricsFromModel).not.toHaveBeenCalled()
    })

    it('does not overwrite a request that entered payment during verification', async () => {
        CustomPrintRequest.findOneAndUpdate.mockResolvedValueOnce(null)
        const response = await post()
        expect(response.status).toBe(409)
        const filter = CustomPrintRequest.findOneAndUpdate.mock.calls[0][0]
        expect(filter).toEqual(expect.objectContaining({ userId: 'user_1', status: 'configured',
            stripeSessionId: null, stripePaymentIntentId: null, paidAt: null,
            updatedAt: new Date('2026-09-22T10:00:00Z'),
            'modelFile.s3Key': 'models/tower.stl', 'printConfiguration.configuredAt': new Date('2026-09-22T09:00:00Z'),
        }))
        expect(notifyCustomPrintEvent).not.toHaveBeenCalled()
    })

    it('preserves selected options independently of their current price', async () => {
        AppSettings.findById.mockReturnValue({ lean: async () => ({ quotingConfig: {
            postProcessingFee: 0, specialRequestFee: 0, priorityFee: 0, expediteFee: 0,
        } }) })
        const response = await post({ options: { postProcessing: true, priority: true } })
        expect(response.status).toBe(200)
        const quote = CustomPrintRequest.findOneAndUpdate.mock.calls[0][1].$set.quote
        expect(quote.inputs.options).toEqual({ postProcessing: true, priority: true, specialRequest: false, expedite: false })
    })
})

describe('POST /api/quote — body size enforced against real bytes', () => {
    beforeEach(() => {
        AppSettings.findById.mockReturnValue({
            lean: () => Promise.resolve({ quotingConfig: {}, additionalDeliveryTypes: [] }),
        })
    })

    it('rejects a body whose real size exceeds the cap even when Content-Length understates it', async () => {
        const hugeSettings = { ...SETTINGS, note: 'x'.repeat(60_000) }
        const payload = JSON.stringify({ ...baseBody, settings: hugeSettings })

        const req = new Request('https://x/api/quote', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'content-length': '10' },
            body: payload,
        })

        const res = await POST(req)
        expect(res.status).toBe(413)
    })

    it('still accepts a normal, small request', async () => {
        const req = new Request('https://x/api/quote', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(baseBody),
        })
        const res = await POST(req)
        expect(res.status).toBe(200)
    })
})

describe('POST /api/quote — machine limits re-checked against server-recomputed dimensions', () => {
    const post = (body) =>
        POST(
            new Request('https://x/api/quote', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
            }),
        )

    beforeEach(() => {
        AppSettings.findById.mockReturnValue({
            lean: () =>
                Promise.resolve({
                    quotingConfig: {},
                    additionalDeliveryTypes: [],
                    machineLimits: { maxLengthCm: 20, maxWidthCm: 20, maxHeightCm: 20, maxWeightKg: null },
                }),
        })
    })

    it('rejects when server-recomputed dimensions exceed machine limits, even though client dimensions fit', async () => {
        CustomPrintRequest.findOne.mockResolvedValue(requestDoc())
        // Client claims a squashed, within-limits bounding box...
        recomputeMetricsFromModel.mockResolvedValue({
            // ...but the server recompute reveals the real model is too long.
            volumeCm3: 64,
            dimensionsCm: { length: 5, width: 5, height: 45 },
            confidence: 'high',
        })

        const res = await post({
            ...baseBody,
            dimensionsCm: { length: 5, width: 5, height: 19 },
            requestId: REQUEST_ID,
        })

        expect(res.status).toBe(422)
    })

    it('persists normally when server-recomputed dimensions also fit', async () => {
        CustomPrintRequest.findOne.mockResolvedValue(requestDoc())
        recomputeMetricsFromModel.mockResolvedValue({
            volumeCm3: 64,
            dimensionsCm: { length: 5, width: 5, height: 19 },
            confidence: 'high',
        })

        const res = await post({
            ...baseBody,
            dimensionsCm: { length: 5, width: 5, height: 19 },
            requestId: REQUEST_ID,
        })

        expect(res.status).toBe(200)
    })
})
