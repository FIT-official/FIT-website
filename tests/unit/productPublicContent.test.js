import { describe, expect, it } from 'vitest'
import { NON_PUBLIC_PRODUCT_SLUGS, isPublicCatalogueProduct, publicProductDescription, cleanProductCopy } from '@/lib/productPublicContent'
import { editableProduct, productForViewer } from '@/lib/productAccess'
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
    })

    it.each([
        'Escendo Quotation 2512031 (3 Dec 2025)',
        'Escendo Quotation 2512031 (3 Dec 2025).',
        'Quotation 1234 dated 3 Dec 2025. Unit price SGD 7.40.',
        'ESCENDO QUOTATION No. 2512031 (3 December 2025) unit price S$7.40.',
    ])('removes numbered reference variants: %s', reference => {
        expect(publicProductDescription(reference)).toBe('')
        expect(publicProductDescription(`Sensor. ${reference} 2.54 mm pitch.`)).toBe('Sensor. 2.54 mm pitch.')
    })

    it('cleans product saves and delivery notes without changing commercial or licensing fields', () => {
        const original = { ...product, description: `${description} Photo: Example, CC BY 4.0.`,
            delivery: { deliveryTypes: [{ type: 'express-courier', customPrice: 30,
                customDescription: 'Premium tracked courier; tests higher bounds. 1–2 business days, fully tracked.' },
                { type: 'pick-up', customPrice: 0, customDescription: null }] } }
        const clean = cleanProductCopy(original)
        expect(clean.description).toBe(`${publicDescription} Photo: Example, CC BY 4.0.`)
        expect(clean.delivery.deliveryTypes[0]).toEqual({ ...original.delivery.deliveryTypes[0], customDescription: 'Premium tracked courier. 1–2 business days, fully tracked.' })
        expect(clean.delivery.deliveryTypes[1]).toEqual(original.delivery.deliveryTypes[1])
        expect(clean.basePrice).toEqual(original.basePrice)
        expect(clean.stock).toBe(original.stock)
        expect(original.delivery.deliveryTypes[0].customDescription).toContain('tests higher bounds')
        expect(editableProduct(original).description).toBe(clean.description)
        expect(productForViewer(original, null).delivery).toEqual(clean.delivery)
        expect(cleanProductCopy(clean)).toEqual(clean)
    })

    it('retains a usable product name when the description contained only a reference', () => {
        expect(cleanProductCopy({ name: 'Foam Board', description: 'Escendo Quotation 2512031 (3 Dec 2025)' }).description).toBe('Foam Board.')
        expect(editableProduct({ name: 'Foam Board', description: '' }).description).toBe('')
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
