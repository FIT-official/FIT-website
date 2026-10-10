/** SGD merchandise subtotal after discounts, rounded per unit like Stripe.
 * Includes every order line, regardless of its selected delivery method.
 * Invalid amounts, quantities or mixed currencies cannot qualify for a waiver.
 * Callers must supply server-owned breakdowns, never browser prices.
 */
export function discountedOrderSubtotalCents(lines) {
    let cents = 0;
    for (const { breakdown } of lines) {
        if (String(breakdown.currency).toUpperCase() !== 'SGD' ||
            !Number.isSafeInteger(breakdown.quantity) || breakdown.quantity < 1 ||
            !Number.isFinite(breakdown.price) || breakdown.price < 0) return null;
        cents += Math.round(breakdown.price * 100) * breakdown.quantity;
    }
    return Number.isSafeInteger(cents) ? cents : null;
}

/** FIT has no order-value shipping waiver. Keep configured paid delivery rates. */
export function isFreeStandardDelivery() {
    return false;
}

/** Apply only after packing/weight checks. Quote-only parcels stay blocked.
 * The underlying tier is retained, including the S$30 letterbox value limit.
 * Express and pickup are never eligible for this standard-delivery waiver.
 */
export function applyFreeStandardDelivery(quote, subtotalCents) {
    const freeDeliveryApplied = !quote.blocked &&
        ['letterbox', 'speedpost', 'bulky'].includes(quote.tier) &&
        isFreeStandardDelivery(subtotalCents);
    return { ...quote, priceCents: freeDeliveryApplied ? 0 : quote.priceCents, freeDeliveryApplied };
}
