import { describe, expect, it } from 'vitest'
import { NON_PUBLIC_PRODUCT_SLUGS, isPublicCatalogueProduct, publicProductDescription } from '@/lib/productPublicContent'
import { productForViewer } from '@/lib/productAccess'
import { productMetadata, productJsonLd, publicProductSeed } from '@/lib/seo/product'

const description = 'ESP32-Wroom/DevKit, 30pin. Escendo Quotation 2512031 (3 Dec 2025) unit price SGD 7.40. Sold by Fix It Today Singapore.'
const publicDescription = 'ESP32-Wroom/DevKit, 30pin. Sold by Fix It Today Singapore.'
const product = {
    _id: 'esp32', slug: 'esp32-wroomdevkit-30pin', creatorUserId: 'owner',
    name: 'ESP32-Wroom/DevKit, 30pin', productType: 'shop', description,
    basePrice: { presentmentAmount: 9.9, presentmentCurrency: 'SGD' }, stock: 5,
}

describe('public product content', () => {
    it('removes the proven procurement reference without changing other text or customer prices', () => {
        const visible = productForViewer(product, null)
        expect(publicProductDescription(description)).toBe(publicDescription)
        expect(visible.description).toBe(publicDescription)
        expect(visible.basePrice.presentmentAmount).toBe(9.9)
        expect(product.description).toBe(description)
        expect(productForViewer(product, 'owner').description).toBe(description)
        expect(productForViewer(product, 'admin', true).description).toBe(description)
    })

    it('leaves other quotation text, unit prices, dimensions and formatting alone', () => {
        const text = 'Unit price SGD 12.90. Quotation available on request.\n\n6.5 × 14.5 cm, 2.54 mm pitch.  Pack of 10.'
        expect(publicProductDescription(text)).toBe(text)
        const differentReference = 'Quotation 1234 dated 3 Dec 2025. Unit price SGD 7.40.'
        expect(publicProductDescription(differentReference)).toBe(differentReference)
    })

    it('keeps provenance out of metadata, structured data and server seeds', () => {
        expect(productMetadata(product).description).toBe(publicDescription)
        expect(productJsonLd(product).description).toBe(publicDescription)
        expect(productJsonLd(product).offers.price).toBe('9.90')
        expect(publicProductSeed(product).description).toBe(publicDescription)
        expect(publicProductSeed(product).basePrice).toEqual(product.basePrice)
    })

    it('quarantines only the five exact placeholder slugs while retaining manager access', () => {
        expect(NON_PUBLIC_PRODUCT_SLUGS).toHaveLength(5)
        for (const slug of NON_PUBLIC_PRODUCT_SLUGS) {
            const placeholder = { ...product, slug }
            expect(isPublicCatalogueProduct(placeholder)).toBe(false)
            expect(productMetadata(placeholder).robots.index).toBe(false)
            expect(productJsonLd(placeholder)).toBeNull()
            expect(publicProductSeed(placeholder)).toBeNull()
            expect(productForViewer(placeholder, null)).toBeNull()
            expect(productForViewer(placeholder, 'owner')).toBe(placeholder)
        }
        expect(isPublicCatalogueProduct({ ...product, slug: 'electronics-test-fixture' })).toBe(true)
        expect(isPublicCatalogueProduct({ ...product, slug: 'print-product-test-20' })).toBe(true)
    })
})
