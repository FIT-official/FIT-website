import { productImageSrc, PRODUCT_IMAGE_PLACEHOLDER } from '@/lib/productImage'
import { isPublicCatalogueProduct } from '@/lib/productPublicContent'

export function realImageSrc(value) {
    if (typeof value !== 'string' || !value.trim()) return null
    let decoded
    try { decoded = decodeURIComponent(value) } catch { return null }
    if (/placeholder|photo[-_\s]?pending|coming[-_\s]?soon|(?:^|\/)image\.png|(?:^|\/)fitogimage\./i.test(decoded)) return null
    const src = productImageSrc(value)
    if (src === PRODUCT_IMAGE_PLACEHOLDER || src.startsWith('//')) return null
    // Match the existing Next image allowlist; unsupported URLs are not photos
    // that this deployment can safely render.
    if (/^https?:/i.test(src)) {
        try {
            const url = new URL(src)
            if (url.protocol !== 'https:' || !['fixittoday.s3.amazonaws.com', 'img.clerk.com'].includes(url.hostname)) return null
        } catch { return null }
    }
    return src
}

export function selectShopPicks(products = []) {
    const seen = new Set()
    return products.flatMap(product => {
        if (!isPublicCatalogueProduct(product) || product.productType !== 'shop' || !product.slug || seen.has(product.slug)) return []
        const image = product.images?.map(realImageSrc).find(Boolean)
        if (!image) return []
        seen.add(product.slug)
        return [{ ...product, homeImage: image }]
    }).slice(0, 8)
}
