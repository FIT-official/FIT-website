import { STRIPE_PRICE_TIER_1, STRIPE_PRICE_TIER_2, STRIPE_PRICE_TIER_3, STRIPE_PRICE_TIER_4 } from "@/lib/stripeConfig";

export const TIERS = {
    FREE: "free",
    TIER1: "tier1",
    TIER2: "tier2",
    TIER3: "tier3",
    TIER4: "tier4",
};

export function getTierFromPriceId(priceId) {
    if (!priceId || typeof priceId !== "string") return TIERS.FREE;
    const trimmed = priceId.trim();

    if (trimmed === STRIPE_PRICE_TIER_1()) return TIERS.TIER1;
    if (trimmed === STRIPE_PRICE_TIER_2()) return TIERS.TIER2;
    if (trimmed === STRIPE_PRICE_TIER_3()) return TIERS.TIER3;
    if (trimmed === STRIPE_PRICE_TIER_4()) return TIERS.TIER4;

    // Unknown price id: treat as paid tier to avoid over-restricting legitimate users
    return TIERS.TIER1;
}

export function getEntitlements({ role, priceId } = {}) {
    const isAdmin = role === "admin";
    const tier = getTierFromPriceId(priceId);

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
