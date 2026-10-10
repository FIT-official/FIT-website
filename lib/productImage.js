export const PRODUCT_IMAGE_PLACEHOLDER = '/product-images/photo-pending.svg'

// Exact reviewed assets only. Preserve originals for evidence; a verified new
// photo key remains eligible. No catalogue, price, stock or variant mutation.
const QUARANTINED_PRODUCT_IMAGES = new Set([
    'images/1789394309086-8cz0iqwphaa.jpg', // 433MHz Wireless Remote (4-Button ABCD)
    'images/1789394461067-q7prcwax6.jpg', // USB to UART Converter (CP2102/CH340)
    'images/1789458805845-67yykj9vmna.jpg', // 18650 Battery
    'images/1789459520186-rif1imvawdo.jpg', // DC Step Up Booster
    'images/1789459543933-ms49qcpossh.jpg', // Boost Buck Converter
    'images/1789459585213-auhlxi7318g.jpg', // Stepper Motor Expansion Board
    'images/1789394404379-rjrmsin0kwa.jpg', // HC-05 Bluetooth Module
    'images/1789458829866-z4s0mf3glx.jpg', // 2.54mm Dupont Female Header 40p
    'images/1789458836866-24uhc5j633m.jpg', // 2.54mm Dupont Male Header Long
    'images/1789459046895-zt8j010bzg.jpg', // 0.28inch Digital 7 Segment Display
    'images/1789459577193-3au2j518e8a.jpg', // Li-Ion Charger Protector 8.4V 20A
    'images/1789460319283-wl4j1kesyb.jpg', // 12V 10A AC/DC Adapter
    'images/1789460354194-2dhv95m1a42.jpg', // 3D Printing Filament Dehydrator 4 Level 220V 350W
])

// Catalogue images may be public paths, remote URLs, or private storage keys.
export function productImageSrc(value) {
    const image = typeof value === 'string' ? value.trim() : ''
    if (!image || image.split(/[?#]/)[0] === '/placeholder.jpg') return PRODUCT_IMAGE_PLACEHOLDER
    // Reviewed images with disproven or unresolved product identity stay neutral.
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
    if (QUARANTINED_PRODUCT_IMAGES.has(storedKey)) return PRODUCT_IMAGE_PLACEHOLDER
    if (image.startsWith('/product-images/')) {
        let path
        try { path = decodeURIComponent(image.split(/[?#]/)[0]) } catch { return PRODUCT_IMAGE_PLACEHOLDER }
        const assets = JSON.parse(process.env.NEXT_PUBLIC_PRODUCT_IMAGE_PATHS || '[]')
        if (path !== PRODUCT_IMAGE_PLACEHOLDER && !assets.includes(path)) return PRODUCT_IMAGE_PLACEHOLDER
    }
    if (image.startsWith('/') || /^https?:\/\//i.test(image)) return image
    return `/api/proxy?key=${encodeURIComponent(image)}`
}
