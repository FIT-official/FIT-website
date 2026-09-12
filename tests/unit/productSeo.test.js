import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    productDescription, productImageUrl, productMetadata, productJsonLd, publicProductSeed,
} from '@/lib/seo/product'

const product = {
    _id: 'filament1',
    slug: 'lanbo-pla-filament',
    name: 'Lanbo PLA Filament',
    description: '**PLA filament** for everyday 3D printing.',
    productType: 'shop',
    images: ['images/blue filament.webp'],
    basePrice: { presentmentAmount: 20, presentmentCurrency: 'SGD' },
    variantTypes: [{ name: 'Colour', options: [
        { name: 'Blue', additionalFee: 5, stock: 2 },
        { name: 'White', additionalFee: 0, stock: 0 },
    ] }],
}

afterEach(() => vi.useRealTimers())

describe('product metadata', () => {
    it('uses readable descriptions and the actual absolute product photo', () => {
        const metadata = productMetadata(product)
        expect(metadata.description).toBe('PLA filament for everyday 3D printing.')
        expect(metadata.alternates.canonical).toBe('https://www.fixitoday.com/products/lanbo-pla-filament')
        expect(metadata.openGraph.url).toBe(metadata.alternates.canonical)
        expect(metadata.openGraph.images[0].url).toBe('https://www.fixitoday.com/api/proxy?key=images%2Fblue%20filament.webp')
        expect(metadata.twitter.images[0]).toBe(metadata.openGraph.images[0].url)
    })

    it('does not index missing, hidden or moderated products', () => {
        for (const item of [null, { ...product, hidden: true }, { ...product, flaggedForModeration: true }]) {
            expect(productMetadata(item).robots.index).toBe(false)
            expect(productJsonLd(item)).toBeNull()
            expect(publicProductSeed(item)).toBeNull()
        }
    })

    it('cleans common HTML and Markdown without cutting the snippet mid-word', () => {
        expect(productDescription('# PLA\n- **Strong** &amp; light <b>filament</b> [Details](https://example.com)'))
            .toBe('PLA Strong & light filament Details')
        const snippet = productDescription('Filament for reliable printing. '.repeat(20))
        expect(snippet.length).toBeLessThanOrEqual(160)
        expect(productDescription('Filament for reliable printing.', 25)).toBe('Filament for reliable…')
    })

    it('resolves site-relative images while preserving externally hosted images', () => {
        expect(productImageUrl('/filament.webp')).toBe('https://www.fixitoday.com/filament.webp')
        expect(productImageUrl('https://cdn.example.com/filament.webp')).toBe('https://cdn.example.com/filament.webp')
        expect(productImageUrl(null)).toBeNull()
    })
})

describe('product offer accuracy', () => {
    it('uses the selected variant price and stock when top-level stock is absent', () => {
        const schema = productJsonLd(product)
        expect(schema.offers.price).toBe('25.00')
        expect(schema.offers.availability).toBe('https://schema.org/InStock')
        expect(schema).not.toHaveProperty('brand')
        expect(schema).not.toHaveProperty('aggregateRating')
    })

    it('honours selected variant stock, top-level stock and infinite stock as purchasing does', () => {
        const empty = { ...product, variantTypes: [{ name: 'Colour', options: [{ name: 'Blue', stock: 0 }] }] }
        expect(productJsonLd(empty).offers.availability).toMatch(/OutOfStock$/)
        expect(productJsonLd({ ...product, stock: 0 }).offers.availability).toMatch(/OutOfStock$/)
        expect(productJsonLd({ ...empty, stock: 0, infiniteStock: true }).offers.availability).toMatch(/InStock$/)
        expect(productJsonLd({ ...product, variantTypes: [], stock: 3 }).offers.price).toBe('20.00')
    })

    it('uses active single-item discounts including global events and variant minimums', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-09-12T00:00:00Z'))
        const schema = productJsonLd({
            ...product,
            discounts: [
                { percentage: 10, minimumAmount: 25 },
                { percentage: 40, endDate: '2026-09-01' },
                { tiers: [{ minQty: 3, percentage: 30 }] },
            ],
        }, [{ percentage: 10, startDate: '2026-09-01', endDate: '2026-09-30' }])
        expect(schema.offers.price).toBe('20.00')
    })

    it('does not advertise quote-only print base prices or unknown offer data', () => {
        expect(productJsonLd({ ...product, productType: 'print' })).not.toHaveProperty('offers')
        expect(productJsonLd({ ...product, basePrice: {} })).not.toHaveProperty('offers')
        expect(productJsonLd(product, [], false)).not.toHaveProperty('offers')
    })

    it('uses only actual valid ratings', () => {
        const schema = productJsonLd({ ...product, reviews: [{ rating: 5 }, { rating: 4 }, { rating: 0 }, {}] })
        expect(schema.aggregateRating).toEqual({ '@type': 'AggregateRating', ratingValue: 4.5, reviewCount: 2 })
    })
})

describe('server-rendered product seed', () => {
    it('excludes private sales, customer IDs, paid downloads and delivery notes', () => {
        const seed = publicProductSeed({
            ...product,
            creatorUserId: 'private-creator',
            sales: [{ userId: 'private-buyer' }],
            likes: ['private-liker'],
            paidAssets: ['models/private-paid-file.stl'],
            delivery: { deliveryTypes: [{ type: 'selfCollect', customDescription: 'private-note' }] },
            reviews: [{ _id: 'review1', username: 'Public name', rating: 5, userId: 'private-reviewer', helpful: ['private-voter'] }],
        })
        expect(JSON.stringify(seed)).not.toContain('private-')
        expect(seed.name).toBe(product.name)
        expect(seed.reviews[0].username).toBe('Public name')
        expect(seed.delivery.deliveryTypes).toEqual([{ type: 'selfCollect' }])
    })
})
