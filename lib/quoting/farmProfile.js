/**
 * Per-print-farm pricing. Fix It Today's quoting settings (AppSettings
 * quotingConfig, machineLimits and the custom-print delivery options) are the
 * RECOMMENDED profile. A creator's print farm (models/CreatorPrintService
 * `pricing`) stores only what it overrides, which filaments/colours it offers
 * and its own delivery list; everything else follows the recommendation,
 * including later changes to it.
 *
 * Pure (no I/O): the server resolves the profile it prices with from the saved
 * service, and the dashboard resolves the same profile from the draft it is
 * editing to show a live sample. Clients never send rates to price with.
 */
import { z } from 'zod'
import { DEFAULT_PRICING, DEFAULT_TIME_MODEL, resolvePricing, resolveTimeModel } from './pricingDefaults'
import { MachineLimitsSchema, QuotingConfigSchema, TimeModelSchema } from './adminConfigSchema'
import { calculateInstantQuote, computeExpedite } from './quote'
import { printSettingsToQuoteSettings } from './printSettingsToQuote'
import { DEFAULT_EDITOR_PRINT_SETTINGS } from './genericPresets'
import { FILAMENTS, FILAMENT_COLOURS } from '@/lib/filamentCatalogue'

export const FARM_RATE_KEYS = Object.freeze(Object.keys(DEFAULT_PRICING).filter((key) => key !== 'currency'))
export const FARM_TIME_KEYS = Object.freeze(Object.keys(DEFAULT_TIME_MODEL))
export const FARM_LIMIT_KEYS = Object.freeze(['maxLengthCm', 'maxWidthCm', 'maxHeightCm', 'maxWeightKg'])
export const EXPEDITE_KEYS = Object.freeze(['expediteMode', 'expediteSurchargePercent', 'expediteSurchargeFlat'])
export const MULTIPLIER_BOUNDS = Object.freeze({ min: 0.2, max: 10 })
export const MAX_FARM_DELIVERY = 6
const FILAMENT_KEYS = FILAMENTS.map((item) => item.value)

const round = (value, dp = 2) => Math.round((Number(value) || 0) * 10 ** dp) / 10 ** dp
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
// Mirrors utils/validate sanitizeString; kept local so this module stays pure.
const clean = (value) => String(value).replace(/[<>$]/g, '').trim()
const text = (max) => z.string().max(max).transform(clean)

// ---- validation ------------------------------------------------------------
// Farm overrides obey the same bounds as the admin's own values: each rate
// reuses the QuotingConfigSchema field, made nullable (null = follow).
const rateShape = Object.fromEntries(
    FARM_RATE_KEYS.map((key) => [key, QuotingConfigSchema.shape[key].unwrap().nullable().optional()]),
)

export const FarmOverridesSchema = z
    .object({
        ...rateShape,
        timeModel: TimeModelSchema.nullable().optional(),
        machineLimits: MachineLimitsSchema.nullable().optional(),
    })
    .strict()

const FarmMaterialSchema = z
    .object({
        filament: z.enum(FILAMENT_KEYS),
        enabled: z.boolean().default(true),
        priceMultiplier: z.number().finite().min(MULTIPLIER_BOUNDS.min).max(MULTIPLIER_BOUNDS.max).nullable().default(null),
        coloursOff: z.array(z.string().max(80)).max(100).default([]),
    })
    .strict()

const FarmDeliverySchema = z
    .object({
        type: z.string().regex(/^[a-z0-9_-]{1,40}$/i, 'Delivery key: letters, numbers, - or _'),
        label: text(60).refine((value) => value.length > 0, { message: 'Delivery name is required' }),
        price: z.number().finite().min(0).max(10_000),
        description: text(200).default(''),
        needsAddress: z.boolean().default(false),
    })
    .strict()

export const FarmPricingSchema = z
    .object({
        overrides: FarmOverridesSchema.default({}),
        materials: z.array(FarmMaterialSchema).max(FILAMENTS.length).default([]),
        delivery: z.array(FarmDeliverySchema).max(MAX_FARM_DELIVERY).default([]),
        // Server-owned (bumped on every save). Accepted so a round-tripped
        // profile validates, then ignored.
        version: z.number().optional(),
    })
    .strict()
    .superRefine((value, ctx) => {
        const seen = new Set()
        value.materials.forEach((item, index) => {
            if (seen.has(item.filament)) ctx.addIssue({ code: 'custom', path: ['materials', index, 'filament'], message: 'Each material once' })
            seen.add(item.filament)
        })
        const types = new Set()
        value.delivery.forEach((item, index) => {
            const key = item.type.toLowerCase()
            if (types.has(key)) ctx.addIssue({ code: 'custom', path: ['delivery', index, 'type'], message: 'Each delivery option once' })
            types.add(key)
        })
    })

function compact(source, keys) {
    const out = {}
    for (const key of keys) {
        const value = source?.[key]
        if (value !== undefined && value !== null && value !== '') out[key] = value
    }
    return out
}

/** Keep only the fields a farm actually overrides (null/absent = follow). */
export function compactOverrides(overrides = {}) {
    const out = compact(overrides, FARM_RATE_KEYS)
    const timeModel = compact(overrides?.timeModel, FARM_TIME_KEYS)
    if (Object.keys(timeModel).length) out.timeModel = timeModel
    const machineLimits = compact(overrides?.machineLimits, FARM_LIMIT_KEYS)
    if (Object.keys(machineLimits).length) out.machineLimits = machineLimits
    return out
}

function normalizeMaterials(materials = []) {
    const seen = new Set()
    const out = []
    for (const item of Array.isArray(materials) ? materials : []) {
        if (!FILAMENT_KEYS.includes(item?.filament) || seen.has(item.filament)) continue
        seen.add(item.filament)
        const names = FILAMENT_COLOURS.filter((colour) => colour.filament === item.filament).map((colour) => colour.name)
        const off = new Set((Array.isArray(item.coloursOff) ? item.coloursOff : []).map(String))
        const multiplier = Number(item.priceMultiplier)
        out.push({
            filament: item.filament,
            enabled: item.enabled !== false,
            priceMultiplier: item.priceMultiplier == null || !Number.isFinite(multiplier) ? null
                : clamp(multiplier, MULTIPLIER_BOUNDS.min, MULTIPLIER_BOUNDS.max),
            coloursOff: names.filter((name) => off.has(name)),
        })
    }
    return out
}

function normalizeDelivery(delivery = []) {
    return (Array.isArray(delivery) ? delivery : []).filter((item) => item?.type && item?.label).map((item) => ({
        type: String(item.type),
        label: String(item.label),
        price: round(Math.max(0, Number(item.price) || 0)),
        description: String(item.description || ''),
        needsAddress: Boolean(item.needsAddress),
    }))
}

/** The stored/owner shape of a farm profile (plain object, defaults filled). */
export function normalizeFarmPricing(pricing = {}) {
    return {
        overrides: compactOverrides(pricing?.overrides),
        materials: normalizeMaterials(pricing?.materials),
        delivery: normalizeDelivery(pricing?.delivery),
        version: Number(pricing?.version) || 0,
    }
}

/** @returns {{ok:true,value:object}|{ok:false,error:string,issues:any[]}} */
export function validateFarmPricing(input) {
    const parsed = FarmPricingSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'Invalid pricing', issues: parsed.error.issues }
    const { version: _ignored, ...value } = normalizeFarmPricing(parsed.data)
    return { ok: true, value }
}

// ---- legacy print services -------------------------------------------------
/** Best-effort match of a free-text legacy material name to a catalogue filament. */
export function filamentFromName(name) {
    const value = String(name || '').toLowerCase()
    if (value.includes('matte') && value.includes('pla')) return 'pla_matte'
    for (const key of ['petg', 'asa', 'abs', 'tpu', 'pla']) if (value.includes(key)) return key
    return null
}

/**
 * Derive a farm profile from a print service saved before per-farm pricing:
 * each material's S$/g becomes a multiplier on the recommended material rate
 * (or, when a rate is outside the multiplier bounds, on a farm material rate
 * set to the geometric mean of the lowest and highest legacy rates, so the
 * per-gram prices survive), a positive minimum charge becomes the minimum
 * price and the build volume becomes the machine limits. A 0 legacy rate
 * counts as not set. Materials that match no catalogue filament are not
 * priced here; see reviewMaterialsOf (quote on review).
 */
export function legacyFarmPricing(service = {}, recommendedRate = DEFAULT_PRICING.materialRatePerGram) {
    const matched = []
    for (const item of Array.isArray(service?.materials) ? service.materials : []) {
        const filament = filamentFromName(item?.name)
        if (!filament || matched.some((entry) => entry.filament === filament)) continue
        const rate = Number(item?.pricePerGram)
        matched.push({ filament, rate: Number.isFinite(rate) && rate > 0 ? rate : null, colours: item?.colours || [] })
    }
    const overrides = {}
    const withinBounds = (base) => base > 0 && matched.every(({ rate }) => rate == null
        || (rate / base >= MULTIPLIER_BOUNDS.min && rate / base <= MULTIPLIER_BOUNDS.max))
    let base = Number(recommendedRate) || 0
    if (!withinBounds(base)) {
        const rates = matched.map(({ rate }) => rate).filter((rate) => rate > 0)
        if (rates.length) {
            base = round(Math.sqrt(Math.min(...rates) * Math.max(...rates)), 4)
            overrides.materialRatePerGram = base
        }
    }
    const materials = matched.map(({ filament, rate, colours }) => {
        const names = FILAMENT_COLOURS.filter((colour) => colour.filament === filament).map((colour) => colour.name)
        const listed = new Set((Array.isArray(colours) ? colours : []).map((colour) => String(colour).trim().toLowerCase()))
        const known = names.filter((name) => listed.has(name.toLowerCase()))
        return {
            filament,
            enabled: true,
            priceMultiplier: rate == null || !(base > 0) ? null
                : round(clamp(rate / base, MULTIPLIER_BOUNDS.min, MULTIPLIER_BOUNDS.max), 4),
            // Free-text colours that name catalogue colours narrow the list;
            // none recognised keeps every catalogue colour on.
            coloursOff: known.length ? names.filter((name) => !listed.has(name.toLowerCase())) : [],
        }
    })
    if (Number(service?.minimumCharge) > 0) overrides.minimumPrice = Number(service.minimumCharge)
    const build = service?.maxBuildMm
    if (build && ['x', 'y', 'z'].every((axis) => Number(build[axis]) > 0)) {
        overrides.machineLimits = {
            maxLengthCm: Number(build.x) / 10, maxWidthCm: Number(build.y) / 10, maxHeightCm: Number(build.z) / 10,
        }
    }
    return { overrides, materials, delivery: [], version: 0 }
}

/**
 * Legacy materials that match no catalogue filament (Nylon, PC, resin, CF...).
 * They cannot be priced by the engine, so customers can still request them
 * and the creator prices them by hand ("quote on review").
 */
export function reviewMaterialsOf(service = {}) {
    const out = []
    for (const item of Array.isArray(service?.materials) ? service.materials : []) {
        const name = String(item?.name || '').trim()
        if (!name || filamentFromName(name) || out.some((entry) => entry.label.toLowerCase() === name.toLowerCase())) continue
        const colours = (Array.isArray(item.colours) ? item.colours : []).map((colour) => String(colour).trim()).filter(Boolean)
        out.push({
            key: `review-${out.length + 1}`,
            label: name,
            note: String(item.note || ''),
            colours: (colours.length ? colours : ['Any colour']).map((colour) => ({ name: colour, hex: null })),
        })
    }
    return out
}

/** Notes on legacy materials, keyed by the catalogue filament they match. */
function legacyNotes(service = {}) {
    const notes = {}
    for (const item of Array.isArray(service?.materials) ? service.materials : []) {
        const filament = filamentFromName(item?.name)
        if (filament && item?.note && !notes[filament]) notes[filament] = String(item.note)
    }
    return notes
}

// ---- resolution ------------------------------------------------------------
function limitsOf(source) {
    const out = {}
    for (const key of FARM_LIMIT_KEYS) {
        const value = Number(source?.[key])
        out[key] = source?.[key] != null && Number.isFinite(value) && value > 0 ? value : null
    }
    return out
}

const ALL_OFFERED = FILAMENTS.map((item) => ({ filament: item.value, enabled: true, priceMultiplier: null, coloursOff: [] }))

/**
 * @param {object} args
 * @param {object} [args.recommended] - AppSettings (lean): quotingConfig, machineLimits
 * @param {object|null} [args.service] - CreatorPrintService (lean); null = Fix It Today itself
 * @param {Array} [args.recommendedDelivery] - Fix It Today's delivery options (buildDeliveryOptions shape)
 * @returns resolved profile the engine prices with
 */
export function resolveFarmPricing({ recommended = {}, service = null, recommendedDelivery = [] } = {}) {
    const quotingConfig = recommended?.quotingConfig || {}
    const recommendedRates = resolvePricing(quotingConfig)
    const source = !service ? 'recommended' : service.pricing ? 'farm' : 'legacy'
    const pricing = source === 'farm' ? normalizeFarmPricing(service.pricing)
        : source === 'legacy' ? legacyFarmPricing(service, recommendedRates.materialRatePerGram) : null
    const overrides = compactOverrides(pricing?.overrides)

    const rates = resolvePricing({ ...recommendedRates, ...compact(overrides, FARM_RATE_KEYS) })
    const timeOverride = overrides.timeModel || null
    const timeModel = resolveTimeModel({ ...compact(quotingConfig.timeModel, FARM_TIME_KEYS), ...(timeOverride || {}) })
    const pricingConfig = { ...rates, timeModel }
    // Fix It Today's calibrated layer-stack speed describes its own printers;
    // a farm that sets its own speed is priced with that speed instead.
    if (!timeOverride && quotingConfig.layerStackModel) pricingConfig.layerStackModel = quotingConfig.layerStackModel

    const limits = { ...limitsOf(recommended?.machineLimits), ...compact(overrides.machineLimits, FARM_LIMIT_KEYS) }
    const machineLimits = Object.values(limits).some((value) => Number(value) > 0) ? limits : null

    const offered = source === 'recommended' ? ALL_OFFERED : pricing.materials.filter((item) => item.enabled)
    const notes = service ? legacyNotes(service) : {}
    const materials = FILAMENTS.map((family) => {
        const entry = offered.find((item) => item.filament === family.value)
        if (!entry) return null
        const multiplier = entry.priceMultiplier ?? 1
        const off = new Set(entry.coloursOff || [])
        return {
            filament: family.value,
            label: family.label,
            multiplier,
            ratePerGram: round(rates.materialRatePerGram * multiplier, 4),
            recommendedRatePerGram: recommendedRates.materialRatePerGram,
            note: notes[family.value] || '',
            colours: FILAMENT_COLOURS.filter((colour) => colour.filament === family.value && !off.has(colour.name)).map((colour) => ({ ...colour })),
        }
    }).filter((item) => item && item.colours.length > 0)

    const deliveryOptions = pricing?.delivery?.length
        ? pricing.delivery.map((item) => ({ type: item.type, displayName: item.label, description: item.description || '',
            price: item.price, needsAddress: Boolean(item.needsAddress) }))
        : (Array.isArray(recommendedDelivery) ? recommendedDelivery : []).map((item) => ({ ...item }))

    const offers = source === 'recommended'
        ? { postProcessing: true, specialRequest: true, priority: true, expedite: true }
        : {
            postProcessing: true,
            specialRequest: true,
            // Farm stock is unknown, so rush and priority are only offered when
            // the farm set a positive fee itself and it actually charges one.
            priority: Number(overrides.priorityFee) > 0,
            expedite: computeExpedite(100, rates) > 0
                && (Number(overrides.expediteSurchargePercent) > 0 || Number(overrides.expediteSurchargeFlat) > 0),
        }

    return {
        source,
        pricingConfig,
        rates,
        timeModel,
        machineLimits,
        materials,
        colours: materials.flatMap((item) => item.colours),
        reviewMaterials: service ? reviewMaterialsOf(service) : [],
        deliveryOptions,
        leadTimeDays: service ? Number(service.leadTimeDays) || null : null,
        version: source === 'farm' ? Number(service.pricing?.version) || 0 : 0,
        offers,
        overrides,
    }
}

/**
 * The recommended values a creator sees beside their own on
 * /dashboard/print-service ("Recommended" column), in the `recommended` shape
 * resolveFarmPricing accepts so the dashboard can resolve its draft locally.
 * Fix It Today's calibration internals (layer-stack model) stay server-side.
 */
export function recommendedPricingPayload({ appSettings = {}, recommendedDelivery = [] } = {}) {
    const quotingConfig = appSettings?.quotingConfig || {}
    const rates = resolvePricing(quotingConfig)
    return {
        quotingConfig: { ...rates, timeModel: resolveTimeModel(compact(quotingConfig.timeModel, FARM_TIME_KEYS)) },
        machineLimits: limitsOf(appSettings?.machineLimits),
        materials: FILAMENTS.map((family) => ({
            filament: family.value,
            label: family.label,
            ratePerGram: rates.materialRatePerGram,
            colours: FILAMENT_COLOURS.filter((colour) => colour.filament === family.value)
                .map(({ name, hex, code }) => ({ name, hex, code })),
        })),
        deliveryOptions: (Array.isArray(recommendedDelivery) ? recommendedDelivery : []).map((item) => ({ ...item })),
    }
}

/** Per-filament price multiplier of a resolved profile, or null when not offered. */
export function materialMultiplierFor(profile, filament) {
    return profile?.materials?.find((item) => item.filament === filament)?.multiplier ?? null
}

/** What the public print-service endpoint may show about a farm's pricing. */
export function publicFarmProfile(profile) {
    if (!profile) return null
    return {
        materials: profile.materials.map((item) => ({
            filament: item.filament, label: item.label, ratePerGram: item.ratePerGram, note: item.note || '',
            colours: item.colours.map(({ filament, name, code, hex }) => ({ filament, name, code, hex })),
        })),
        // Priced by the creator on review: no S$/g, no live estimate.
        reviewMaterials: (profile.reviewMaterials || []).map(({ key, label, note, colours }) => ({
            key, label, note: note || '', colours: colours.map(({ name }) => ({ name, hex: null })),
        })),
        minimumPrice: Number(profile.rates?.minimumPrice) || 0,
        deliveryOptions: profile.deliveryOptions.map(({ type, displayName, description, price, needsAddress }) =>
            ({ type, displayName, description: description || '', price: Number(price) || 0, needsAddress: Boolean(needsAddress) })),
        leadTimeDays: profile.leadTimeDays,
        machineLimits: profile.machineLimits,
        offers: { ...profile.offers },
    }
}

/**
 * Put a farm's flat delivery fee on an engine quote: the delivery line, the
 * subtotal and the total. Minimum price and rush apply before delivery, as
 * on the request page where delivery is added to the engine total.
 */
export function withFlatDelivery(quote, option) {
    if (!quote || !option) return quote
    const price = round(Math.max(0, Number(option.price) || 0))
    return {
        ...quote,
        lines: (quote.lines || []).map((line) => line.key === 'delivery' ? { ...line, amount: price } : line),
        subtotal: round((Number(quote.subtotal) || 0) + price),
        total: round((Number(quote.total) || 0) + price),
        delivery: { type: option.type, label: option.displayName || option.label || option.type, price },
    }
}

// ---- dashboard sample ------------------------------------------------------
// "What a customer would pay": a fixed small bracket, Normal strength, Medium
// quality, collected (no delivery). Same engine as a real quote.
export const SAMPLE_PART = Object.freeze({
    name: 'bracket_v3.stl',
    metrics: Object.freeze({ volumeCm3: 24, dimensionsCm: Object.freeze({ length: 8, width: 4.2, height: 1.8 }), confidence: 'high' }),
})

export function samplePartQuote(profile, filament = 'pla') {
    if (!profile) return null
    const multiplier = materialMultiplierFor(profile, filament)
    if (multiplier == null) return null
    return calculateInstantQuote({
        metrics: { ...SAMPLE_PART.metrics },
        settings: printSettingsToQuoteSettings({ ...DEFAULT_EDITOR_PRINT_SETTINGS, filamentType: filament }),
        pricingOverrides: profile.pricingConfig,
        materialMultiplier: multiplier,
    })
}
