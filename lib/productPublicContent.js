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

// Imported quotation references belong in purchasing records. Match a numbered
// reference, not useful customer wording such as "quotation available".
export function publicProductDescription(value) {
    return String(value || '')
        .replace(/\b(?:Escendo\s+)?Quotation\s+(?:No\.?\s*|#\s*)?\d{4,}(?:\s*\([^\r\n)]{1,80}\)|\s+dated\s+\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})?(?:[ \t.]*unit price\s+(?:SGD|S\$)\s*\d+(?:\.\d{1,2})?)?\.?(?:[ \t]+|$)/gi, '')
}

export function publicDeliveryDescription(value) {
    return typeof value === 'string' ? value.replace(/;\s*tests higher bounds\./gi, '.') : value
}

export function cleanProductCopy(product) {
    const clean = { ...product }
    if (typeof product.description === 'string') {
        const description = publicProductDescription(product.description)
        clean.description = description === product.description || description.trim()
            ? description : `${product.name || 'Product'}.`
    }
    if (Array.isArray(product.delivery?.deliveryTypes)) {
        clean.delivery = { ...product.delivery, deliveryTypes: product.delivery.deliveryTypes.map(option => (
            Object.hasOwn(option, 'customDescription')
                ? { ...option, customDescription: publicDeliveryDescription(option.customDescription) }
                : { ...option }
        )) }
    }
    return clean
}
