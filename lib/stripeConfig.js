// New sales use explicit deployment settings. Existing subscriptions remain readable by ID.
export const getStripePriceIds = async () => ({
    standard: process.env.STRIPE_STANDARD_MONTHLY_PRICE_ID || null,
    pro: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || null,
})
export const getAllPriceIds = async () => Object.values(await getStripePriceIds()).filter(Boolean)
// Compatibility only: never fall back to retired hard-coded prices.
export const STRIPE_PRICE_TIER_1 = async () => (await getStripePriceIds()).pro
export const STRIPE_PRICE_TIER_2 = async () => (await getStripePriceIds()).standard
export const STRIPE_PRICE_TIER_3 = async () => null
export const STRIPE_PRICE_TIER_4 = async () => null
