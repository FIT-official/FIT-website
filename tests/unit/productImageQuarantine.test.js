// Added thermometer/chip price and stock values are synthetic test fixtures only.
import { expect, it } from 'vitest'
import { productImageSrc, PRODUCT_IMAGE_PLACEHOLDER } from '@/lib/productImage'
import { productJsonLd, productMetadata } from '@/lib/seo/product'
import { merchantProduct } from '@/lib/seo/merchantFeed'
import { selectShopPicks } from '@/lib/home/content'
import filamentPreviews from '@/lib/bulkFilamentPreviews.json'

// Public catalogue evidence captured 10 October 2026; these are synthetic test
// copies, not writes to the original catalogue or a physical inventory recount.
// The four Bambu material cases use invented test-only price/stock values.
const reviewed = [
{
    "id": "6a3f6125d3204f05eac2e3cf",
    "name": "Digital Thermometer Module",
    "key": "images/1789460375700-km0lgr9mhsm.jpg",
    "price": 12.34,
    "stock": 7
},
{
    "id": "6aa8eba4ed93802ad81354be",
    "name": "SN74HC595N IC Chip",
    "key": "images/1789459040439-e5pjv4jav9s.jpg",
    "price": 12.34,
    "stock": 7
},
    {
        "id": "6a3eb3b0c9764357c63caa2a",
        "name": "HC-05 Bluetooth Module",
        "key": "images/1789394404379-rjrmsin0kwa.jpg",
        "price": 12.9,
        "stock": 1
    },
    {
        "id": "6aa8eb22a1ca543d895a496b",
        "name": "2.54mm Dupont Female Header 40p",
        "key": "images/1789458829866-z4s0mf3glx.jpg",
        "price": 0.58,
        "stock": 148
    },
    {
        "id": "6aa8eb29a1ca543d895a4973",
        "name": "2.54mm Dupont Male Header Long",
        "key": "images/1789458836866-24uhc5j633m.jpg",
        "price": 0.25,
        "stock": 52
    },
    {
        "id": "6aa8ed0628bf036c1de9f83b",
        "name": "Li-Ion Charger Protector 8.4V 20A",
        "key": "images/1789459577193-3au2j518e8a.jpg",
        "price": 5,
        "stock": 2
    },
    {
        "id": "6aa8ed5a28bf036c1de9f898",
        "name": "12V 10A AC/DC Adapter",
        "key": "images/1789460319283-wl4j1kesyb.jpg",
        "price": 14.2,
        "stock": 5
    },
    {
        "id": "6aa8ed5f28bf036c1de9f8a0",
        "name": "3D Printing Filament Dehydrator 4 Level 220V 350W",
        "key": "images/1789460354194-2dhv95m1a42.jpg",
        "price": 35.2,
        "stock": 1
    },
    {
        "id": "6a3eb1c9c4030262e203faa2",
        "name": "433MHz Wireless Remote (4-Button ABCD)",
        "key": "images/1789394309086-8cz0iqwphaa.jpg",
        "price": 5.5,
        "stock": 1
    },
    {
        "id": "6a3eb3f8c9764357c63caabe",
        "name": "USB to UART Converter (CP2102/CH340)",
        "key": "images/1789394461067-q7prcwax6.jpg",
        "price": 3.9,
        "stock": 1
    },
    {
        "id": "6aa8eb10a1ca543d895a4953",
        "name": "18650 Battery",
        "key": "images/1789458805845-67yykj9vmna.jpg",
        "price": 6.85,
        "stock": 1
    },
    {
        "id": "6aa8ecd0a1a0725a1406b58e",
        "name": "DC Step Up Booster",
        "key": "images/1789459520186-rif1imvawdo.jpg",
        "price": 9.8,
        "stock": 1
    },
    {
        "id": "6aa8ecf2a1a0725a1406b59b",
        "name": "Boost Buck Converter",
        "key": "images/1789459543933-ms49qcpossh.jpg",
        "price": 3,
        "stock": 2
    },
    {
        "id": "6aa8ed0c28bf036c1de9f843",
        "name": "Stepper Motor Expansion Board",
        "key": "images/1789459585213-auhlxi7318g.jpg",
        "price": 6,
        "stock": 1
    },
    {
        "id": "6aa8ec03ed93802ad8135517",
        "name": "230mm x 280mm CW60",
        "key": "images/1789459198272-p2mmh6owmtq.jpg",
        "price": 1,
        "stock": 85
    },
    {
        "id": "6aa8ec06ed93802ad813551b",
        "name": "230mm x 280mm CW80",
        "key": "images/1789459206061-0d4fhl0yvi8s.jpg",
        "price": 1,
        "stock": 93
    },
    {
        "id": "6aa8ebfbed93802ad813550b",
        "name": "230mm x 280mm CW100",
        "key": "images/1789459213284-cdwphdphhfj.jpg",
        "price": 1,
        "stock": 90
    },
    {
        "id": "6aa8ebfded93802ad813550f",
        "name": "230mm x 280mm CW120",
        "key": "images/1789459220524-sf6c49g8xu.jpg",
        "price": 1,
        "stock": 95
    },
    {
        "id": "6aa8ec00ed93802ad8135513",
        "name": "230mm x 280mm CW150",
        "key": "images/1789459228245-95r4z4ahqrl.jpg",
        "price": 1,
        "stock": 91
    },
    {
        "id": "6aa8ec09ed93802ad813551f",
        "name": "230mm x 280mm CW180",
        "key": "images/1789459236222-9iw1kh7wwf7.jpg",
        "price": 1,
        "stock": 79
    },
    {
        "id": "6aa8ec0ced93802ad8135523",
        "name": "230mm x 280mm CW240",
        "key": "images/1789459244981-wt6671dsqj.jpg",
        "price": 1,
        "stock": 90
    },
    {
        "id": "6aa8ec0fed93802ad8135527",
        "name": "230mm x 280mm CW280",
        "key": "images/1789459252720-c7lgspe8ncl.jpg",
        "price": 1,
        "stock": 86
    },
    {
        "id": "6aa8ec12ed93802ad813552b",
        "name": "230mm x 280mm CW320",
        "key": "images/1789459260905-5y2muotwr0x.jpg",
        "price": 1,
        "stock": 84
    },
    {
        "id": "6aa8ec15ed93802ad813552f",
        "name": "230mm x 280mm CW400",
        "key": "images/1789459268159-t8ahszw3imc.jpg",
        "price": 1,
        "stock": 85
    },
    {
        "id": "6aa8ec18ed93802ad8135533",
        "name": "230mm x 280mm CW600",
        "key": "images/1789459274944-iatxba5eljl.jpg",
        "price": 1,
        "stock": 84
    },
    {
        "id": "6aa8ec1bed93802ad8135537",
        "name": "230mm x 280mm CW800",
        "key": "images/1789459281906-m40q4md1uxn.jpg",
        "price": 1,
        "stock": 85
    },
    {
        "id": "6aa8ec52ed93802ad813553c",
        "name": "230mm x 280mm CW1000",
        "key": "images/1789459288063-u514z8io3qq.jpg",
        "price": 1,
        "stock": 88
    },
    {
        "id": "6aa8ec55ed93802ad8135540",
        "name": "230mm x 280mm CW1200",
        "key": "images/1789459295941-p4pzupqpugs.jpg",
        "price": 1,
        "stock": 83
    },
    {
        "id": "6aa8ec58ed93802ad8135544",
        "name": "230mm x 280mm CW1500",
        "key": "images/1789459303942-2vo2i5m9rz9.jpg",
        "price": 1,
        "stock": 85
    },
    {
        "id": "6aa8ec5bed93802ad8135548",
        "name": "230mm x 280mm CW2000",
        "key": "images/1789459310913-mi0ql6padv.jpg",
        "price": 1,
        "stock": 85
    },
    {
        "id": "6aa8eacda1ca543d895a48f2",
        "name": "Bambu Lab 3D Printing Filament 1kg PLA Matte",
        "key": "images/1789455051997-1j6t7tjs70ji.jpg",
        "price": 12.34,
        "stock": 7
    },
    {
        "id": "6aa8ead5a1ca543d895a4909",
        "name": "Bambu Lab 3D Printing Filament 1kg PLA Lite",
        "key": "images/1789455059919-4a9ytrjx194.jpg",
        "price": 12.34,
        "stock": 7
    },
    {
        "id": "6aa8ead8a1ca543d895a490f",
        "name": "Bambu Lab 3D Printing Filament 1kg ABS",
        "key": "images/1789455063681-zipy7w2ysjd.jpg",
        "price": 12.34,
        "stock": 7
    },
    {
        "id": "6aa8eae9a1ca543d895a4921",
        "name": "Bambu Lab 3D Printing Filament 0.5kg PVA Support",
        "key": "images/1789455080140-jvc81g7sv4i.jpg",
        "price": 12.34,
        "stock": 7
    }
]

it.each(reviewed)('quarantines $name without changing its commercial record', ({ id, name, key, price, stock }) => {
    const product = { _id: id, name, slug: 'fixture-' + id, description: name,
        images: [key], productType: 'shop', listing: 'fit', hidden: false,
        basePrice: { presentmentAmount: price, presentmentCurrency: 'SGD' }, stock,
        delivery: { deliveryTypes: [{ type: 'standard-shipping', price: 6.2 }] }, variantTypes: [] }
    const original = structuredClone(product)
    for (const src of [key, '/api/proxy?key=' + encodeURIComponent(key),
        'https://www.fixitoday.com/api/proxy?key=' + encodeURIComponent(key),
        'https://fixittoday.s3.amazonaws.com/' + key]) {
        expect(productImageSrc(src)).toBe(PRODUCT_IMAGE_PLACEHOLDER)
    }
    const schema = productJsonLd(product)
    expect(schema.image).toEqual(['https://www.fixitoday.com' + PRODUCT_IMAGE_PLACEHOLDER])
    expect(schema.offers.price).toBe(price.toFixed(2))
    expect(productMetadata(product).openGraph.images[0].url).toContain(PRODUCT_IMAGE_PLACEHOLDER)
    expect(selectShopPicks([product])).toEqual([])
    expect(merchantProduct(product)).toBeNull()
    expect(product).toEqual(original)
    // An independently verified replacement is permitted without unblocking
    // the old asset or changing product identity, price or stock.
    const replacement = { ...product, images: ['images/new-verified-' + id + '.jpg'] }
    expect(productImageSrc(replacement.images[0])).not.toBe(PRODUCT_IMAGE_PLACEHOLDER)
    expect(merchantProduct(replacement)).not.toBeNull()
})


it('retains the separately keyed PLA Basic montage and all 47 official variant previews', () => {
    const basicKey = 'images/1769264467421-vjcrqw093eb.jpg'
    expect(productImageSrc(basicKey)).toBe('/api/proxy?key=' + encodeURIComponent(basicKey))
    const previews = filamentPreviews.entries.filter(entry => entry.preview.status === 'verified_official_variant_photo')
    expect(previews).toHaveLength(47)
    for (const entry of previews) expect(productImageSrc(entry.preview.src)).toBe(entry.preview.src)
})
