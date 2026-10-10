export const PRODUCT_IMAGE_PLACEHOLDER = '/product-images/photo-pending.svg'

// Catalogue images may be public paths, remote URLs, or private storage keys.
export function productImageSrc(value) {
    const image = typeof value === 'string' ? value.trim() : ''
    if (!image || image.split(/[?#]/)[0] === '/placeholder.jpg') return PRODUCT_IMAGE_PLACEHOLDER
    // Owner rejected this Philips clock-board photo for the 0.28-inch display.
    // Keep the original object/record intact until the physical SKU is verified.
    // Normalize legacy storage keys and their public proxy/S3 representations.
    let storedKey = image
    if (image.startsWith('/') || /^https?:\/\//i.test(image)) {
        try {
            const url = new URL(image, 'https://www.fixitoday.com')
            storedKey = url.pathname === '/api/proxy'
                ? url.searchParams.get('key')
                : decodeURIComponent(url.pathname).replace(/^\//, '')
        } catch { storedKey = null }
    }
    if (storedKey === 'images/1789459046895-zt8j010bzg.jpg') return PRODUCT_IMAGE_PLACEHOLDER
    if (image.startsWith('/product-images/')) {
        let path
        try { path = decodeURIComponent(image.split(/[?#]/)[0]) } catch { return PRODUCT_IMAGE_PLACEHOLDER }
        const assets = JSON.parse(process.env.NEXT_PUBLIC_PRODUCT_IMAGE_PATHS || '[]')
        if (path !== PRODUCT_IMAGE_PLACEHOLDER && !assets.includes(path)) return PRODUCT_IMAGE_PLACEHOLDER
    }
    if (image.startsWith('/') || /^https?:\/\//i.test(image)) return image
    return `/api/proxy?key=${encodeURIComponent(image)}`
}
