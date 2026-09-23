import { describe, it, expect } from 'vitest'
import { applySimpleSelection, mapPurposeToConfiguration, restorePrintConfiguration,
  DEFAULT_EDITOR_PRINT_SETTINGS, coloursForMaterial } from '@/lib/quoting/genericPresets'
import { printSettingsToQuoteSettings } from '@/lib/quoting/printSettingsToQuote'
import { calculateInstantQuote } from '@/lib/quoting/quote'
import { validatePrintConfiguration } from '@/lib/quoting/validatePrintConfiguration'

describe('purpose settings and saved configurations', () => {
  it('uses balanced print settings when the optional purpose is skipped', () => {
    const skipped = mapPurposeToConfiguration()
    expect(skipped.purpose).toBe('')
    expect(skipped.printSettings).toEqual(mapPurposeToConfiguration({ purpose: 'Normal' }).printSettings)
  })
  it.each(['Normal', 'Strong', 'Appearance'])('restores the %s preset from the actual saved settings', purpose => {
    const mapped = mapPurposeToConfiguration({ purpose, colour: 'Blue' })
    const validated = validatePrintConfiguration({ ...mapped, meshColors: { Model: '#2356c7' } })
    const restored = restorePrintConfiguration(JSON.parse(JSON.stringify(validated)))
    expect(restored.selection).toEqual({ purpose, colour: 'Blue', material: 'plastic', filament: 'pla' })
    expect(restored.printSettings).toEqual(mapped.printSettings)
    expect(restored.meshColors.Model).toBe('#2356c7')
  })
  it('changes server quote parameters and price for stronger and finer settings', () => {
    const quotes = Object.fromEntries(['Normal', 'Strong', 'Appearance'].map(purpose => [purpose,
      calculateInstantQuote({ metrics: { volumeCm3: 100, dimensionsCm: { length: 5, width: 5, height: 5 }, confidence: 'high' },
        settings: printSettingsToQuoteSettings(mapPurposeToConfiguration({ purpose }).printSettings),
        pricingOverrides: { minimumPrice: 0 } })]))
    expect(quotes.Strong.total).toBeGreaterThan(quotes.Normal.total)
    expect(quotes.Appearance.total).toBeGreaterThan(quotes.Normal.total)
  })
  it('retains detailed settings on a colour change and restores their exact values', () => {
    const current = restorePrintConfiguration({ printSettings: { ...DEFAULT_EDITOR_PRINT_SETTINGS,
      wallLoops: 3, sparseInfillDensity: 31, enableSupport: true, supportType: 'Tree' } })
    const changed = applySimpleSelection(current, { ...current.selection, colour: 'White' }, 'colour', ['Model'])
    expect(changed.printSettings).toEqual(current.printSettings)
    expect(changed.meshColors).toEqual({ Model: '#ffffff' })
    const restored = restorePrintConfiguration(validatePrintConfiguration(changed))
    expect(restored.printSettings).toEqual(changed.printSettings)
    expect(restored.customSettings).toBe(true)
    expect(restored.selection.purpose).toBe('')
  })
  it('replaces custom details only when a purpose is explicitly selected', () => {
    const current = restorePrintConfiguration({ printSettings: { enableSupport: true } })
    const changed = applySimpleSelection(current, { ...current.selection, purpose: 'Strong' }, 'purpose')
    expect(changed.printSettings.wallLoops).toBe(4)
    expect(changed.printSettings.sparseInfillDensity).toBe(40)
    expect(changed.printSettings.enableSupport).toBe(false)
  })
  it('does not offer legacy material colours as plastic', () => {
    expect(coloursForMaterial().some(colour => colour.material === 'wood')).toBe(false)
  })
})

describe('configuration validation', () => {
  it.each([
    { layerHeight: -1 }, { layerHeight: 4 }, { wallLoops: 2.5 },
    { sparseInfillDensity: 101 }, { enableSupport: 'yes' }, { nozzleDiameter: 5 },
    { supportType: 'magic' }, { materialType: 'wood' },
    { nozzleDiameter: 0.2, layerHeight: 0.3 },
  ])('rejects invalid print settings %j', changed => {
    expect(() => validatePrintConfiguration({ printSettings: { ...DEFAULT_EDITOR_PRINT_SETTINGS, ...changed } })).toThrow()
  })
  it('rejects mismatched human labels instead of saving misleading settings', () => {
    expect(() => validatePrintConfiguration({ printSettings: DEFAULT_EDITOR_PRINT_SETTINGS,
      generic: { strength: 'Strong', quality: 'Medium', material: 'plastic' } })).toThrow(/does not match/)
  })
  it('accepts creator material preferences without fabricating print parameters', () => {
    const result = validatePrintConfiguration({ generic: { material: 'PETG', colour: 'Blue' } }, { creator: true, partial: true })
    expect(result.generic.material).toBe('PETG')
    expect(result.printSettings).toBeUndefined()
  })
  it('strips client-owned status/quote/configuration metadata and rejects unsafe colours', () => {
    const result = validatePrintConfiguration({ printSettings: DEFAULT_EDITOR_PRINT_SETTINGS,
      configuredAt: '2000', isConfigured: false, quote: { total: 0 } })
    expect(result).not.toHaveProperty('configuredAt')
    expect(result).not.toHaveProperty('quote')
    expect(() => validatePrintConfiguration({ printSettings: DEFAULT_EDITOR_PRINT_SETTINGS, meshColors: { Model: 'red' } })).toThrow()
  })
})
