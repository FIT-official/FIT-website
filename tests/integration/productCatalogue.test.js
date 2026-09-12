// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/models/Product', () => ({ default: { find: vi.fn(), findOne: vi.fn() } }))
vi.mock('@/models/User', () => ({ default: { findOne: vi.fn() } }))
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(), clerkClient: vi.fn() }))
vi.mock('@/lib/categoriesHelper', () => ({
    getAllCategoriesServer: vi.fn(),
    getAllSubcategoriesServer: vi.fn(),
}))
vi.mock('@/lib/s3', () => ({ s3: { send: vi.fn() } }))

import Product from '@/models/Product'
import { GET } from '@/app/api/product/route'
import { literalCategoryFilter } from '@/lib/productCatalogue'

const catalogue = [
    { _id: '000000000000000000000001', productType: 'shop', categoryId: 'Filament', subcategoryId: 'PLA+', hidden: false, flaggedForModeration: false },
    { _id: '000000000000000000000002', productType: 'shop', categoryId: 'Filament', subcategoryId: 'PETG', hidden: true },
    { _id: '000000000000000000000003', productType: 'shop', categoryId: 'Filament', subcategoryId: 'PETG', hidden: false, flaggedForModeration: true },
    { _id: '000000000000000000000004', productType: 'shop', categoryId: 'Filament accessories', subcategoryId: 'PLA', hidden: false },
    { _id: '000000000000000000000005', productType: 'print', categoryId: 'Models', hidden: false },
]

function matches(product, filter) {
    return Object.entries(filter).every(([field, expected]) => {
        if (expected && typeof expected === 'object') {
            if ('$regex' in expected) return new RegExp(expected.$regex, expected.$options).test(product[field] ?? '')
            if ('$ne' in expected) return product[field] !== expected.$ne
            if ('$in' in expected) return expected.$in.includes(product[field])
        }
        return product[field] === expected
    })
}

function get(params = {}) {
    return GET({ url: `https://example.com/api/product?${new URLSearchParams(params)}` })
}

beforeEach(() => {
    vi.clearAllMocks()
    Product.find.mockImplementation(filter => {
        const query = {
            select: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            lean: vi.fn(async () => catalogue.filter(product => matches(product, filter))),
        }
        return query
    })
})

describe('GET public product catalogue', () => {
    it('returns public shop products without requiring a category', async () => {
        const response = await get({ productType: 'shop' })
        expect(response.status).toBe(200)
        expect((await response.json()).products.map(product => product._id)).toEqual([
            catalogue[0]._id, catalogue[3]._id,
        ])
    })

    it.each([{}, { productType: 'print' }, { productType: 'other' }])('keeps the guard for an unfiltered non-shop request %j', async params => {
        const response = await get(params)
        expect(response.status).toBe(400)
        expect(Product.find).not.toHaveBeenCalled()
    })

    it('matches category case while excluding longer category names', async () => {
        const response = await get({ productType: 'shop', productCategory: 'filament' })
        expect((await response.json()).products.map(product => product._id)).toEqual([catalogue[0]._id])
    })

    it('matches a literal subcategory with regex punctuation', async () => {
        const response = await get({ productType: 'shop', productSubCategory: 'pla+' })
        expect((await response.json()).products.map(product => product._id)).toEqual([catalogue[0]._id])
    })

    it('does not let a category regex broaden the catalogue', async () => {
        const response = await get({ productType: 'shop', productCategory: '.*' })
        expect((await response.json()).products).toEqual([])
    })

    it('excludes hidden and moderated products even with an includeHidden query flag', async () => {
        const response = await get({ productType: 'shop', productCategory: 'filament', includeHidden: 'true' })
        expect((await response.json()).products.map(product => product._id)).toEqual([catalogue[0]._id])
    })

    it('preserves legacy numeric category and subcategory fields', async () => {
        await get({ productType: 'shop', productCategory: '0', productSubCategory: '2' })
        expect(Product.find).toHaveBeenCalledWith({
            productType: 'shop', category: 0, subcategory: 2,
            hidden: false, flaggedForModeration: { $ne: true },
        })
    })

    it('preserves explicit productId lookup mode', async () => {
        const response = await get({ productId: catalogue[1]._id })
        expect(response.status).toBe(200)
        expect((await response.json()).product._id).toBe(catalogue[1]._id)
        expect(Product.find).toHaveBeenCalledWith({ _id: catalogue[1]._id })
    })
})

describe('literalCategoryFilter', () => {
    it('escapes all regex syntax and trims surrounding whitespace', () => {
        const value = ' PLA+ (1.75mm) [A] $ ^ {x} | \\ ? * '
        const filter = literalCategoryFilter(value)
        const regex = new RegExp(filter.$regex, filter.$options)
        expect(regex.test(value.trim().toLowerCase())).toBe(true)
        expect(regex.test(`prefix ${value.trim()}`)).toBe(false)
        expect(regex.test(`${value.trim()} suffix`)).toBe(false)
    })
})
