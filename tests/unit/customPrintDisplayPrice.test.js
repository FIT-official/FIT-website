import { describe, it, expect } from 'vitest'
import {
  customPrintDisplayPrice,
  customPrintChargeBreakdown,
} from '@/lib/customPrintDisplayPrice'

describe('customPrintDisplayPrice', () => {
  it('uses quote.total for instant-quoted requests', () => {
    const r = { quoteMode: 'instant', quote: { total: 12.45 }, basePrice: 5, printFee: 3 }
    expect(customPrintDisplayPrice(r)).toEqual({
      amount: 12.45,
      label: 'Instant Quote',
      source: 'instant',
    })
  })

  it('falls back to basePrice + printFee for manual quotes', () => {
    const r = { quoteMode: 'manual', basePrice: 5, printFee: 7 }
    expect(customPrintDisplayPrice(r)).toEqual({
      amount: 12,
      label: 'Quoted',
      source: 'manual',
    })
  })

  it('treats a missing quoteMode (legacy) as manual', () => {
    const r = { basePrice: 4, printFee: 6 }
    expect(customPrintDisplayPrice(r)).toEqual({
      amount: 10,
      label: 'Quoted',
      source: 'manual',
    })
  })

  it('falls back to manual when an instant request has no finite total', () => {
    const r = { quoteMode: 'instant', quote: { total: NaN }, basePrice: 5, printFee: 2 }
    expect(customPrintDisplayPrice(r)).toEqual({
      amount: 7,
      label: 'Quoted',
      source: 'manual',
    })
  })

  it('returns 0 when both prices are missing', () => {
    expect(customPrintDisplayPrice({})).toEqual({
      amount: 0,
      label: 'Quoted',
      source: 'manual',
    })
    expect(customPrintDisplayPrice(null)).toEqual({
      amount: 0,
      label: 'Quoted',
      source: 'manual',
    })
  })
})

describe('customPrintChargeBreakdown', () => {
  const delivery = {
    deliveryTypes: [
      { type: 'pickup', price: 0 },
      { type: 'courier', price: 8, customPrice: 6.5 },
    ],
  }

  it('charges quote.total for instant-quoted requests (not basePrice + printFee)', () => {
    const r = {
      quoteMode: 'instant',
      quote: { total: 42.75 },
      basePrice: 5,
      printFee: 0,
      delivery,
      currency: 'sgd',
    }
    const b = customPrintChargeBreakdown(r, 'courier')
    expect(b.amount).toBe(42.75)
    expect(b.source).toBe('instant')
    expect(b.chosenDeliveryType).toBe('courier')
    expect(b.deliveryFee).toBe(6.5) // customPrice wins over price
    expect(b.total).toBe(49.25)
    expect(b.currency).toBe('SGD')
  })

  it('charges basePrice + printFee for manual/legacy quotes', () => {
    const r = { basePrice: 10, printFee: 15, delivery }
    const b = customPrintChargeBreakdown(r, 'pickup')
    expect(b.amount).toBe(25)
    expect(b.source).toBe('manual')
    expect(b.chosenDeliveryType).toBe('pickup')
    expect(b.deliveryFee).toBe(0)
    expect(b.total).toBe(25)
  })

  it('rejects an explicitly requested delivery type that is unknown, instead of silently substituting the first one', () => {
    const r = { basePrice: 10, printFee: 0, delivery }
    expect(() => customPrintChargeBreakdown(r, 'teleport')).toThrow(/Unknown delivery type/)
  })

  it('rejects an explicitly requested delivery type when the request has no delivery types configured', () => {
    expect(() =>
      customPrintChargeBreakdown({ basePrice: 10, printFee: 2 }, 'courier'),
    ).toThrow(/Unknown delivery type/)
  })

  it('defaults to no delivery type (not a rejection) when none was requested and none is configured', () => {
    const b = customPrintChargeBreakdown({ basePrice: 10, printFee: 2 }, '')
    expect(b.chosenDeliveryType).toBe('')
    expect(b.deliveryFee).toBe(0)
    expect(b.total).toBe(12)
    expect(b.currency).toBe('SGD')
  })
})
