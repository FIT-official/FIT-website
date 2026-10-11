export const PRODUCT_IMAGE_PLACEHOLDER = '/product-images/photo-pending.svg'

// Exact reviewed assets only. Preserve originals for evidence; a verified new
// photo key remains eligible. No catalogue, price, stock or variant mutation.
const QUARANTINED_PRODUCT_IMAGES = new Set([
    // Exact reviewed listing/photo conflicts; preserve original records.
    'images/1789460375700-km0lgr9mhsm.jpg', // Digital listing shows an analog thermistor board
    'images/1789459040439-e5pjv4jav9s.jpg', // SN74HC595N PDIP listing shows ST surface-mount chips
    // These four material listings reused a montage visibly labelled PLA Basic.
    'images/1789455051997-1j6t7tjs70ji.jpg', // 1kg PLA Matte
    'images/1789455059919-4a9ytrjx194.jpg', // 1kg PLA Lite
    'images/1789455063681-zipy7w2ysjd.jpg', // 1kg ABS
    'images/1789455080140-jvc81g7sv4i.jpg', // 0.5kg PVA Support
    // Assortment images do not verify the exact stocked CW60-CW180 variants.
    'images/1789459198272-p2mmh6owmtq.jpg', // 230mm x 280mm CW60
    'images/1789459206061-0d4fhl0yvi8s.jpg', // 230mm x 280mm CW80
    'images/1789459213284-cdwphdphhfj.jpg', // 230mm x 280mm CW100
    'images/1789459220524-sf6c49g8xu.jpg', // 230mm x 280mm CW120
    'images/1789459228245-95r4z4ahqrl.jpg', // 230mm x 280mm CW150
    'images/1789459236222-9iw1kh7wwf7.jpg', // 230mm x 280mm CW180
    // The CW240-CW2000 illustration visibly marks a different grit: 150Cw.
    'images/1789459244981-wt6671dsqj.jpg', // 230mm x 280mm CW240
    'images/1789459252720-c7lgspe8ncl.jpg', // 230mm x 280mm CW280
    'images/1789459260905-5y2muotwr0x.jpg', // 230mm x 280mm CW320
    'images/1789459268159-t8ahszw3imc.jpg', // 230mm x 280mm CW400
    'images/1789459274944-iatxba5eljl.jpg', // 230mm x 280mm CW600
    'images/1789459281906-m40q4md1uxn.jpg', // 230mm x 280mm CW800
    'images/1789459288063-u514z8io3qq.jpg', // 230mm x 280mm CW1000
    'images/1789459295941-p4pzupqpugs.jpg', // 230mm x 280mm CW1200
    'images/1789459303942-2vo2i5m9rz9.jpg', // 230mm x 280mm CW1500
    'images/1789459310913-mi0ql6padv.jpg', // 230mm x 280mm CW2000
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
