import { resolveDeliveryFee } from '@/lib/quoting/deliveryTypeResolver'

/**
 * Pure selector: pick the right price to display for a custom-print request,
 * given the two ways a request can be priced.
 *
 * - Instant quote (Instant Quoting Engine): server-authoritative breakdown is
 *   persisted on `request.quote` and `request.quoteMode === 'instant'`. The
 *   amount shown is `quote.total`.
 * - Manual quote (admin sets): legacy `request.basePrice + request.printFee`.
 *   This is also the path for any quote without a marked mode (legacy data).
 *
 * Returns `{ amount, label, source }`. No I/O.
 */
export function customPrintDisplayPrice(request) {
  const r = request || {}
  const isInstant =
    r.quoteMode === 'instant' &&
    typeof r.quote?.total === 'number' &&
    Number.isFinite(r.quote.total)

  if (isInstant) {
    return { amount: Number(r.quote.total), label: 'Instant Quote', source: 'instant' }
  }

  const base = Number(r.basePrice) || 0
  const fee = Number(r.printFee) || 0
  return { amount: base + fee, label: 'Quoted', source: 'manual' }
}

/**
 * Pure charge breakdown for a fixed-priced custom-print request at checkout.
 * The amount is selected by `customPrintDisplayPrice` (instant → quote.total,
 * manual/legacy → basePrice + printFee) so the price charged always matches the
 * price displayed. Delivery: the requested type if the request offers it, else
 * the first available; fee prefers `customPrice` over `price`.
 *
 * Returns { amount, label, source, chosenDeliveryType, deliveryFee, total,
 * currency } — currency upper-cased, defaulting to SGD. No I/O.
 *
 * @throws {Error} if `requestedDeliveryType` is set but doesn't match any of
 *   the request's configured delivery types.
 */
export function customPrintChargeBreakdown(request, requestedDeliveryType = '') {
  const r = request || {}
  const { amount, label, source } = customPrintDisplayPrice(r)

  const deliveryTypes = r.delivery?.deliveryTypes || []

  // A genuinely unrequested delivery type (empty/undefined) falls back to the
  // request's default delivery option — every instant-quoted request has one
  // attached (see "Instant quotes are immediately payable with admin-default
  // delivery"). But an EXPLICITLY requested type that doesn't match any
  // configured option is rejected rather than silently substituted, per
  // lib/quoting/deliveryTypeResolver.js.
  let chosenDeliveryType
  if (requestedDeliveryType) {
    const resolution = resolveDeliveryFee(deliveryTypes, requestedDeliveryType, { key: 'type' })
    if (!resolution.ok) {
      throw new Error(`Unknown delivery type "${requestedDeliveryType}" for custom print request`)
    }
    chosenDeliveryType = requestedDeliveryType
  } else {
    chosenDeliveryType = deliveryTypes[0]?.type || ''
  }
  const chosen = deliveryTypes.find((dt) => dt?.type === chosenDeliveryType)
  const deliveryFee = Number(chosen?.customPrice ?? chosen?.price ?? 0)

  return {
    amount,
    label,
    source,
    chosenDeliveryType,
    deliveryFee,
    total: amount + deliveryFee,
    currency: String(r.currency || 'sgd').toUpperCase(),
  }
}
