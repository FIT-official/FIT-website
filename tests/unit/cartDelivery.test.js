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

it('uses the existing paid fallback and lets server eligibility waive standard delivery', () => {
    const p = structuredClone(product)
    p.delivery.deliveryTypes[0].customPrice = 0
    expect(defaultCartDelivery(p)).toBe('standard-shipping')
    p.shippingCosts = { confirmed: true, unitCost: 1, packingCost: 1, deliveryCost: 2 }
    const breakdown = { chosenDeliveryType: defaultCartDelivery(p), price: 21.9, quantity: 1, currency: 'SGD', deliveryFee: 6.2 }
    expect(applyShopShipping([{ product: p, breakdown }], { country: 'SG' })).toBe(true)
    expect(breakdown).toMatchObject({ deliveryFee: 0, total: 21.9 })
})

it('uses configured display names and readable fallbacks', () => {
    expect(cartDeliveryLabel('standard-shipping', { 'standard-shipping': { displayName: 'Local delivery' } })).toBe('Local delivery')
    expect(product.delivery.deliveryTypes.map(o => cartDeliveryLabel(o.type))).toEqual(['Express courier', 'Standard delivery', 'Self pick-up'])
})
