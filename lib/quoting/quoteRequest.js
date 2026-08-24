/**
 * Validation + server-authoritative quote building for the /api/quote endpoint.
 * Kept separate from the route handler so it is unit-testable without Next.js,
 * Clerk, or Mongoose.
 *
 * Security posture:
 * - Pricing comes ONLY from server-side `pricingConfig` (AppSettings). The input
 *   schema is `.strict()`, so any client attempt to send price/rate fields is
 *   rejected (400) rather than honoured — the client can never set the price.
 * - All numbers are bounded (`.finite()` + min/max) to reject NaN/Infinity and
 *   abusive magnitudes.
 * - Only geometry METRICS are accepted (not raw mesh data). Client metrics are
 *   trusted for live previews only; on persist the /api/quote route recomputes
 *   them from the stored model bytes and rejects suspicious understatement
 *   (see serverGeometry.js + geometryDeviation.js).
 */
import { z } from 'zod'
import { calculateInstantQuote } from './quote'
import { resolveDeliveryFee } from './deliveryTypeResolver'
import { MATERIAL_DENSITIES } from './pricingDefaults'

const Dimensions = z
  .object({
    length: z.number().finite().nonnegative().max(10000),
    width: z.number().finite().nonnegative().max(10000),
    height: z.number().finite().nonnegative().max(10000),
  })
  .strict()

const Settings = z
  .object({
    materialType: z.string().max(40).optional(),
    infillPercent: z.number().finite().min(0).max(100).optional(),
    wallLoops: z.number().finite().min(0).max(20).optional(),
    nozzleMm: z.number().finite().positive().max(5).optional(),
    layerHeightMm: z.number().finite().positive().max(5).optional(),
    enableSupport: z.boolean().optional(),
  })
  .strict()

const Options = z
  .object({
    postProcessing: z.boolean().optional(),
    specialRequest: z.boolean().optional(),
    priority: z.boolean().optional(),
    expedite: z.boolean().optional(),
  })
  .strict()

export const QuoteInputSchema = z
  .object({
    volumeCm3: z.number().finite().positive().max(10_000_000),
    dimensionsCm: Dimensions,
    confidence: z.enum(['high', 'low']).optional().default('high'),
    settings: Settings.optional().default({}),
    options: Options.optional().default({}),
    deliveryTypeName: z.string().max(64).optional(),
    requestId: z.string().uuid().optional(), // present => persist (requires auth in the route)
    mode: z.enum(['instant', 'manual']).optional(), // persisted-branch quote mode; defaults to 'instant' when persisting
    // With a requestId: recompute from the stored model and price it, but write
    // nothing. Lets the editor preview the SAME number it will be charged, and
    // is still server-authoritative — the client sends no hours or prices.
    preview: z.boolean().optional(),
  })
  .strict()

/**
 * Validate raw input and compute an authoritative quote.
 *
 * `printHoursShapeAware` lives in the SERVER context argument, never in
 * `rawInput`: it is derived server-side from the stored model bytes
 * (serverGeometry.recomputeMetricsFromModel) and, once an admin has calibrated,
 * it sets the print-time price. A client-sent value would be price tampering —
 * the `.strict()` input schema rejects it with a 400.
 *
 * @returns {{ok:true,status:200,data:{quote,requestId}} | {ok:false,status:number,error:string,issues?:any}}
 */
export function buildQuote(
  rawInput,
  {
    pricingConfig = {},
    deliveryTypes = [],
    printHoursShapeAware = 0,
    materialDensities = MATERIAL_DENSITIES,
  } = {},
) {
  const parsed = QuoteInputSchema.safeParse(rawInput)
  if (!parsed.success) {
    return { ok: false, status: 400, error: 'Invalid quote input', issues: parsed.error.issues }
  }
  const input = parsed.data

  // Reject an unrecognized materialType rather than silently pricing it as
  // the default material's density (a typo/crafted value would otherwise
  // silently underprice or overprice a print).
  const materialType = input.settings?.materialType
  if (materialType && materialDensities[String(materialType).toLowerCase()] == null) {
    return {
      ok: false,
      status: 400,
      error: `Unknown material type "${materialType}"`,
    }
  }

  const deliveryResolution = resolveDeliveryFee(deliveryTypes, input.deliveryTypeName, {
    key: 'name',
  })
  if (!deliveryResolution.ok) {
    return { ok: false, status: 400, error: `Unknown delivery type "${input.deliveryTypeName}"` }
  }
  const deliveryType = deliveryResolution.type

  const quote = calculateInstantQuote({
    metrics: {
      volumeCm3: input.volumeCm3,
      dimensionsCm: input.dimensionsCm,
      confidence: input.confidence,
      printHoursShapeAware,
    },
    settings: input.settings,
    pricingOverrides: pricingConfig,
    options: input.options,
    deliveryType,
  })

  return {
    ok: true,
    status: 200,
    data: {
      quote,
      requestId: input.requestId ?? null,
      mode: input.mode ?? null,
      preview: input.preview === true,
    },
  }
}
