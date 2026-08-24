import { describe, it, expect } from 'vitest'
import { resolveDeliveryFee } from '@/lib/quoting/deliveryTypeResolver'

describe('resolveDeliveryFee', () => {
  it('resolves a flat-fee (Product-embedded) delivery type', () => {
    const types = [{ type: 'standard', price: 5 }, { type: 'express', customPrice: 12 }]
    expect(resolveDeliveryFee(types, 'standard', { key: 'type' })).toEqual({
      ok: true,
      fee: 5,
      type: types[0],
    })
  })

  it('prefers customPrice over price for flat-fee types', () => {
    const types = [{ type: 'express', price: 8, customPrice: 12 }]
    const result = resolveDeliveryFee(types, 'express', { key: 'type' })
    expect(result.ok).toBe(true)
    expect(result.fee).toBe(12)
  })

  it('rejects an unmatched delivery type instead of defaulting to a fee', () => {
    const types = [{ type: 'standard', price: 5 }]
    const result = resolveDeliveryFee(types, 'nonexistent', { key: 'type' })
    expect(result).toEqual({ ok: false, reason: 'delivery_type_not_found' })
  })

  it('treats no chosen value as a valid "no delivery selected" state', () => {
    const types = [{ type: 'standard', price: 5 }]
    expect(resolveDeliveryFee(types, '', { key: 'type' })).toEqual({ ok: true, fee: 0, type: null })
    expect(resolveDeliveryFee(types, undefined, { key: 'type' })).toEqual({ ok: true, fee: 0, type: null })
  })

  it('rejects an unmatched name-keyed (AppSettings) delivery type', () => {
    const types = [{ name: 'ground', pricingTiers: [{ minVolume: 0, maxVolume: 100, minWeight: 0, maxWeight: 100, price: 3 }] }]
    const result = resolveDeliveryFee(types, 'air', { key: 'name' })
    expect(result).toEqual({ ok: false, reason: 'delivery_type_not_found' })
  })

  it('confirms a tiered type exists without computing a fee when dimensions/weight are unknown', () => {
    const tiered = { name: 'ground', pricingTiers: [{ minVolume: 0, maxVolume: 100, minWeight: 0, maxWeight: 100, price: 3 }] }
    const result = resolveDeliveryFee([tiered], 'ground', { key: 'name' })
    expect(result).toEqual({ ok: true, fee: null, type: tiered })
  })

  it('computes a tiered fee once dimensions/weight are provided', () => {
    const tiered = { name: 'ground', pricingTiers: [{ minVolume: 0, maxVolume: 100, minWeight: 0, maxWeight: 100, price: 3 }] }
    const result = resolveDeliveryFee([tiered], 'ground', {
      key: 'name',
      dimensionsCm: { length: 1, width: 1, height: 1 },
      weightGrams: 10,
    })
    expect(result).toEqual({ ok: true, fee: 3, type: tiered })
  })

  it('resolves fee to 0 when a matched tiered type has no applicable tier', () => {
    const tiered = { name: 'ground', pricingTiers: [{ minVolume: 0, maxVolume: 5, minWeight: 0, maxWeight: 5, price: 3 }] }
    const result = resolveDeliveryFee([tiered], 'ground', {
      key: 'name',
      dimensionsCm: { length: 100, width: 100, height: 100 },
      weightGrams: 9999,
    })
    expect(result).toEqual({ ok: true, fee: 0, type: tiered })
  })
})
