import { lineNeedsDeliveryAddress } from './checkoutAddressGate'
import { standardShippingTier } from './shipping/weightTiers'

export const PAID_DELIVERY_FALLBACK = 6.2

export function isFitShopProduct(product) {
    return product?.productType === 'shop' && (product.listing == null || product.listing === 'fit')
}

export function paidShopDeliveryFee(product, type, fee) {
    if (isFitShopProduct(product) && lineNeedsDeliveryAddress(type) && !(fee > 0)) {
        return PAID_DELIVERY_FALLBACK
    }
    return fee
}

// These are private, admin-confirmed upper bounds per unit. Include landed
// goods cost, non-recoverable taxes, packing/handling and the largest variant.
// Unknown costs never mean zero. Delivery is budgeted per unit, deliberately
// allowing for separate parcels instead of assuming everything fits in one.
export function shippingCostsInput(input) {
    const result = { confirmed: input?.confirmed === true }
    for (const key of ['unitCost', 'packingCost', 'deliveryCost']) {
        const value = input?.[key]
        if (value == null || value === '') result[key] = null
        else if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1_000_000) {
            throw new Error('Enter valid non-negative delivery costs.')
        } else result[key] = value
    }
    if (result.confirmed && Object.values(result).some(value => value === null)) {
        throw new Error('Complete all three costs before confirming them.')
    }
    return result
}

/** True only for FIT merchandise; repair is a service, not a parcel. */
export function usesWeightShipping(product) {
    return isFitShopProduct(product) && product.slug !== '3d-printer-repair-maintenance'
}

/**
 * Reprice the combined FIT standard shipment from server-owned products and
 * discounted breakdowns. Charge it once, on the first selected standard line,
 * so cart totals and immutable payment snapshots use the same allocation.
 * Other shop lines get a prospective quote for switching to Standard. Pickup,
 * Express, creator and print charges are left alone.
 */
export function applyWeightShipping(lines) {
    const shop = lines.filter(line => !line.customRequest && usesWeightShipping(line.product))
    const standard = shop.filter(line => line.breakdown.chosenDeliveryType === 'standard-shipping')
    const subtotalCents = lines.reduce((sum, { breakdown }) => sum + Math.round(breakdown.price * 100) * breakdown.quantity, 0)
    const quoteFor = group => standardShippingTier(group.map(({ product, breakdown }) => ({ product, quantity: breakdown.quantity })), subtotalCents)
    const selectedQuote = quoteFor(standard)
    for (const line of shop) {
        const { breakdown } = line
        const selected = standard.includes(line)
        breakdown.standardShipping = selected ? selectedQuote : quoteFor([...standard, line])
        breakdown.shippingBlocked = selected && selectedQuote.blocked
        breakdown.standardShippingIncluded = selected && standard[0] !== line
        if (selected) {
            breakdown.deliveryFee = selectedQuote.blocked ? null : (standard[0] === line ? selectedQuote.priceCents / 100 : 0)
            breakdown.deliveryLabel = selectedQuote.label
            breakdown.deliveryDescription = selectedQuote.description
        }
    }
    return standard.some(line => line.breakdown.shippingBlocked)
}

// Reprice server-owned discounted breakdowns for the cart and new payments.
export function applyShopShipping(lines) {
    applyWeightShipping(lines)
    for (const { product, breakdown, customRequest } of lines) {
        if (customRequest || !isFitShopProduct(product)) continue
        const tiered = breakdown.chosenDeliveryType === 'standard-shipping' && breakdown.standardShipping
        breakdown.deliveryFee = breakdown.shippingBlocked ? null : tiered ? breakdown.deliveryFee : paidShopDeliveryFee(product, breakdown.chosenDeliveryType, breakdown.deliveryFee)
        breakdown.total = breakdown.shippingBlocked ? null : Math.round(breakdown.price * 100) * breakdown.quantity / 100 + breakdown.deliveryFee
        breakdown.freeDeliveryApplied = false
    }
    return false
}
