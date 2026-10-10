import { expect, it } from 'vitest'
import { productImageSrc, PRODUCT_IMAGE_PLACEHOLDER } from '@/lib/productImage'
import { productJsonLd, productMetadata } from '@/lib/seo/product'
import { merchantProduct } from '@/lib/seo/merchantFeed'
import { selectShopPicks } from '@/lib/home/content'

// Public catalogue evidence captured 10 October 2026; these are synthetic test
// copies, not writes to the original catalogue or a physical inventory recount.
const reviewed = [
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
