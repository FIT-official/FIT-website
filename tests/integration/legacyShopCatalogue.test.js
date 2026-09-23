// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/models/Product', () => ({ default: { find: vi.fn() } }))

import Product from '@/models/Product'
import { getShopProducts } from '@/lib/seo/shop'

const row = (slug, extra = {}) => ({
    _id: slug, slug, name: slug, productType: 'shop', hidden: false,
    flaggedForModeration: false, categoryId: 'Filament', subcategoryId: 'PLA+',
    basePrice: { presentmentAmount: 20, presentmentCurrency: 'SGD' }, ...extra,
})
let products

// Evaluate the query against legacy and current fixtures; returning every mock
// row would conceal the missing-field regression seen in production.
function matches(product, filter) {
    return Object.entries(filter).every(([field, expected]) => {
        if (field === '$or') return expected.some(branch => matches(product, branch))
        if (expected && typeof expected === 'object') {
            if ('$exists' in expected) return Object.hasOwn(product, field) === expected.$exists
            if ('$ne' in expected) return product[field] !== expected.$ne
            if ('$regex' in expected) return new RegExp(expected.$regex, expected.$options).test(product[field] ?? '')
        }
        return product[field] === expected
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    products = [row('legacy'), row('fit', { listing: 'fit' }), row('creator', { listing: 'creator' })]
    Product.find.mockImplementation(filter => ({
        select: () => ({ lean: async () => products.filter(product => matches(product, filter)) }),
    }))
})

describe('legacy FIT shop catalogue', () => {
    it('keeps unlabelled shop products visible alongside FIT products without admitting explicit creator listings', async () => {
        expect((await getShopProducts()).map(product => product.slug)).toEqual(['legacy', 'fit'])
    })

    it('still excludes hidden, moderated and print rows and does not treat invalid listing values as legacy', async () => {
        products.push(row('hidden', { hidden: true }), row('moderated', { flaggedForModeration: true }),
            row('print', { productType: 'print' }), row('null', { listing: null }),
            row('blank', { listing: '' }), row('unknown', { listing: 'other' }))
        expect((await getShopProducts()).map(product => product.slug)).toEqual(['legacy', 'fit'])
    })

    it('applies the same literal category filter to legacy products', async () => {
        products.push(row('petg', { subcategoryId: 'PETG' }), row('near-match', { subcategoryId: 'PLAAA' }))
        expect((await getShopProducts({ productCategory: 'filament', productSubCategory: 'pla+' }))
            .map(product => product.slug)).toEqual(['legacy', 'fit'])
    })
})
