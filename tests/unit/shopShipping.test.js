import { describe, expect, it } from 'vitest'
import { applyShopShipping, paidShopDeliveryFee, shippingCostsInput } from '@/lib/shopShipping'
import Product from '@/models/Product'

const address = { country: 'SG' }
function line(price = 30, overrides = {}) {
    return { product: { productType: 'shop', listing: 'fit', shippingCosts: {
        unitCost: 14, packingCost: 1, deliveryCost: 6.3, confirmed: true,
    } }, breakdown: { price, quantity: 1, deliveryFee: 6.2, chosenDeliveryType: 'standard-shipping', currency: 'SGD', ...overrides } }
}

describe('free delivery profitability', () => {
    it('requires more than S$20 after discounts even with ample margin', () => {
        for (const price of [19.99, 20, 20.01]) {
            const item = line(price)
            item.product.shippingCosts = { unitCost: 1, packingCost: 1, deliveryCost: 2, confirmed: true }
            expect(applyShopShipping([item], address)).toBe(price > 20)
            expect(item.breakdown.deliveryFee).toBe(price > 20 ? 0 : 6.2)
        }
    })
    it('accepts exactly S$6 remaining and rejects one cent less', () => {
        const enough = line()
        expect(applyShopShipping([enough], address)).toBe(true)
        expect(enough.breakdown).toMatchObject({ deliveryFee: 0, total: 30, freeDeliveryApplied: true })
        const short = line()
        short.product.shippingCosts.unitCost = 14.01
        expect(applyShopShipping([short], address)).toBe(false)
    })
    it('checks the complete basket and all quantities, including split lines', () => {
        const combined = line(15, { quantity: 2 })
        combined.product.shippingCosts = { unitCost: 2, packingCost: 1, deliveryCost: 3, confirmed: true }
        const split = [structuredClone(combined), structuredClone(combined)]
        split.forEach(item => { item.breakdown.quantity = 1 })
        expect(applyShopShipping([combined], address)).toBe(true)
        expect(applyShopShipping(split, address)).toBe(true)
        combined.product.shippingCosts.deliveryCost = 10
        expect(applyShopShipping([combined], address)).toBe(false)
        expect(combined.breakdown.deliveryFee).toBe(6.2)
    })
    it('never treats missing, unconfirmed or invalid costs as zero', () => {
        for (const costs of [undefined, {}, { confirmed: true },
            { unitCost: null, packingCost: 0, deliveryCost: 0, confirmed: true },
            { unitCost: 0, packingCost: 0, deliveryCost: 0, confirmed: false },
            { unitCost: -1, packingCost: 0, deliveryCost: 0, confirmed: true },
            { unitCost: '0', packingCost: 0, deliveryCost: 0, confirmed: true }]) {
            const item = line(100, { deliveryFee: 0 })
            item.product.shippingCosts = costs
            expect(applyShopShipping([item], address)).toBe(false)
            expect(item.breakdown.deliveryFee).toBe(6.2)
        }
        const basket = [line(), line()]
        delete basket[1].product.shippingCosts
        expect(applyShopShipping(basket, address)).toBe(false)
    })
    it('keeps collection, creator, custom work and non-Singapore orders separate', () => {
        const product = line().product
        expect(paidShopDeliveryFee(product, 'selfCollect', 0)).toBe(0)
        expect(paidShopDeliveryFee(product, 'digital', 0)).toBe(0)
        expect(paidShopDeliveryFee({ ...product, listing: 'creator' }, 'standard-shipping', 0)).toBe(0)
        expect(paidShopDeliveryFee(product, 'standard-shipping', 2)).toBe(2)
        expect(applyShopShipping([line()], null)).toBe(false)
        expect(applyShopShipping([line()], { country: 'MY' })).toBe(false)
        expect(applyShopShipping([line()], { country: 'Singapore' })).toBe(true)
        expect(applyShopShipping([line(), line(50, { chosenDeliveryType: 'express' })], address)).toBe(false)
        const custom = { ...line(), customRequest: true }
        custom.breakdown.deliveryFee = 0
        expect(applyShopShipping([custom], address)).toBe(false)
        expect(custom.breakdown.deliveryFee).toBe(0)
    })
    it('validates private admin costs and excludes them from normal database reads', () => {
        expect(Product.schema.path('shippingCosts').options.select).toBe(false)
        expect(shippingCostsInput({ unitCost: '', packingCost: null })).toEqual({ confirmed: false, unitCost: null, packingCost: null, deliveryCost: null })
        expect(() => shippingCostsInput({ confirmed: true })).toThrow(/Complete all/)
        expect(() => shippingCostsInput({ unitCost: -1 })).toThrow(/valid/)
        expect(() => shippingCostsInput({ unitCost: Infinity })).toThrow(/valid/)
    })
})
