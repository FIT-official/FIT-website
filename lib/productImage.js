export const PRODUCT_IMAGE_PLACEHOLDER = '/placeholder.jpg'

// Catalogue images may be public paths, remote URLs, or private storage keys.
export function productImageSrc(value) {
    const image = typeof value === 'string' ? value.trim() : ''
    if (!image) return PRODUCT_IMAGE_PLACEHOLDER
    if (image.startsWith('/') || /^https?:\/\//i.test(image)) return image
    return `/api/proxy?key=${encodeURIComponent(image)}`
}
