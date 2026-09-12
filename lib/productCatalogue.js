import { getDiscountedPrice } from '@/utils/discount';

// Use the same starting price shown by catalogue cards.
export function cataloguePrice(product) {
    const amount = Number(product.basePrice?.presentmentAmount || 0);
    const fees = (product.variantTypes || []).reduce((sum, type) => sum + (
        type.options?.length ? Math.min(...type.options.map(option => Number(option.additionalFee || 0))) : 0
    ), 0);
    const price = amount + fees;
    return getDiscountedPrice({ ...product, price: { presentmentAmount: price } }) ?? price;
}

// Match stored display names and URL category names without treating user input
// as a regular expression (for example, "PLA+" remains a literal category).
export function literalCategoryFilter(value) {
    const escaped = String(value).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { $regex: `^${escaped}$`, $options: 'i' };
}
