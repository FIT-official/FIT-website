// Pure creator-print-service logic: service validation/shaping
// (lib/creatorPrintService/validate.js), the indicative price estimate, and
// the action -> status transitions over the EXISTING CustomPrintRequest
// vocabulary (no invented statuses).
import { describe, it, expect } from 'vitest'
import {
    validatePrintService,
    ownerPrintService,
    publicPrintService,
    emptyPrintService,
} from '@/lib/creatorPrintService/validate'
import { estimateCreatorPrintPrice } from '@/lib/creatorPrintService/estimate'
import {
    resolveCreatorJobTransition,
    availableCreatorActions,
    CREATOR_JOB_ACTIONS,
} from '@/lib/creatorPrintService/jobTransitions'

const KNOWN_STATUSES = [
    'pending_upload', 'pending_config', 'configured', 'quoted', 'payment_pending',
    'paid', 'printing', 'printed', 'shipped', 'delivered', 'cancelled',
]

const validService = () => ({
    enabled: true,
    headline: 'Fast PLA prints',
    description: 'Up to 250mm.',
    materials: [{ name: 'PLA', colours: ['Black', 'White', 'Black'], pricePerGram: 0.12, note: '' }],
    minimumCharge: 8,
    leadTimeDays: 5,
    maxBuildMm: { x: 250, y: 250, z: 250 },
    acceptedFormats: ['stl', '3mf', 'stl'],
    turnaroundNote: 'Collect at Jurong',
})

describe('validatePrintService', () => {
    it('accepts a full service, dedupes colours and formats, and sanitises text', () => {
        const input = validService()
        input.headline = 'Fast <b>PLA</b> $prints'
        const res = validatePrintService(input)
        expect(res.ok).toBe(true)
        expect(res.value.headline).toBe('Fast bPLA/b prints')
        expect(res.value.materials[0].colours).toEqual(['Black', 'White'])
        expect(res.value.acceptedFormats).toEqual(['stl', '3mf'])
    })

    it('fills defaults for an empty body (service stays disabled)', () => {
        const res = validatePrintService({})
        expect(res.ok).toBe(true)
        expect(res.value).toMatchObject({
            enabled: false,
            materials: [],
            leadTimeDays: 7,
            maxBuildMm: { x: 250, y: 250, z: 250 },
            acceptedFormats: ['stl', '3mf'],
        })
    })

    it('rejects enabling without any material', () => {
        const res = validatePrintService({ ...validService(), materials: [] })
        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/at least one material/i)
    })

    it('rejects out-of-range numbers, unknown formats, too many materials and unknown keys', () => {
        expect(validatePrintService({ ...validService(), leadTimeDays: 0 }).ok).toBe(false)
        expect(validatePrintService({ ...validService(), leadTimeDays: 61 }).ok).toBe(false)
        expect(validatePrintService({ ...validService(), maxBuildMm: { x: 5, y: 250, z: 250 } }).ok).toBe(false)
        expect(validatePrintService({ ...validService(), maxBuildMm: { x: 250, y: 250, z: 1001 } }).ok).toBe(false)
        expect(validatePrintService({ ...validService(), acceptedFormats: ['stl', 'exe'] }).ok).toBe(false)
        expect(validatePrintService({ ...validService(), minimumCharge: -1 }).ok).toBe(false)
        expect(validatePrintService({ ...validService(), isAdmin: true }).ok).toBe(false)
        const many = Array.from({ length: 13 }, (_, i) => ({ name: `M${i}`, colours: [], pricePerGram: 0.1 }))
        expect(validatePrintService({ ...validService(), materials: many }).ok).toBe(false)
        const material = { name: 'PLA', colours: Array.from({ length: 21 }, (_, i) => `C${i}`), pricePerGram: 0.1 }
        expect(validatePrintService({ ...validService(), materials: [material] }).ok).toBe(false)
        expect(validatePrintService({ ...validService(), materials: [{ name: '', colours: [], pricePerGram: 0.1 }] }).ok).toBe(false)
        expect(validatePrintService({ ...validService(), materials: [{ name: 'PLA', colours: [], pricePerGram: -0.1 }] }).ok).toBe(false)
    })

    it('rejects oversize strings', () => {
        expect(validatePrintService({ ...validService(), headline: 'x'.repeat(81) }).ok).toBe(false)
        expect(validatePrintService({ ...validService(), description: 'x'.repeat(1501) }).ok).toBe(false)
        expect(validatePrintService({ ...validService(), turnaroundNote: 'x'.repeat(201) }).ok).toBe(false)
    })
})

describe('ownerPrintService / publicPrintService', () => {
    it('owner shape falls back to defaults for a missing document', () => {
        expect(ownerPrintService(null)).toMatchObject(emptyPrintService())
    })

    it('public shape is null when disabled and an allowlist when enabled', () => {
        const doc = { creatorUserId: 'user_1', enabled: false, materials: [{ name: 'PLA', pricePerGram: 0.1 }] }
        expect(publicPrintService(doc)).toBeNull()
        const pub = publicPrintService({ ...doc, enabled: true, _id: 'x', __v: 0 })
        expect(pub).not.toHaveProperty('creatorUserId')
        expect(pub).not.toHaveProperty('_id')
        expect(pub).not.toHaveProperty('enabled')
        expect(pub.materials).toEqual([{ name: 'PLA', colours: [], pricePerGram: 0.1, note: '' }])
    })
})

describe('estimateCreatorPrintPrice', () => {
    it('is grams x rate, floored at the minimum charge, rounded to cents', () => {
        expect(estimateCreatorPrintPrice({ grams: 100, pricePerGram: 0.123, minimumCharge: 5 })).toEqual({
            ok: true, amount: 12.3, fromMinimum: false,
        })
        expect(estimateCreatorPrintPrice({ grams: 10, pricePerGram: 0.1, minimumCharge: 8 })).toEqual({
            ok: true, amount: 8, fromMinimum: true,
        })
    })

    it('reports why it cannot estimate', () => {
        expect(estimateCreatorPrintPrice({ grams: null, pricePerGram: 0.1 })).toEqual({ ok: false, reason: 'no-grams' })
        expect(estimateCreatorPrintPrice({ grams: 10, pricePerGram: undefined })).toEqual({ ok: false, reason: 'no-rate' })
    })
})

describe('creator job transitions', () => {
    it('only ever targets existing CustomPrintRequest statuses', () => {
        for (const rule of Object.values(CREATOR_JOB_ACTIONS)) {
            expect(KNOWN_STATUSES).toContain(rule.to)
            rule.from.forEach((s) => expect(KNOWN_STATUSES).toContain(s))
        }
    })

    it('walks the happy path quote -> accept -> printing -> ready -> completed', () => {
        expect(resolveCreatorJobTransition('quote', 'configured')).toEqual({ ok: true, status: 'quoted' })
        expect(resolveCreatorJobTransition('quote', 'quoted')).toEqual({ ok: true, status: 'quoted' })
        expect(resolveCreatorJobTransition('accept', 'quoted')).toEqual({ ok: true, status: 'paid' })
        expect(resolveCreatorJobTransition('printing', 'paid')).toEqual({ ok: true, status: 'printing' })
        expect(resolveCreatorJobTransition('ready', 'printing')).toEqual({ ok: true, status: 'printed' })
        expect(resolveCreatorJobTransition('completed', 'printed')).toEqual({ ok: true, status: 'delivered' })
    })

    it('rejects out-of-order actions, unknown actions, and acting on terminal jobs', () => {
        expect(resolveCreatorJobTransition('printing', 'configured').ok).toBe(false)
        expect(resolveCreatorJobTransition('accept', 'configured').ok).toBe(false)
        expect(resolveCreatorJobTransition('explode', 'configured').ok).toBe(false)
        expect(resolveCreatorJobTransition('reject', 'delivered').ok).toBe(false)
        expect(resolveCreatorJobTransition('reject', 'cancelled').ok).toBe(false)
        expect(resolveCreatorJobTransition('quote', 'cancelled').ok).toBe(false)
    })

    it('lists the actions the UI may offer per status', () => {
        expect(availableCreatorActions('configured')).toEqual(['quote', 'reject'])
        expect(availableCreatorActions('quoted')).toEqual(['quote', 'accept', 'reject'])
        expect(availableCreatorActions('delivered')).toEqual([])
    })
})
