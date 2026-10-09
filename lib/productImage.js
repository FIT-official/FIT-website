export const PRODUCT_IMAGE_PLACEHOLDER = '/product-images/photo-pending.svg'

// Catalogue images may be public paths, remote URLs, or private storage keys.
export function productImageSrc(value) {
    const image = typeof value === 'string' ? value.trim() : ''
    if (!image || image.split(/[?#]/)[0] === '/placeholder.jpg') return PRODUCT_IMAGE_PLACEHOLDER
    if (image.startsWith('/product-images/')) {
        let path
        try { path = decodeURIComponent(image.split(/[?#]/)[0]) } catch { return PRODUCT_IMAGE_PLACEHOLDER }
        const assets = JSON.parse(process.env.NEXT_PUBLIC_PRODUCT_IMAGE_PATHS || '[]')
        if (path !== PRODUCT_IMAGE_PLACEHOLDER && !assets.includes(path)) return PRODUCT_IMAGE_PLACEHOLDER
    }
    if (image.startsWith('/') || /^https?:\/\//i.test(image)) return image
    return `/api/proxy?key=${encodeURIComponent(image)}`
}
