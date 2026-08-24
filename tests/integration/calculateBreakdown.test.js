import { describe, it, expect } from 'vitest'
import { calculateCartItemBreakdown } from '@/app/api/checkout/calculateBreakdown'

// Integration: composes variant fees + discount engine + delivery pricing.

describe('calculateCartItemBreakdown', () => {
  it('combines variant fee, tiered discount and delivery into a total', async () => {
    const product = {
      _id: 'p1',
      name: 'Widget',
      creatorUserId: 'c1',
      basePrice: { presentmentAmount: 100, presentmentCurrency: 'SGD' },
      variantTypes: [{ name: 'Size', options: [{ name: 'L', additionalFee: 20 }] }],
      discounts: [{ percentage: 10 }],
      delivery: { deliveryTypes: [{ type: 'standard', price: 5 }] },
    }
    const item = { quantity: 2, selectedVariants: { Size: 'L' }, chosenDeliveryType: 'standard' }

    const result = await calculateCartItemBreakdown({ item, product })

    // priceBeforeDiscount = 100 + 20 = 120; after 10% = 108
    expect(result.basePrice).toBe(100)
    expect(result.priceBeforeDiscount).toBe(120)
    expect(result.price).toBe(108)
    expect(result.variantInfo).toEqual([{ type: 'Size', option: 'L', additionalFee: 20 }])
    expect(result.deliveryFee).toBe(5)
    // total = 108 * 2 + 5
    expect(result.total).toBe(221)
    expect(result.currency).toBe('SGD')
  })

  it('prefers a creator custom delivery price over the default', async () => {
    const product = {
      _id: 'p2',
      name: 'Mug',
      creatorUserId: 'c1',
      basePrice: { presentmentAmount: 50, presentmentCurrency: 'SGD' },
      delivery: { deliveryTypes: [{ type: 'standard', price: 5, customPrice: 8 }] },
    }
    const item = { quantity: 1, chosenDeliveryType: 'standard' }

    const result = await calculateCartItemBreakdown({ item, product })

    expect(result.price).toBe(50)
    expect(result.deliveryFee).toBe(8)
    expect(result.total).toBe(58)
  })

  it('resolves zero delivery for a matched digital delivery type', async () => {
    const product = {
      _id: 'p3',
      name: 'Digital Asset',
      creatorUserId: 'c1',
      basePrice: { presentmentAmount: 50, presentmentCurrency: 'SGD' },
      delivery: { deliveryTypes: [{ type: 'digital', price: 0 }] },
    }
    const item = { quantity: 1, chosenDeliveryType: 'digital' }

    const result = await calculateCartItemBreakdown({ item, product })

    expect(result.deliveryFee).toBe(0)
    expect(result.total).toBe(50)
  })

  it('rejects an unmatched delivery type instead of silently pricing it at 0', async () => {
    const product = {
      _id: 'p3',
      name: 'Digital Asset',
      creatorUserId: 'c1',
      basePrice: { presentmentAmount: 50, presentmentCurrency: 'SGD' },
      delivery: { deliveryTypes: [] },
    }
    const item = { quantity: 1, chosenDeliveryType: 'digital' }

    await expect(calculateCartItemBreakdown({ item, product })).rejects.toThrow(
      /Unknown delivery type/,
    )
  })

  it('throws when a product has no base price', async () => {
    await expect(
      calculateCartItemBreakdown({ item: { quantity: 1 }, product: { _id: 'p4' } }),
    ).rejects.toThrow(/basePrice/)
  })
})
