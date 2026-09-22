// UI affordances only. Server routes independently verify authorization and quotas.
export const TIERS = { FREE: 'free', STANDARD: 'standard', PRO: 'pro' }
export async function getTierFromPriceId(priceId, priceIds) {
    if (!priceId || !priceIds) return TIERS.FREE
    if (priceId === priceIds.standard) return TIERS.STANDARD
    if (priceId === priceIds.pro) return TIERS.PRO
    return TIERS.FREE
}
export async function getEntitlements({ role, planId, status, priceId, priceIds } = {}) {
    const isAdmin = role === 'admin'
    const selected = planId || await getTierFromPriceId(priceId, priceIds)
    const tier = ['active', 'trialing'].includes(status) && ['standard', 'pro'].includes(selected) ? selected : 'free'
    const signedIn = typeof role === 'string' && role.length > 0
    return { tier, isAdmin, isPaidTier: tier !== 'free', canAccessDashboard: signedIn, canUseMessaging: signedIn }
}
