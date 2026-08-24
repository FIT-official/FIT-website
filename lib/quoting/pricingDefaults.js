/**
 * Default pricing configuration and physical constants for the Instant Quoting
 * Engine. These are sensible, overridable defaults; production values live on
 * AppSettings.quotingConfig and are merged over these (see resolvePricing).
 *
 * Units: weight in grams, volume in cm³, time in hours, money in major units
 * (e.g. SGD dollars). Densities in g/cm³.
 */

// Material densities (g/cm³). Keyed by normalized material name. The persisted
// `materialType` enum is coarse (plastic/resin/metal/sandstone); finer filament
// names are also supported for the generic-presets colour→material mapping.
export const MATERIAL_DENSITIES = Object.freeze({
  plastic: 1.24, // default to PLA
  pla: 1.24,
  petg: 1.27,
  abs: 1.04,
  asa: 1.07,
  tpu: 1.21,
  nylon: 1.14,
  pc: 1.2,
  resin: 1.1,
  metal: 4.0, // metal-filled filament (varies widely; override per material)
  sandstone: 1.9,
  // Generic-preset colour/materials (filled or variant PLAs; approximate).
  natural: 1.24,
  wood: 1.25, // wood-filled PLA
  marble: 1.3, // marble/stone-filled PLA
  transparent: 1.27, // transparent PETG-like
})

export const DEFAULT_DENSITY = 1.24 // PLA fallback

/**
 * Resolve a material name to its density.
 *
 * A genuinely unset material (`null`/`undefined`/`''`) is a legitimate state —
 * it defaults to PLA density, same as before. But a NON-EMPTY, unrecognized
 * material string is rejected rather than silently priced as PLA: a typo'd or
 * crafted `materialType` must not silently under/over-price a print.
 *
 * `lib/quoting/quoteRequest.js`'s `buildQuote` already validates `materialType`
 * against the catalogue up front and returns a 400 before this is ever
 * reached — this throw is defense-in-depth for any other caller of
 * `calculateInstantQuote`/`densityFor` that doesn't route through that gate.
 *
 * @throws {Error} if `material` is set but not a recognized key in `densities`.
 */
export function densityFor(material, densities = MATERIAL_DENSITIES) {
  if (!material) return DEFAULT_DENSITY
  const key = String(material).toLowerCase()
  const density = densities[key]
  if (density == null) {
    throw new Error(`Unknown material type "${material}"`)
  }
  return density
}

// Material usage model (how shell + infill translate volume → extruded material).
export const DEFAULT_MATERIAL_MODEL = Object.freeze({
  shellFractionMin: 0.1, // never assume less than 10% solid skin
  shellFractionMax: 1.0,
})

// Print-time heuristic model (v1; replaceable by a slicer — see
// add-slicer-accurate-estimation). Admin can override these per machine via
// AppSettings.quotingConfig.timeModel (Admin → Quoting & Pricing).
export const DEFAULT_TIME_MODEL = Object.freeze({
  baseFlowCm3PerHour: 8, // effective extruded material volume per hour at ref layer
  layerHeightRefMm: 0.2, // reference layer height for the flow figure
  supportTimeFactor: 1.25, // multiplier when supports are enabled
  wallTimeFactorPerLoop: 0.08, // each wall loop adds perimeter time
  minHours: 0.05,
})

/**
 * Merge the admin's time-model overrides over the defaults. Only known keys
 * are copied; null/undefined values fall back to the default.
 */
export function resolveTimeModel(overrides = {}) {
  const out = { ...DEFAULT_TIME_MODEL }
  for (const key of Object.keys(DEFAULT_TIME_MODEL)) {
    const v = overrides?.[key]
    if (v !== undefined && v !== null) out[key] = v
  }
  return out
}

// Money pricing. Opt-in service fees default to 0 (admin sets real values);
// material/time rates mirror the client's example ($20/kg + $3/hr).
export const DEFAULT_PRICING = Object.freeze({
  currency: 'sgd',
  materialRatePerGram: 0.02, // $20/kg
  printTimeRatePerHour: 3, // $3/hr
  baseFee: 0,
  postProcessingFee: 0,
  specialRequestFee: 0,
  priorityFee: 0,
  // Expedite: percentage of subtotal, a flat amount, or the greater of the two.
  expediteMode: 'greater', // 'percent' | 'flat' | 'greater'
  expediteSurchargePercent: 50,
  expediteSurchargeFlat: 20,
  minimumPrice: 5,
})

/**
 * Merge a partial AppSettings.quotingConfig over the defaults. Only known keys
 * are copied (no spreading untrusted objects) to avoid prototype pollution.
 */
export function resolvePricing(overrides = {}) {
  const out = { ...DEFAULT_PRICING }
  for (const key of Object.keys(DEFAULT_PRICING)) {
    const v = overrides?.[key]
    if (v !== undefined && v !== null) out[key] = v
  }
  return out
}
