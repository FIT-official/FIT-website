import { lineNeedsDeliveryAddress } from './checkoutAddressGate'
import { standardShippingTier } from './shipping/weightTiers'

export const FREE_DELIVERY_MINIMUM = 20
export const FREE_DELIVERY_MARGIN = 6
export const PAID_DELIVERY_FALLBACK = 6.2

// An allowance, not a claim about FIT's negotiated Stripe fees. Covers the
// published SG card, international and conversion fees plus a tax buffer.
// https://stripe.com/en-sg/pricing (checked 2026-09-30).
const PAYMENT_ALLOWANCE_PERCENT = 7
const PAYMENT_ALLOWANCE_FIXED_CENTS = 60

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

function costsInCents(product) {
    const costs = product?.shippingCosts
    if (costs?.confirmed !== true) return null
    const values = ['unitCost', 'packingCost', 'deliveryCost'].map(key => costs[key])
    if (values.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) return null
    return values.reduce((sum, value) => sum + Math.ceil(value * 100 - 1e-8), 0)
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

// Called on server-owned prices after discounts, for the cart AND payment.
// Mixed-service/creator baskets retain their normal fees. A client-supplied
// price, cost, shipping fee or eligibility flag is never used here.
export function applyShopShipping(lines, address) {
    const shippingBlocked = applyWeightShipping(lines)
    const country = String(address?.country || '').trim().toLowerCase()
    let eligible = lines.length > 0 && ['sg', 'singapore'].includes(country)
    let revenue = 0
    let costs = 0
    for (const { product, breakdown, customRequest } of lines) {
        const quantity = breakdown.quantity
        const unitCost = costsInCents(product)
        if (customRequest || !isFitShopProduct(product) ||
            breakdown.chosenDeliveryType !== 'standard-shipping' ||
            String(breakdown.currency).toUpperCase() !== 'SGD' ||
            !Number.isSafeInteger(quantity) || quantity < 1 ||
            !Number.isFinite(breakdown.price) || breakdown.price < 0 || unitCost === null) {
            eligible = false
        }
        revenue += Math.round(breakdown.price * 100) * quantity
        costs += (unitCost ?? 0) * quantity
    }
    const paymentAllowance = Math.ceil(revenue * PAYMENT_ALLOWANCE_PERCENT / 100) + PAYMENT_ALLOWANCE_FIXED_CENTS
    eligible = eligible && Number.isSafeInteger(revenue) && Number.isSafeInteger(costs) &&
        revenue > FREE_DELIVERY_MINIMUM * 100 && revenue - costs - paymentAllowance >= FREE_DELIVERY_MARGIN * 100

    // Keep the profitability policy above intact. A parcel requiring a manual
    // quote cannot be made available by waiving a delivery fee.
    eligible = eligible && !shippingBlocked

    for (const { product, breakdown, customRequest } of lines) {
        if (customRequest || !isFitShopProduct(product)) continue
        const tiered = breakdown.chosenDeliveryType === 'standard-shipping' && breakdown.standardShipping
        breakdown.deliveryFee = breakdown.shippingBlocked ? null : eligible ? 0 : tiered ? breakdown.deliveryFee : paidShopDeliveryFee(product, breakdown.chosenDeliveryType, breakdown.deliveryFee)
        breakdown.total = breakdown.shippingBlocked ? null : Math.round(breakdown.price * 100) * breakdown.quantity / 100 + breakdown.deliveryFee
        breakdown.freeDeliveryApplied = eligible
    }
    return eligible
}
