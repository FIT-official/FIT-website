/**
 * Validation + shaping for a creator's print service (models/CreatorPrintService).
 * Pure: zod schema in, `{ ok, value | error, issues }` out. Shared by the
 * owner route (PUT /api/user/print-service) and unit tests; the public route
 * uses `publicPrintService` so only advertised fields ever leave the server.
 */
import { z } from 'zod'
import { sanitizeString } from '@/utils/validate'

export const ACCEPTED_FORMATS = ['stl', '3mf', 'obj', 'step']
export const MAX_MATERIALS = 12
export const MAX_COLOURS = 20

const text = (max) => z.string().max(max).transform((v) => sanitizeString(v).trim())

const materialSchema = z
    .object({
        name: text(40).refine((v) => v.length > 0, { message: 'Material name is required' }),
        colours: z.array(text(30)).max(MAX_COLOURS).default([]),
        pricePerGram: z.number().finite().nonnegative().max(1000),
        note: text(120).default(''),
    })
    .strict()

const buildSchema = z.number().finite().min(10).max(1000)

export const printServiceSchema = z
    .object({
        enabled: z.boolean().default(false),
        headline: text(80).default(''),
        description: text(1500).default(''),
        materials: z.array(materialSchema).max(MAX_MATERIALS).default([]),
        minimumCharge: z.number().finite().nonnegative().max(100000).default(0),
        leadTimeDays: z.number().int().min(1).max(60).default(7),
        maxBuildMm: z
            .object({ x: buildSchema, y: buildSchema, z: buildSchema })
            .strict()
            .default({ x: 250, y: 250, z: 250 }),
        acceptedFormats: z
            .array(z.enum(ACCEPTED_FORMATS))
            .max(ACCEPTED_FORMATS.length)
            .default(['stl', '3mf'])
            .transform((arr) => Array.from(new Set(arr))),
        turnaroundNote: text(200).default(''),
    })
    .strict()

/** Empty/default service as the owner UI expects it. */
export const emptyPrintService = () => ({
    enabled: false,
    headline: '',
    description: '',
    materials: [],
    minimumCharge: 0,
    leadTimeDays: 7,
    maxBuildMm: { x: 250, y: 250, z: 250 },
    acceptedFormats: ['stl', '3mf'],
    turnaroundNote: '',
})

/**
 * @returns {{ ok: true, value: object } | { ok: false, error: string, issues: any[] }}
 */
export function validatePrintService(input) {
    const parsed = printServiceSchema.safeParse(input)
    if (!parsed.success) {
        return { ok: false, error: 'Invalid input', issues: parsed.error.issues }
    }
    const value = parsed.data
    // Colours are deduped after sanitising; empty strings are dropped.
    value.materials = value.materials.map((m) => ({
        ...m,
        colours: Array.from(new Set(m.colours.filter(Boolean))),
    }))
    if (value.enabled && value.materials.length === 0) {
        return {
            ok: false,
            error: 'Add at least one material before enabling the service',
            issues: [{ path: ['materials'], message: 'At least one material is required' }],
        }
    }
    return { ok: true, value }
}

/** Owner-facing shape (defaults filled, Mongo internals dropped). */
export function ownerPrintService(doc) {
    const base = emptyPrintService()
    if (!doc) return base
    return {
        ...base,
        enabled: Boolean(doc.enabled),
        headline: doc.headline || '',
        description: doc.description || '',
        materials: Array.isArray(doc.materials)
            ? doc.materials.map((m) => ({
                name: m?.name || '',
                colours: Array.isArray(m?.colours) ? m.colours.map(String) : [],
                pricePerGram: Number(m?.pricePerGram) || 0,
                note: m?.note || '',
            }))
            : [],
        minimumCharge: Number(doc.minimumCharge) || 0,
        leadTimeDays: Number(doc.leadTimeDays) || base.leadTimeDays,
        maxBuildMm: {
            x: Number(doc.maxBuildMm?.x) || base.maxBuildMm.x,
            y: Number(doc.maxBuildMm?.y) || base.maxBuildMm.y,
            z: Number(doc.maxBuildMm?.z) || base.maxBuildMm.z,
        },
        acceptedFormats: Array.isArray(doc.acceptedFormats) && doc.acceptedFormats.length
            ? doc.acceptedFormats.filter((f) => ACCEPTED_FORMATS.includes(f))
            : base.acceptedFormats,
        turnaroundNote: doc.turnaroundNote || '',
        updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    }
}

/**
 * Public allowlist for /api/creators/[id]/print-service: never spread the raw
 * document. Returns null when the service is missing or disabled.
 */
export function publicPrintService(doc) {
    if (!doc || !doc.enabled) return null
    const owner = ownerPrintService(doc)
    return {
        headline: owner.headline,
        description: owner.description,
        materials: owner.materials,
        minimumCharge: owner.minimumCharge,
        leadTimeDays: owner.leadTimeDays,
        maxBuildMm: owner.maxBuildMm,
        acceptedFormats: owner.acceptedFormats,
        turnaroundNote: owner.turnaroundNote,
    }
}
