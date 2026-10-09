export const PRODUCT_IMAGE_PLACEHOLDER = '/product-images/photo-pending.svg'

// Catalogue images may be public paths, remote URLs, or private storage keys.
export function productImageSrc(value) {
    const image = typeof value === 'string' ? value.trim() : ''
    if (!image || image.split(/[?#]/)[0] === '/placeholder.jpg') return PRODUCT_IMAGE_PLACEHOLDER
    if (image.startsWith('/') || /^https?:\/\//i.test(image)) return image
    return `/api/proxy?key=${encodeURIComponent(image)}`
}
