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
    statusHistory: [],
    modelFile: { s3Key: 'models/tower.stl', originalName: 'tower.stl' },
    save: vi.fn().mockResolvedValue({}),
})

beforeEach(() => {
    vi.clearAllMocks()
    auth.mockResolvedValue({ userId: 'user_1' })
    Product.findOne.mockReturnValue({ lean: () => Promise.resolve(null) })
    s3.send.mockResolvedValue({
        ContentLength: 1024,
        Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
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
