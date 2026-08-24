// POST /api/quote `preview` mode. The point of it: now that print time is
// priced from the STORED model's shape, the editor panel must be able to ask
// for the very number the cart will charge — without saving anything. So the
// contract under test is "same total as a persist, zero writes".
// Convention: mock Clerk/Mongoose/S3/geometry at the edges.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }))

vi.mock('@clerk/nextjs/server', () => ({ auth }))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/lib/rateLimit', () => ({
    limitQuoteRequest: vi.fn(async () => ({ allowed: true, headers: {} })),
}))
vi.mock('@/models/AppSettings', () => ({ default: { findById: vi.fn() } }))
vi.mock('@/models/CustomPrintRequest', () => ({ default: { findOne: vi.fn() } }))
vi.mock('@/models/Product', () => ({ default: { findOne: vi.fn() } }))
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
import { recomputeMetricsFromModel } from '@/lib/quoting/serverGeometry'
import { s3 } from '@/lib/s3'
import { notifyCustomPrintEvent } from '@/lib/notifications/customPrint'

const REQUEST_ID = '3f7c1e2a-5b4d-4c8e-9a1b-2d3e4f5a6b7c'
const SETTINGS = { materialType: 'PLA', infillPercent: 20, wallLoops: 2, layerHeightMm: 0.2 }

// The admin has calibrated, so print time prices from the stored model's shape.
const CALIBRATED_CONFIG = {
    quotingConfig: { layerStackModel: { flowMm3PerS: 7.5, perLayerOverheadS: 4 } },
    additionalDeliveryTypes: [],
}

const post = (body) =>
    POST(
        new Request('https://x/api/quote', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        }),
    )

const baseBody = {
    volumeCm3: 64,
    dimensionsCm: { length: 1.6, width: 1.6, height: 25 },
    settings: SETTINGS,
}

const requestDoc = () => ({
    requestId: REQUEST_ID,
    userId: 'user_1',
    status: 'configured',
    statusHistory: [],
    modelFile: { s3Key: 'models/tower.stl', originalName: 'tower.stl' },
    save: vi.fn().mockResolvedValue({}),
})

beforeEach(() => {
    vi.clearAllMocks()
    auth.mockResolvedValue({ userId: 'user_1' })
    AppSettings.findById.mockReturnValue({ lean: () => Promise.resolve(CALIBRATED_CONFIG) })
    Product.findOne.mockReturnValue({ lean: () => Promise.resolve(null) })
    s3.send.mockResolvedValue({
        ContentLength: 1024,
        Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
    })
    // The tower's shape-aware time, as the server would recompute it.
    recomputeMetricsFromModel.mockResolvedValue({
        volumeCm3: 64,
        dimensionsCm: { length: 1.6, width: 1.6, height: 25 },
        confidence: 'high',
        printHoursShapeAware: 2.2,
    })
})

describe('POST /api/quote — preview mode', () => {
    it('returns the stored-model quote and writes nothing', async () => {
        const doc = requestDoc()
        CustomPrintRequest.findOne.mockResolvedValue(doc)

        const res = await post({ ...baseBody, requestId: REQUEST_ID, preview: true })
        const data = await res.json()

        expect(res.status).toBe(200)
        expect(data.preview).toBe(true)
        expect(data.quote.inputs.printTimeSource).toBe('shape-aware')
        expect(data.quote.inputs.printHours).toBe(2.2)
        // Nothing persisted: no save, no status change, no notification.
        expect(doc.save).not.toHaveBeenCalled()
        expect(doc.status).toBe('configured')
        expect(doc.statusHistory).toEqual([])
        expect(doc.quotedAt).toBeUndefined()
        expect(notifyCustomPrintEvent).not.toHaveBeenCalled()
    })

    it('quotes the same total a persist would charge — that is the whole point', async () => {
        CustomPrintRequest.findOne.mockResolvedValue(requestDoc())
        const preview = await (await post({ ...baseBody, requestId: REQUEST_ID, preview: true })).json()

        CustomPrintRequest.findOne.mockResolvedValue(requestDoc())
        const persisted = await (await post({ ...baseBody, requestId: REQUEST_ID })).json()

        expect(preview.quote.total).toBe(persisted.quote.total)
        expect(preview.quote.inputs.printHours).toBe(persisted.quote.inputs.printHours)
    })

    it('is more expensive than the heuristic preview it replaces (no silent surprise at the cart)', async () => {
        CustomPrintRequest.findOne.mockResolvedValue(requestDoc())
        const authoritative = await (
            await post({ ...baseBody, requestId: REQUEST_ID, preview: true })
        ).json()
        // Same request without a requestId: no stored model, so heuristic.
        const estimate = await (await post(baseBody)).json()

        expect(estimate.quote.inputs.printTimeSource).toBe('heuristic')
        expect(authoritative.quote.total).not.toBe(estimate.quote.total)
    })

    it('still persists normally when preview is not set', async () => {
        const doc = requestDoc()
        CustomPrintRequest.findOne.mockResolvedValue(doc)

        await post({ ...baseBody, requestId: REQUEST_ID })

        expect(doc.save).toHaveBeenCalled()
        expect(doc.status).toBe('quoted')
        expect(doc.quoteMode).toBe('instant')
    })

    it('requires sign-in and ownership, exactly like a persist', async () => {
        auth.mockResolvedValue({ userId: null })
        const anon = await post({ ...baseBody, requestId: REQUEST_ID, preview: true })
        expect(anon.status).toBe(401)

        auth.mockResolvedValue({ userId: 'someone_else' })
        CustomPrintRequest.findOne.mockResolvedValue(requestDoc())
        const foreign = await post({ ...baseBody, requestId: REQUEST_ID, preview: true })
        expect(foreign.status).toBe(403)
        // No S3 read for a request that is not yours.
        expect(s3.send).not.toHaveBeenCalled()
    })

    it('404s an unknown request', async () => {
        CustomPrintRequest.findOne.mockResolvedValue(null)

        const res = await post({ ...baseBody, requestId: REQUEST_ID, preview: true })

        expect(res.status).toBe(404)
    })

    it('falls back to the heuristic when the stored model cannot be recomputed', async () => {
        CustomPrintRequest.findOne.mockResolvedValue(requestDoc())
        recomputeMetricsFromModel.mockResolvedValue(null)

        const data = await (await post({ ...baseBody, requestId: REQUEST_ID, preview: true })).json()

        expect(data.quote.inputs.printTimeSource).toBe('heuristic')
        expect(data.quote.total).toBeGreaterThan(0)
    })

    it('rejects a client that understates the volume (deviation policy still applies)', async () => {
        CustomPrintRequest.findOne.mockResolvedValue(requestDoc())

        const res = await post({ ...baseBody, volumeCm3: 1, requestId: REQUEST_ID, preview: true })

        expect(res.status).toBe(400)
    })
})
