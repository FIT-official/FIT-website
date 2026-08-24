/**
 * Single, shared "resolve a chosen delivery type to its fee" implementation.
 * Replaces three independent lookups (quoteRequest.js, calculateBreakdown.js,
 * customPrintDisplayPrice.js) that each had a different silent-failure
 * behaviour (0 fee / dropped line / fallback to the first entry) when a
 * `chosenDeliveryType`/`deliveryTypeName` didn't match any configured type.
 *
 * Two delivery-type shapes exist in this codebase and both are supported:
 * - AppSettings-style (`name`, `pricingTiers`) — fee depends on dimensions/weight,
 *   computed via `calculateDeliveryPrice`.
 * - Product/CustomPrintRequest-embedded (`type`, `price`/`customPrice`) — a flat fee.
 *
 * Pure, dependency-free (only pulls in the equally-pure `calculateDeliveryPrice`).
 *
 * @param {Array<object>} deliveryTypes
 * @param {string} chosenValue - the requested delivery type's key value (matched against `opts.key`)
 * @param {object} [opts]
 * @param {string} [opts.key='name'] - field to match `chosenValue` against ('name' or 'type')
 * @param {{length,width,height}} [opts.dimensionsCm]
 * @param {number} [opts.weightGrams]
 * @returns {{ok:true,fee:number|null,type:object|null} | {ok:false,reason:string}}
 */
import { calculateDeliveryPrice } from '@/utils/deliveryPriceCalculator'

export function resolveDeliveryFee(deliveryTypes, chosenValue, opts = {}) {
  const { key = 'name', dimensionsCm, weightGrams } = opts
  const list = Array.isArray(deliveryTypes) ? deliveryTypes : []

  if (!chosenValue) {
    return { ok: true, fee: 0, type: null }
  }

  const type = list.find((d) => d && d[key] === chosenValue)
  if (!type) {
    return { ok: false, reason: 'delivery_type_not_found' }
  }

  if (Array.isArray(type.pricingTiers) && type.pricingTiers.length > 0) {
    if (dimensionsCm == null && weightGrams == null) {
      // Existence confirmed; the tiered fee depends on dimensions/weight the
      // caller doesn't have yet (e.g. buildQuote resolves this before
      // calculateInstantQuote knows the estimated weight) — it computes the
      // fee itself once it does, using this same `type`.
      return { ok: true, fee: null, type }
    }
    const calc = calculateDeliveryPrice(type, {
      length: dimensionsCm?.length || 0,
      width: dimensionsCm?.width || 0,
      height: dimensionsCm?.height || 0,
      weight: weightGrams || 0,
    })
    return { ok: true, fee: calc.applicable && calc.price != null ? calc.price : 0, type }
  }

  return { ok: true, fee: Number(type.customPrice ?? type.price ?? 0), type }
}
