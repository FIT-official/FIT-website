// New sales use explicit deployment settings. Existing subscriptions remain readable by ID.
export const getConfiguredCreatorPriceIds = () => ({
    standard: process.env.STRIPE_STANDARD_MONTHLY_PRICE_ID?.trim() || null,
    standardYearly: process.env.STRIPE_STANDARD_YEARLY_PRICE_ID?.trim() || null,
    pro: process.env.STRIPE_PRO_MONTHLY_PRICE_ID?.trim() || null,
    proYearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID?.trim() || null,
})
export const getStripePriceIds = async () => getConfiguredCreatorPriceIds()
export const getAllPriceIds = async () => Object.values(await getStripePriceIds()).filter(Boolean)
// Compatibility only: never fall back to retired hard-coded prices.
export const STRIPE_PRICE_TIER_1 = async () => (await getStripePriceIds()).pro
export const STRIPE_PRICE_TIER_2 = async () => (await getStripePriceIds()).standard
export const STRIPE_PRICE_TIER_3 = async () => null
export const STRIPE_PRICE_TIER_4 = async () => null
