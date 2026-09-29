// These exact legacy records contain placeholder product content. Keep them
// available to their managers without listing or indexing them publicly.
export const NON_PUBLIC_PRODUCT_SLUGS = [
    'creator-product',
    'admin-product-digital',
    'admin-product-normal',
    'admin-product-normal-free',
    'print-product-test-2',
]

export function isPublicCatalogueProduct(product) {
    return !!product && !product.hidden && !product.flaggedForModeration &&
        !NON_PUBLIC_PRODUCT_SLUGS.includes(product.slug)
}

// Remove only the procurement-reference sentence found in imported records.
// Product specifications and the actual customer price fields are untouched.
export function publicProductDescription(value) {
    return String(value || '')
        .replace(/\bEscendo Quotation 2512031 \(3 Dec 2025\) unit price SGD \d+(?:\.\d+)?\.(?=\s|$)[ \t]?/g, '')
}
