import { expect, it } from 'vitest'
import { defaultCartDelivery, cartDeliveryLabel } from '@/lib/cartDelivery'
import { applyShopShipping } from '@/lib/shopShipping'

const product = {
    productType: 'shop', listing: 'fit', delivery: { deliveryTypes: [
        { type: 'express-courier', price: 30 },
        { type: 'standard-shipping', price: 6.2 },
        { type: 'pick-up', price: 0 },
    ] },
}

it('chooses the cheapest delivery regardless of option order and excludes free pickup', () => {
    expect(defaultCartDelivery(product)).toBe('standard-shipping')
    expect(defaultCartDelivery({ ...product, delivery: { deliveryTypes: [...product.delivery.deliveryTypes].reverse() } })).toBe('standard-shipping')
    const cheaperCourier = structuredClone(product)
    cheaperCourier.delivery.deliveryTypes[0].customPrice = 3
    expect(defaultCartDelivery(cheaperCourier)).toBe('express-courier')
    expect(defaultCartDelivery({ delivery: { deliveryTypes: [{ type: 'pick-up', price: 0 }] } })).toBe('pick-up')
    expect(defaultCartDelivery({ delivery: { deliveryTypes: [{ type: 'digital', price: 0 }] } })).toBe('digital')
})

it('preserves explicit courier and pickup choices while options load or reorder', () => {
    for (const chosen of ['express-courier', 'pick-up']) {
        expect(defaultCartDelivery({ delivery: { deliveryTypes: [] } }, chosen)).toBe(chosen)
        expect(defaultCartDelivery(product, chosen)).toBe(chosen)
    }
})

it('uses the existing paid fallback without an order-value waiver', () => {
    const p = structuredClone(product)
    p.delivery.deliveryTypes[0].customPrice = 0
    expect(defaultCartDelivery(p)).toBe('standard-shipping')
    p.shippingCosts = { confirmed: true, unitCost: 1, packingCost: 1, deliveryCost: 2 }
    const breakdown = { chosenDeliveryType: defaultCartDelivery(p), price: 21.9, quantity: 1, currency: 'SGD', deliveryFee: 6.2 }
    expect(applyShopShipping([{ product: p, breakdown }], { country: 'SG' })).toBe(false)
    expect(breakdown.deliveryFee).toBe(6.2)
    expect(breakdown.total).toBeCloseTo(28.1, 2)
})

it('uses configured display names and readable fallbacks', () => {
    expect(cartDeliveryLabel('standard-shipping', { 'standard-shipping': { displayName: 'Local delivery' } })).toBe('Local delivery')
    expect(product.delivery.deliveryTypes.map(o => cartDeliveryLabel(o.type))).toEqual(['Express courier', 'Standard delivery', 'Self pick-up'])
})

it('compares the computed standard tier with other payable options and excludes blocked standard', () => {
    const small = { ...product, slug: 'hcsr04-ultrasonic-sensor', basePrice: { presentmentAmount: 1.65 },
        delivery: { deliveryTypes: [{ type: 'express-courier', price: 3 }, { type: 'standard-shipping', price: 6.2 }, { type: 'pick-up', price: 0 }] } }
    expect(defaultCartDelivery(small)).toBe('standard-shipping')
    small.shippingWeightG = 31000
    expect(defaultCartDelivery(small)).toBe('express-courier')
    small.delivery.deliveryTypes.shift()
    expect(defaultCartDelivery(small)).toBe('pick-up')
})
