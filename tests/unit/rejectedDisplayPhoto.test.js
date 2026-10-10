import { expect, it } from 'vitest'
import { productImageSrc, PRODUCT_IMAGE_PLACEHOLDER } from '@/lib/productImage'
import { productJsonLd, productMetadata } from '@/lib/seo/product'
import { merchantProduct } from '@/lib/seo/merchantFeed'
import { selectShopPicks } from '@/lib/home/content'

const product = {
    _id: '6aa8eba7ed93802ad81354c2', slug: '028inch-digital-7-segment-display',
    name: '0.28inch Digital 7 Segment Display', description: '0.28inch Digital 7 Segment Display.',
    productType: 'shop', listing: 'fit', hidden: false, stock: 3,
    basePrice: { presentmentAmount: 0.75, presentmentCurrency: 'SGD' },
    delivery: { deliveryTypes: [{ type: 'standard-shipping', price: 6.2 }] },
    images: ['images/1789459046895-zt8j010bzg.jpg'], variantTypes: [],
}

it('uses a neutral image across product metadata, cards, homepage picks and Merchant feed', () => {
    const original = structuredClone(product)
    const schema = productJsonLd(product)
    expect(productImageSrc(product.images[0])).toBe(PRODUCT_IMAGE_PLACEHOLDER)
    expect(schema.image).toEqual(['https://www.fixitoday.com/product-images/photo-pending.svg'])
    expect(schema.offers.price).toBe('0.75')
    expect(schema.offers.availability).toBe('https://schema.org/InStock')
    expect(productMetadata(product).openGraph.images[0].url).toContain(PRODUCT_IMAGE_PLACEHOLDER)
    expect(selectShopPicks([product])).toEqual([])
    expect(merchantProduct(product)).toBeNull() // placeholders must not be advertised as product photography
    expect(product).toEqual(original) // source photo, listing, price and stock remain intact
})

it('allows a separately verified replacement without reviving the rejected photo', () => {
    const src = 'images/verified-replacement.jpg'
    expect(productImageSrc(src)).toBe('/api/proxy?key=images%2Fverified-replacement.jpg')
    expect(merchantProduct({ ...product, images: [src] })).not.toBeNull()
})
