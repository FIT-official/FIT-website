
// Client-safe: fetch price IDs from API route

export const TIERS = {
    FREE: "free",
    TIER1: "tier1",
    TIER2: "tier2",
    TIER3: "tier3",
    TIER4: "tier4",
};


export async function getTierFromPriceId(priceId, priceIds) {
    if (!priceId || typeof priceId !== "string") return TIERS.FREE;
    const trimmed = priceId.trim();
    if (!priceIds) {
        throw new Error("priceIds must be provided from context");
    }
    if (trimmed === priceIds.tier1) return TIERS.TIER1;
    if (trimmed === priceIds.tier2) return TIERS.TIER2;
    if (trimmed === priceIds.tier3) return TIERS.TIER3;
    if (trimmed === priceIds.tier4) return TIERS.TIER4;
    // Unknown price id: treat as paid tier to avoid over-restricting legitimate users
    return TIERS.TIER1;
}

export async function getEntitlements({ role, priceId, priceIds } = {}) {
    const isAdmin = role === "admin";
    const tier = await getTierFromPriceId(priceId, priceIds);
    const isPaidTier = tier !== TIERS.FREE;
    const canAccessDashboard = isAdmin || isPaidTier;
    const canUseMessaging = isAdmin || isPaidTier;
    return {
        tier,
        isAdmin,
        isPaidTier,
        canAccessDashboard,
        canUseMessaging,
    };
}
