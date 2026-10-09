// Only Lanbo filament may use product-specific approved discounts.
// Brand identity comes from canonical catalogue labels, never descriptions
// (Lanbo descriptions list compatible Bambu printers).
export function isFilamentProduct(product) {
    return product.productType !== 'print' && (/^filament$/i.test(product.categoryId || '') || (!product.categoryId && product.category === 1) || /\bfilament\b/i.test(String(product.name || '') + ' ' + String(product.slug || '')));
}
export function discountRulesForProduct(product, extraRules = []) {
    const filament = isFilamentProduct(product);
    const label = String(product.name || '') + ' ' + String(product.slug || '');
    if (filament && (!/\blanbo\b/i.test(label) || /\bbambu[ -]*labs?\b/i.test(label))) return [];
    const baseRules = Array.isArray(product.discounts) && product.discounts.length
        ? product.discounts : (product.discount ? [product.discount] : []);
    return [...baseRules, ...(!filament && Array.isArray(extraRules) ? extraRules : [])];
}

export function getEffectivePercentageForRule(rule, priceAmount, quantity, now = new Date()) {
    if (!rule) return 0;

    // Date window
    if (
        (rule.startDate && now < new Date(rule.startDate)) ||
        (rule.endDate && now > new Date(rule.endDate))
    ) {
        return 0;
    }

    // Minimum amount check (per-item basis, consistent with prior behavior)
    if (rule.minimumAmount && Number(priceAmount) < Number(rule.minimumAmount)) {
        return 0;
    }

    // Base general percentage for this rule
    let effective =
        typeof rule.percentage === 'number'
            ? rule.percentage
            : Number(rule.percentage) || 0;

    // If tiered discounts are configured, pick the best matching tier for the quantity
    if (Array.isArray(rule.tiers) && rule.tiers.length > 0 && quantity > 0) {
        const matchingTiers = rule.tiers.filter(tier => {
            const min = typeof tier.minQty === 'number' ? tier.minQty : 1;
            const max = typeof tier.maxQty === 'number' && tier.maxQty > 0 ? tier.maxQty : Infinity;
            return quantity >= min && quantity <= max;
        });

        if (matchingTiers.length > 0) {
            const bestTier = matchingTiers.reduce((best, current) => {
                const bestPct = typeof best.percentage === 'number' ? best.percentage : 0;
                const currentPct = typeof current.percentage === 'number' ? current.percentage : 0;
                return currentPct > bestPct ? current : best;
            });

            if (typeof bestTier.percentage === 'number') {
                effective = bestTier.percentage;
            }
        }
    }

    if (!effective || effective <= 0) return 0;
    return effective;
}

export function getDiscountedPrice(product, quantity = 1, extraRules = []) {
    const { price } = product;
    if (!price || !price.presentmentAmount) {
        return null;
    }

    const now = new Date();
    const priceAmount = Number(price.presentmentAmount);

    const rulesArray = discountRulesForProduct(product, extraRules);

    if (!rulesArray.length) {
        return null;
    }

    // Sum effective percentages from all applicable rules (stacked discounts)
    const totalPercentage = rulesArray.reduce((sum, rule) => {
        return sum + getEffectivePercentageForRule(rule, priceAmount, quantity, now);
    }, 0);

    if (!totalPercentage || totalPercentage <= 0) {
        return null;
    }

    const cappedPercentage = Math.min(totalPercentage, 100);
    const discounted = priceAmount * (1 - cappedPercentage / 100);
    return Number(discounted.toFixed(2));
}