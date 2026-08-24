import { describe, it, expect } from 'vitest'
import { densityFor, MATERIAL_DENSITIES, DEFAULT_DENSITY } from '@/lib/quoting/pricingDefaults'

describe('densityFor', () => {
  it('returns the configured density for a recognized material', () => {
    expect(densityFor('petg')).toBe(MATERIAL_DENSITIES.petg)
    expect(densityFor('PLA')).toBe(MATERIAL_DENSITIES.pla) // case-insensitive
  })

  it('defaults to PLA density when no material is specified at all (legitimate unset state)', () => {
    expect(densityFor(undefined)).toBe(DEFAULT_DENSITY)
    expect(densityFor(null)).toBe(DEFAULT_DENSITY)
    expect(densityFor('')).toBe(DEFAULT_DENSITY)
  })

  it('throws for a non-empty but unrecognized material instead of silently substituting PLA', () => {
    // Defense-in-depth: quoteRequest.js already rejects an unrecognized
    // materialType with a 400 before this is ever reached, but densityFor
    // itself must not silently mis-price a typo'd/crafted value for any
    // OTHER caller that doesn't route through buildQuote's validation.
    expect(() => densityFor('metl')).toThrow(/Unknown material/)
    expect(() => densityFor('Unobtainium')).toThrow(/Unknown material/)
  })

  it('accepts a custom densities map override', () => {
    const custom = { titanium: 4.5 }
    expect(densityFor('titanium', custom)).toBe(4.5)
    expect(() => densityFor('pla', custom)).toThrow(/Unknown material/)
  })
})
