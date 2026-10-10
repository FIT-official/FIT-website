import { describe, expect, it, vi } from 'vitest'
import { buildMerchantFeed, merchantProduct } from '@/lib/seo/merchantFeed'

const product = {
    _id: 'filament1', slug: 'pla-filament', name: 'PLA & PETG', description: 'A <b>1kg</b> spool.',
    hidden: false, listing: 'fit', productType: 'shop', stock: 4,
    images: ['images/filament.jpg', 'images/detail.jpg'],
    basePrice: { presentmentAmount: 20, presentmentCurrency: 'SGD' },
    variantTypes: [{ name: 'Colour', options: [{ name: 'Blue', additionalFee: 5, stock: 2 }, { name: 'Red', stock: 0 }] }],
    delivery: { deliveryTypes: [{ type: 'standard-shipping', price: 6.2 }] },
}

describe('Merchant Center catalogue', () => {
    it.each([[205, 200, '6.20 SGD'], [205.01, 200.01, '6.20 SGD']])('preserves paid shipping after discounts for price %s in XML', (base, price, shipping) => {
        const item = { ...product, slug: 'hcsr04-ultrasonic-sensor', name: 'Sensor', categoryId: 'Electronics', variantTypes: [],
            basePrice: { presentmentAmount: base, presentmentCurrency: 'SGD' }, discounts: [{ percentage: 5 / base * 100 }] };
        expect(merchantProduct(item)).toMatchObject({ price: `${price.toFixed(2)} SGD`, shipping: { price: shipping } });
        const output = buildMerchantFeed([item]);
        const document = new DOMParser().parseFromString(output, 'application/xml');
        expect(document.querySelector('parsererror')).toBeNull();
        expect(document.getElementsByTagName('g:shipping')[0].getElementsByTagName('g:price')[0].textContent).toBe(shipping);
        expect(output).not.toMatch(/S\$20(?!\d)/);
    });
    it('matches the default variant and blocks unapproved filament event discounts', () => {
        expect(merchantProduct(product, [{ percentage: 20 }])).toMatchObject({
            id: 'filament1', title: 'PLA & PETG - Blue', price: '25.00 SGD', availability: 'in_stock',
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
            { delivery: { deliveryTypes: [{ type: 'digital' }, { type: 'standard-shipping', price: 6.2 }] } },
            { delivery: { deliveryTypes: [{ type: 'pick-up', price: 0 }] } },
            { delivery: { deliveryTypes: [{ type: 'standard-shipping' }] } },
            { delivery: {} }, { stock: undefined, variantTypes: [] },
        ]
        for (const override of overrides) expect(merchantProduct({ ...product, ...override })).toBeNull()
        expect(merchantProduct({ ...product, listing: undefined })).not.toBeNull()
    })

    it('uses weight tiers ahead of configured Standard prices and keeps the delivery estimate', () => {
        expect(merchantProduct(product).shipping).toEqual({
            country: 'SG', service: 'Standard delivery', price: '6.20 SGD',
            min_handling_time: 2, max_handling_time: 2, min_transit_time: 3, max_transit_time: 3,
        })
        expect(merchantProduct({ ...product, delivery: { deliveryTypes: [
            { type: 'standard-shipping', price: 6.2, customPrice: 2 },
        ] } }).shipping.price).toBe('6.20 SGD')
        expect(merchantProduct({ ...product, delivery: { deliveryTypes: [
            { type: 'standard-shipping', price: 0 },
        ] } }).shipping.price).toBe('6.20 SGD')
    })

    it('advertises the same letterbox and bulky tiers as checkout, with database measurements taking precedence', () => {
        const sensor = { ...product, slug: 'hcsr04-ultrasonic-sensor', name: 'Sensor', variantTypes: [],
            basePrice: { presentmentAmount: 1.65, presentmentCurrency: 'SGD' } }
        expect(merchantProduct(sensor).shipping.price).toBe('2.00 SGD')
        expect(merchantProduct({ ...sensor, shippingWeightG: 1951 }).shipping.price).toBe('6.20 SGD')
        expect(merchantProduct({ ...sensor, shippingDims: { L: 700, W: 400, H: 300 } }).shipping.price).toBe('12.30 SGD')
    })

    it('excludes blocked parcels from the feed without affecting other products', () => {
        const blocked = { ...product, shippingWeightG: 31000 }
        expect(merchantProduct(blocked)).toBeNull()
        expect(buildMerchantFeed([blocked, { ...product, _id: 'available' }])).toContain('<g:id>available</g:id>')
        expect(buildMerchantFeed([blocked])).not.toContain('<item>')
    })

    it('uses the Bambu v2 parcel and excludes services even with a configured Standard option', () => {
        const spool = { ...product, slug: 'bambu-lab-3d-printing-filament-1kg-pla-basic', variantTypes: [],
            basePrice: { presentmentAmount: 21.9, presentmentCurrency: 'SGD' } }
        expect(merchantProduct(spool).shipping.price).toBe('6.20 SGD')
        expect(merchantProduct({ ...product, slug: '3d-printer-repair-maintenance' })).toBeNull()
        expect(merchantProduct({ ...product, categoryId: 'SERVICE' })).toBeNull()
    })

    it('charges the table rate for a S$25 item regardless of private costs', () => {
        const stocked = { ...product, shippingCosts: { unitCost: 1, packingCost: 1, deliveryCost: 6.2, confirmed: true } }
        expect(merchantProduct(stocked).shipping.price).toBe('6.20 SGD')
        // Unapproved filament promotions cannot change the order value.
        expect(merchantProduct(stocked, [{ percentage: 20 }]).shipping.price).toBe('6.20 SGD')
        // Existing global promotions still affect unrelated shop products.
        expect(merchantProduct({ ...stocked, slug: 'sensor', name: 'Sensor', categoryId: 'Electronics' }, [{ percentage: 20 }]).shipping.price).toBe('6.20 SGD')
        expect(buildMerchantFeed([stocked])).not.toMatch(/shippingCosts|unitCost|packingCost|confirmed/)
    })

    it('produces valid escaped XML with only public product attributes', () => {
        const output = buildMerchantFeed([{ ...product, creatorUserId: 'private-owner', paidAssets: ['private-file'] }])
        const document = new DOMParser().parseFromString(output, 'application/xml')
        expect(document.querySelector('parsererror')).toBeNull()
        expect(document.querySelectorAll('item')).toHaveLength(1)
        expect(output).toContain('PLA &amp; PETG')
        expect(output).toContain('<g:shipping_handling_business_days>Mon-Fri</g:shipping_handling_business_days>')
        expect(output).toContain('<g:shipping_transit_business_days>Mon-Fri</g:shipping_transit_business_days>')
        expect(output).toContain('<g:cutoff_time>1200</g:cutoff_time><g:cutoff_timezone>Asia/Singapore</g:cutoff_timezone>')
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
    expect(await ok.text()).toContain('<g:price>25.00 SGD</g:price>')
    Event.find.mockReturnValue({ select: vi.fn(() => ({ lean: vi.fn().mockRejectedValue(new Error('offline')) })) })
    const failed = await GET()
    expect(failed.status).toBe(503)
    expect(failed.headers.get('cache-control')).toBe('no-store')
    expect(await failed.text()).not.toContain('<rss')
})
