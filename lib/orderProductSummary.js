// Only call with orders belonging to the authenticated buyer. Retired products
// still provide a name and photo without exposing private assets or sales.
export function orderProductSummary(product) {
    if (!product) return null;
    return {
        _id: String(product._id),
        name: product.name,
        images: product.images || [],
        creatorUserId: product.creatorUserId,
        ...(!product.hidden && !product.flaggedForModeration ? { slug: product.slug } : {}),
    };
}
