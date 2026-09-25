/**
 * Pricing a creator print farm's job with its resolved profile
 * (lib/quoting/farmProfile.js), through the same engine as Fix It Today jobs.
 *
 * Money boundary: these are ESTIMATES. They never become `request.quote`,
 * never reach the cart or checkout, and persistInstantQuote keeps refusing
 * creator requests. The creator confirms the final price off-platform.
 * TODO(phase5-connect): creator payments through Stripe Connect.
 */
import { buildQuote, QuoteInputSchema } from './quoteRequest'
import { checkMachineLimits, machineLimitMessage } from './machineLimits'
import { measureStoredModel } from './persistInstantQuote'
import { withFlatDelivery, filamentFromName } from './farmProfile'
import { printSettingsToQuoteSettings } from './printSettingsToQuote'
import { DEFAULT_EDITOR_PRINT_SETTINGS, QUALITY_MAP, STRENGTH_MAP } from './genericPresets'
import { FILAMENTS } from '@/lib/filamentCatalogue'

const OPTION_KEYS = ['postProcessing', 'specialRequest', 'priority', 'expedite']
export const ESTIMATE_STATUSES = Object.freeze(['pending_upload', 'pending_config', 'configured'])
const FILAMENT_KEYS = FILAMENTS.map((item) => item.value)

const pickOptions = (source) => Object.fromEntries(OPTION_KEYS.map((key) => [key, source?.[key] === true]))
const densityKey = (filament) => (filament === 'pla_matte' ? 'pla' : filament)

/** Rush and priority depend on the farm having set those fees (its stock is unknown). */
export function farmOptionError(profile, options = {}) {
    if (options.priority && !profile?.offers?.priority) return 'This print farm does not offer priority printing.'
    if (options.expedite && !profile?.offers?.expedite) return 'This print farm does not offer rush printing.'
    return null
}

function limitsError(quote, profile) {
    const limits = checkMachineLimits(quote.inputs?.dimensionsCm, (quote.inputs?.weightGrams ?? 0) / 1000, profile.machineLimits)
    return limits.fits ? null : machineLimitMessage(limits.violations)
}

const pricedWith = (profile, creatorUserId) => ({ profile: 'farm', creatorUserId, version: Number(profile.version) || 0 })

/**
 * POST /api/quote `{ creatorUserId, preview: true, ... }` — a live estimate
 * for the request page, priced with the farm's resolved profile.
 * @returns {{status:number, body:object}}
 */
export function previewFarmQuote({ body, profile, creatorUserId }) {
    const parsed = QuoteInputSchema.safeParse(body)
    if (!parsed.success) return { status: 400, body: { error: 'Invalid quote input', issues: parsed.error.issues } }
    const input = parsed.data
    if (input.requestId || input.preview !== true) {
        return { status: 400, body: { error: 'Print farm prices are estimates: send preview: true without a requestId.' } }
    }
    const filament = input.selection?.filament
    const material = profile.materials.find((item) => item.filament === filament)
    if (!material) return { status: 400, body: { error: 'Choose a material this print farm offers.' } }
    if (!material.colours.some((item) => item.name === input.selection.colour)) {
        return { status: 400, body: { error: 'Choose a colour this print farm offers.' } }
    }
    const options = pickOptions(input.options)
    const optionError = farmOptionError(profile, options)
    if (optionError) return { status: 409, body: { error: optionError } }
    // The farm's own delivery options are flat fees added on the page; the
    // engine gets none. Density follows the chosen filament, not the client.
    const { deliveryTypeName: _delivery, creatorUserId: _creator, ...rest } = input
    const result = buildQuote({ ...rest, options, settings: { ...input.settings, materialType: densityKey(filament) } },
        { pricingConfig: profile.pricingConfig, deliveryTypes: [], materialMultiplier: material.multiplier })
    if (!result.ok) return { status: result.status, body: { error: result.error, issues: result.issues } }
    const quote = result.data.quote
    quote.inputs.options = options
    const tooBig = limitsError(quote, profile)
    if (tooBig) return { status: 422, body: { error: tooBig } }
    return { status: 200, body: { quote, estimateOnly: true, pricedWith: pricedWith(profile, creatorUserId) } }
}

/**
 * Settings to price a saved creator request with. Creator requests carry the
 * customer's preferences (`generic` strength/quality/filament/colour); a
 * request that also saved printSettings uses those.
 */
export function farmQuoteSettings(printConfiguration = {}) {
    const generic = printConfiguration?.generic || {}
    const saved = printConfiguration?.printSettings
    const filament = [saved?.filamentType, generic.filament].find((value) => FILAMENT_KEYS.includes(value))
        || filamentFromName(generic.material)
    const printSettings = saved
        ? { ...DEFAULT_EDITOR_PRINT_SETTINGS, ...saved }
        : { ...DEFAULT_EDITOR_PRINT_SETTINGS, ...(STRENGTH_MAP[generic.strength] || STRENGTH_MAP.Normal),
            ...(QUALITY_MAP[generic.quality] || QUALITY_MAP.Medium) }
    return {
        filament: filament || null,
        colour: generic.colour || null,
        quoteSettings: printSettingsToQuoteSettings({ ...printSettings, materialType: 'plastic', filamentType: filament || 'pla' }),
    }
}

/**
 * Re-measure a saved creator request's model server-side and price it with the
 * farm profile. Writes nothing; the route stores the result as
 * `request.estimate` (never `quote`).
 * @returns {Promise<{status:number, body:object}>}
 */
export async function estimateCreatorRequest({ request, profile, body = {} }) {
    const { filament, colour, quoteSettings } = farmQuoteSettings(request.printConfiguration)
    const material = profile.materials.find((item) => item.filament === filament)
    if (!material) return { status: 422, body: { error: 'Choose a material this print farm offers.' } }
    if (colour && !material.colours.some((item) => item.name === colour)) {
        return { status: 422, body: { error: 'Choose a colour this print farm offers.' } }
    }
    const options = pickOptions(body.options)
    const optionError = farmOptionError(profile, options)
    if (optionError) return { status: 409, body: { error: optionError } }
    let delivery = null
    if (body.deliveryType != null) {
        delivery = profile.deliveryOptions.find((item) => item.type === body.deliveryType)
        if (!delivery) return { status: 400, body: { error: 'Choose a delivery option this print farm offers.' } }
    }
    const measured = await measureStoredModel({ model: request.modelFile || {}, quoteSettings,
        layerStackModel: profile.pricingConfig.layerStackModel })
    if (!measured.ok) {
        return { status: 422, body: { error: 'The model could not be measured for an estimate. The print farm will price it on review.', manualReviewRequired: true } }
    }
    const { metrics } = measured
    const result = buildQuote({ volumeCm3: metrics.volumeCm3, dimensionsCm: metrics.dimensionsCm, confidence: metrics.confidence,
        settings: quoteSettings, options },
    { pricingConfig: profile.pricingConfig, printHoursShapeAware: metrics.printHoursShapeAware, materialMultiplier: material.multiplier })
    if (!result.ok) return { status: result.status, body: { error: result.error, issues: result.issues } }
    const quote = result.data.quote
    quote.inputs.options = options
    const tooBig = limitsError(quote, profile)
    if (tooBig) return { status: 422, body: { error: tooBig } }
    return {
        status: 200,
        body: { estimate: withFlatDelivery(quote, delivery), estimateOnly: true, pricedWith: pricedWith(profile, request.creatorUserId) },
    }
}
