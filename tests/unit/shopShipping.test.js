import { describe, expect, it } from 'vitest'
import { applyShopShipping, paidShopDeliveryFee, shippingCostsInput } from '@/lib/shopShipping'
import Product from '@/models/Product'

const address = { country: 'SG' }
function line(price = 30, overrides = {}) {
    return { product: { productType: 'shop', listing: 'fit', shippingCosts: {
        unitCost: 14, packingCost: 1, deliveryCost: 6.3, confirmed: true,
    } }, breakdown: { price, quantity: 1, deliveryFee: 6.2, chosenDeliveryType: 'standard-shipping', currency: 'SGD', ...overrides } }
}

describe('paid shop delivery', () => {
    it.each([19.99, 20, 20.01, 25, 30, 200])('does not waive delivery at order value %s, even with confirmed zero costs', price => {
        const item = line(price, { freeDeliveryApplied: true })
        item.product.shippingCosts = { unitCost: 0, packingCost: 0, deliveryCost: 0, confirmed: true }
        expect(applyShopShipping([item], address)).toBe(false)
        expect(item.breakdown).toMatchObject({ deliveryFee: 6.2, total: price + 6.2, freeDeliveryApplied: false })
    })
    it.each([2, 6.2, 30])('preserves a positive configured Express rate of %s', deliveryFee => {
        const item = line(100, { quantity: 3, deliveryFee, chosenDeliveryType: 'express-courier' })
        expect(applyShopShipping([item], address)).toBe(false)
        expect(item.breakdown).toMatchObject({ deliveryFee, total: 300 + deliveryFee })
    })
    it('charges Standard once for combined and split lines', () => {
        const combined = line(15, { quantity: 2 })
        const split = [line(15), line(15)]
        applyShopShipping([combined], address)
        applyShopShipping(split, address)
        expect(combined.breakdown.total).toBe(36.2)
        expect(split.map(item => item.breakdown.total)).toEqual([21.2, 15])
    })
    it('retains the existing zero-rate fallback regardless of private costs or country', () => {
        for (const costs of [undefined, {}, { confirmed: true }, { unitCost: 0, packingCost: 0, deliveryCost: 0, confirmed: true }]) {
            for (const country of [undefined, 'SG', 'Singapore', 'MY']) {
                const item = line(100, { deliveryFee: 0 })
                item.product.shippingCosts = costs
                expect(applyShopShipping([item], { country })).toBe(false)
                expect(item.breakdown.deliveryFee).toBe(6.2)
            }
        }
    })
    it('preserves collection, digital, creator and custom work charges', () => {
        for (const chosenDeliveryType of ['selfCollect', 'pick-up', 'digital']) {
            const item = line(100, { deliveryFee: 0, chosenDeliveryType })
            applyShopShipping([item], address)
            expect(item.breakdown.deliveryFee).toBe(0)
        }
        const creator = line(100, { deliveryFee: 0 })
        creator.product.listing = 'creator'
        const custom = { ...line(100, { deliveryFee: 0 }), customRequest: true }
        applyShopShipping([creator, custom], address)
        expect([creator, custom].map(item => item.breakdown.deliveryFee)).toEqual([0, 0])
        expect(paidShopDeliveryFee(creator.product, 'standard-shipping', 0)).toBe(0)
    })
    it('validates private admin costs and excludes them from normal database reads', () => {
        expect(Product.schema.path('shippingCosts').options.select).toBe(false)
        expect(shippingCostsInput({ unitCost: '', packingCost: null })).toEqual({ confirmed: false, unitCost: null, packingCost: null, deliveryCost: null })
        expect(() => shippingCostsInput({ confirmed: true })).toThrow(/Complete all/)
        expect(() => shippingCostsInput({ unitCost: -1 })).toThrow(/valid/)
        expect(() => shippingCostsInput({ unitCost: Infinity })).toThrow(/valid/)
    })
})
