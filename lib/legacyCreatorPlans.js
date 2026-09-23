// Existing subscribers only. These IDs were the production catalogue in
// origin/main; amounts were verified from fixitoday.com/api/stripe/plans.
// Do not include these plans in new-sale lookups or grant new Pro features.
const legacyLimits = Object.freeze({ products: null, monthlyPrintRequests: null })
const existing = (priceId, name, amount) => Object.freeze({
    id: 'legacy', priceId, name, amount, currency: 'SGD', interval: 'month', legacy: true,
    // The prior creator service imposed no product/request quota. Null is the
    // JSON-safe representation of its preserved allowance, not a Free limit.
    limits: legacyLimits,
    features: Object.freeze(['Creator storefront', 'Existing product and print-request allowance', 'Customer messaging']),
})

export const LEGACY_CREATOR_PLANS = Object.freeze([
    existing('price_1RoLEqL8rcZaPQbIbEJFpb8w', 'Professional', 24),
    existing('price_1RoLFaL8rcZaPQbIkidotx2y', 'Advanced', 18),
    existing('price_1RoLGsL8rcZaPQbIMgKmvF5q', 'Basic', 12),
    existing('price_1RoLJEL8rcZaPQbIhoVl8diR', 'Hobbyist', 3),
])

export function getLegacyCreatorPlan(priceId) {
    return LEGACY_CREATOR_PLANS.find(plan => plan.priceId === priceId) || null
}
