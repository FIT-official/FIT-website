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
    it('keeps an enquiry product searchable without advertising an unconfirmed offer', () => {
        const item = { ...product, quoteOnly: true };
        expect(productMetadata(item).alternates.canonical).toContain(product.slug);
        expect(productJsonLd(item).offers).toBeUndefined();
        expect(publicProductSeed(item).quoteOnly).toBe(true);
    });
    it('preserves dimension separators and part identifiers in search previews', () => {
        const item = { ...product, name: 'Copper Stripboard 6.5*14.5CM DEV_A', description: '**Board** 6.5*14.5 cm, 2.54 mm pitch.' }
        const metadata = productMetadata(item)
        expect(metadata.title).toBe('Copper Stripboard 6.5*14.5CM DEV_A | Fix It Today®')
        expect(metadata.description).toBe('Board 6.5 × 14.5 cm, 2.54 mm pitch.')
        expect(metadata.openGraph.title).toBe(metadata.title)
        expect(metadata.twitter.title).toBe(metadata.title)
        expect(productJsonLd(item).description).toBe(metadata.description)
    })

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
        expect(productImageUrl('/placeholder.jpg')).toBe('https://www.fixitoday.com/product-images/photo-pending.svg')
    })

    it('creates individual metadata for both catalogue types with a safe social fallback', () => {
        for (const productType of ['shop', 'print']) {
            const item = { ...product, productType, slug: `${productType}-model`, images: [], description: '' }
            const metadata = productMetadata(item)
            expect(metadata.title).toContain(product.name)
            expect(metadata.description).toContain(product.name)
            expect(metadata.alternates.canonical).toBe(`https://www.fixitoday.com/products/${productType}-model`)
            expect(metadata.openGraph.url).toBe(metadata.alternates.canonical)
            expect(metadata.twitter.images).toEqual(['https://www.fixitoday.com/product-images/photo-pending.svg'])
        }
        expect(productDescription('Maker&#39;s holder &#x2014; 20 mm')).toBe('Maker\'s holder — 20 mm')
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

    it('uses approved Lanbo product discounts and variant minimums without global events', () => {
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
        expect(schema.offers.price).toBe('22.50')
    })

    it('does not advertise quote-only print base prices or unknown offer data', () => {
        expect(productJsonLd({ ...product, productType: 'print' })).not.toHaveProperty('offers')
        expect(productJsonLd({ ...product, basePrice: {} })).not.toHaveProperty('offers')
        expect(productJsonLd(product, [], false)).not.toHaveProperty('offers')
    })

    it('omits availability when there is no stock evidence instead of assuming stock', () => {
        const unknownStock = { ...product, variantTypes: [], stock: undefined, infiniteStock: false }
        expect(productJsonLd(unknownStock).offers).toMatchObject({ price: '20.00', priceCurrency: 'SGD' })
        expect(productJsonLd(unknownStock).offers).not.toHaveProperty('availability')
        expect(productJsonLd({ ...unknownStock, stock: NaN }).offers).not.toHaveProperty('availability')
        expect(productJsonLd({ ...unknownStock, infiniteStock: true }).offers.availability).toMatch(/InStock$/)
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
