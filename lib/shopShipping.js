import { lineNeedsDeliveryAddress } from './checkoutAddressGate'

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

// Called on server-owned prices after discounts, for the cart AND new payments.
// FIT does not offer an order-value shipping waiver. Preserve configured paid
// rates, the existing legacy fallback, and collection/digital delivery choices.
// Existing checkout snapshots are resumed without passing through this helper.
export function applyShopShipping(lines) {
    for (const { product, breakdown, customRequest } of lines) {
        if (customRequest || !isFitShopProduct(product)) continue
        breakdown.deliveryFee = paidShopDeliveryFee(product, breakdown.chosenDeliveryType, breakdown.deliveryFee)
        breakdown.total = Math.round(breakdown.price * 100) * breakdown.quantity / 100 + breakdown.deliveryFee
        breakdown.freeDeliveryApplied = false
    }
    return false
}
