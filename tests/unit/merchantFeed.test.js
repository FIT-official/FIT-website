import { describe, expect, it, vi } from 'vitest'
import { buildMerchantFeed, merchantProduct } from '@/lib/seo/merchantFeed'

const product = {
    _id: 'filament1', slug: 'pla-filament', name: 'PLA & PETG', description: 'A <b>1kg</b> spool.',
    hidden: false, listing: 'fit', productType: 'shop', stock: 4,
    images: ['images/filament.jpg', 'images/detail.jpg'],
    basePrice: { presentmentAmount: 20, presentmentCurrency: 'SGD' },
    variantTypes: [{ name: 'Colour', options: [{ name: 'Blue', additionalFee: 5, stock: 2 }, { name: 'Red', stock: 0 }] }],
    delivery: { deliveryTypes: [{ type: 'normal' }] },
}

describe('Merchant Center catalogue', () => {
    it('matches the default purchasable variant, single-item discounts and stock', () => {
        expect(merchantProduct(product, [{ percentage: 20 }])).toMatchObject({
            id: 'filament1', title: 'PLA & PETG - Blue', price: '20.00 SGD', availability: 'in_stock',
            link: 'https://www.fixitoday.com/products/pla-filament',
        })
        expect(merchantProduct({ ...product, stock: 0 }).availability).toBe('out_of_stock')
        expect(merchantProduct({ ...product, stock: 0, infiniteStock: true }).availability).toBe('in_stock')
    })

    it('excludes non-public, creator, digital, quote-only and incomplete products', () => {
        const overrides = [
            { hidden: true }, { hidden: undefined }, { flaggedForModeration: true }, { listing: 'creator' },
            { productType: 'print' }, { quoteOnly: true }, { slug: 'custom-print-request' },
            { slug: 'admin-product-normal' }, { images: [] }, { description: '' },
            { basePrice: { presentmentAmount: 0, presentmentCurrency: 'SGD' }, variantTypes: [] },
            { basePrice: { presentmentAmount: 20, presentmentCurrency: 'USD' } },
            { delivery: { deliveryTypes: [{ type: 'digital' }, { type: 'normal' }] } },
            { delivery: {} }, { stock: undefined, variantTypes: [] },
        ]
        for (const override of overrides) expect(merchantProduct({ ...product, ...override })).toBeNull()
        expect(merchantProduct({ ...product, listing: undefined })).not.toBeNull()
    })

    it('produces valid escaped XML with only public product attributes', () => {
        const output = buildMerchantFeed([{ ...product, creatorUserId: 'private-owner', paidAssets: ['private-file'] }])
        const document = new DOMParser().parseFromString(output, 'application/xml')
        expect(document.querySelector('parsererror')).toBeNull()
        expect(document.querySelectorAll('item')).toHaveLength(1)
        expect(output).toContain('PLA &amp; PETG')
        expect(output).not.toContain('private-')
        expect(output).not.toMatch(/g:(gtin|mpn|brand|identifier_exists)/)
    })
})

vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/models/Product', () => ({ default: { find: vi.fn() } }))
vi.mock('@/models/Event', () => ({ default: { find: vi.fn() } }))
import Product from '@/models/Product'
import Event from '@/models/Event'
import { GET } from '@/app/google-shopping.xml/route'

it('serves current prices and fails closed when promotions cannot be read', async () => {
    Product.find.mockReturnValue({ select: vi.fn(() => ({ lean: vi.fn().mockResolvedValue([product]) })) })
    Event.find.mockReturnValue({ select: vi.fn(() => ({ lean: vi.fn().mockResolvedValue([{ percentage: 10 }]) })) })
    const ok = await GET()
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toContain('application/xml')
    expect(await ok.text()).toContain('<g:price>22.50 SGD</g:price>')
    Event.find.mockReturnValue({ select: vi.fn(() => ({ lean: vi.fn().mockRejectedValue(new Error('offline')) })) })
    const failed = await GET()
    expect(failed.status).toBe(503)
    expect(failed.headers.get('cache-control')).toBe('no-store')
    expect(await failed.text()).not.toContain('<rss')
})
