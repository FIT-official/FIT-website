// Pure helpers behind the print request page.
import { describe, it, expect } from 'vitest'
import { buildDeliveryOptions, addressComplete, needsDeliveryAddress, FALLBACK_DELIVERY_OPTION } from '@/lib/customPrint/deliveryOptions'
import { materialOptions, coloursForFilament, colourStockLabel } from '@/lib/customPrint/materials'
import { buildChecklist, buildGeneric, buildPrintSettings, applyStrength, applyQuality, applyAdvanced, strengthFromSettings,
  qualityFromSettings, restoreFromRequest, supportValue } from '@/lib/customPrint/requestState'
import { validatePrintConfiguration } from '@/lib/quoting/validatePrintConfiguration'
import { DEFAULT_EDITOR_PRINT_SETTINGS } from '@/lib/quoting/genericPresets'

describe('delivery options', () => {
  it('names product delivery types from AppSettings, prefers the admin override price and flags courier types', () => {
    const options = buildDeliveryOptions(
      [{ type: 'pickup', price: 0 }, { type: 'courier', price: 4, customPrice: 6 }, { type: '' }],
      [{ name: 'pickup', displayName: 'Collect at Sunview', description: 'Weekdays' }])
    expect(options).toEqual([
      { type: 'pickup', displayName: 'Collect at Sunview', description: 'Weekdays', price: 0, needsAddress: false },
      { type: 'courier', displayName: 'courier', description: '', price: 6, needsAddress: true },
    ])
    expect(buildDeliveryOptions([], [])).toEqual([FALLBACK_DELIVERY_OPTION])
    expect(needsDeliveryAddress({ type: 'self_collection' })).toBe(false)
    expect(needsDeliveryAddress({ type: 'standard', displayName: 'Pick up in store' })).toBe(false)
    expect(needsDeliveryAddress({ type: 'standard', displayName: 'Standard' })).toBe(true)
  })
  it('requires the same fields as the cart, checkout and contact API', () => {
    const address = { street: '1 Sunview Road', city: 'Singapore', state: 'SG', postalCode: '627615', country: 'Singapore' }
    expect(addressComplete(address)).toBe(true)
    expect(addressComplete({ ...address, unitNumber: '' })).toBe(true)
    expect(addressComplete({ ...address, state: '' })).toBe(true)
    expect(addressComplete({ ...address, city: '' })).toBe(false)
    expect(addressComplete({ ...address, postalCode: ' ' })).toBe(false)
    expect(addressComplete(null)).toBe(false)
  })
})

describe('materials', () => {
  it('builds one card per filament family with PLA recommended and its colours attached', () => {
    const colours = [{ filament: 'pla', name: 'Black', hex: '#000', stockStatus: 'in_stock' }, { filament: 'tpu', name: 'Red', hex: '#c00', stockStatus: 'out_of_stock' }]
    const cards = materialOptions(colours)
    expect(cards.map(card => card.value)).toEqual(['pla', 'pla_matte', 'petg', 'asa', 'abs', 'tpu'])
    expect(cards[0]).toMatchObject({ recommended: true, colours: [colours[0]] })
    expect(cards.filter(card => card.recommended)).toHaveLength(1)
    expect(coloursForFilament(colours, 'tpu')).toEqual([colours[1]])
    expect(colourStockLabel('out_of_stock')).toMatch(/Out of stock/)
    expect(colourStockLabel('in_stock')).toBe('')
  })
})

describe('print choices <-> print settings', () => {
  it('maps strength and quality onto the preset tables and reads them back', () => {
    let settings = applyStrength(DEFAULT_EDITOR_PRINT_SETTINGS, 'Strong')
    settings = applyQuality(settings, 'High')
    expect(settings).toMatchObject({ wallLoops: 4, sparseInfillDensity: 40, layerHeight: 0.12, initialLayerHeight: 0.12 })
    expect(strengthFromSettings(settings)).toBe('Strong')
    expect(qualityFromSettings(settings)).toBe('High')
    const custom = applyAdvanced(settings, 'sparseInfillDensity', 100)
    expect(strengthFromSettings(custom)).toBe('')
    expect(applyAdvanced(custom, 'support', 'Tree')).toMatchObject({ enableSupport: true, supportType: 'Tree' })
    expect(supportValue(applyAdvanced(custom, 'support', 'none'))).toBe('none')
  })
  it('produces a configuration the server validator accepts, with or without a matching preset', () => {
    const printSettings = buildPrintSettings({ filament: 'petg', settings: applyStrength(DEFAULT_EDITOR_PRINT_SETTINGS, 'Draft') })
    const generic = buildGeneric({ printSettings, colour: 'White' })
    expect(generic).toEqual({ material: 'plastic', filament: 'petg', colour: 'White', strength: 'Draft', quality: 'Medium' })
    expect(validatePrintConfiguration({ printSettings, generic, meshColors: { Body: '#f7f7f4' } }).generic).toEqual(generic)
    const custom = applyAdvanced(printSettings, 'wallLoops', 3)
    const customGeneric = buildGeneric({ printSettings: custom, colour: 'White' })
    expect(customGeneric).toEqual({ material: 'plastic', filament: 'petg', colour: 'White', quality: 'Medium' })
    expect(() => validatePrintConfiguration({ printSettings: custom, generic: customGeneric })).not.toThrow()
  })
  it('gates the checklist on model, fit, colour and the delivery choice', () => {
    const courier = { type: 'courier', needsAddress: true }
    const pickup = { type: 'pickup', needsAddress: false }
    expect(buildChecklist({ hasModel: false, fits: true, hasColour: true, delivery: pickup }).map(item => item.ok)).toEqual([false, false, true, true])
    expect(buildChecklist({ hasModel: true, fits: false, hasColour: true, delivery: pickup }).map(item => item.ok)).toEqual([true, false, true, true])
    const items = buildChecklist({ hasModel: true, fits: true, hasColour: true, delivery: courier, address: { street: 'x' } })
    expect(items[3]).toEqual({ key: 'delivery', label: 'Delivery address complete', ok: false })
    expect(buildChecklist({ hasModel: true, fits: true, hasColour: true, delivery: courier,
      address: { street: '1', city: 'S', state: 'S', postalCode: '1', country: 'SG' } })[3].ok).toBe(true)
  })
  it('restores a saved request, naming the colour from mesh colours when the generic block lacks it', () => {
    const colours = [{ filament: 'pla', name: 'Black', hex: '#000000' }]
    const restored = restoreFromRequest({ status: 'quoted', customerNote: 'note', designSource: { url: 'https://x.y/z' },
      printConfiguration: { printSettings: { wallLoops: 4, sparseInfillDensity: 40, filamentType: 'pla' }, meshColors: { A: '#000000', B: '#000000' } },
      quote: { inputs: { options: { postProcessing: true } }, expedite: { applied: true } } }, colours)
    expect(restored).toMatchObject({ filament: 'pla', colour: 'Black', note: 'note', locked: false, modelLocked: true,
      options: { postProcessing: true, expedite: true }, source: { url: 'https://x.y/z' } })
    expect(strengthFromSettings(restored.printSettings)).toBe('Strong')
    expect(restored.perPartColours).toBe(false)
    expect(restored.meshColors).toEqual({ A: '#000000', B: '#000000' })
    expect(restoreFromRequest({ status: 'paid', paidAt: 'x' })).toMatchObject({ locked: true, lockReason: /payment or fulfilment/ })
    expect(restoreFromRequest({ status: 'configured', creatorUserId: 'c' }).locked).toBe(true)
  })
  it('recognises per-part editor colours and manual quotes', () => {
    const perPart = restoreFromRequest({ status: 'configured', printConfiguration: { generic: { colour: null, filament: 'pla' }, meshColors: { A: '#000000', B: '#FFFFFF' } } })
    expect(perPart).toMatchObject({ perPartColours: true, colour: '', meshColors: { A: '#000000', B: '#ffffff' }, locked: false })
    const single = restoreFromRequest({ status: 'configured', printConfiguration: { generic: { colour: 'Black' }, meshColors: { A: '#000000', B: '#ffffff' } } })
    expect(single).toMatchObject({ perPartColours: false, colour: 'Black' })
    const manual = restoreFromRequest({ status: 'quoted', quoteMode: 'manual', printConfiguration: {} })
    expect(manual).toMatchObject({ locked: true, lockReason: /quoted by Fix It Today/ })
    expect(restoreFromRequest({ status: 'configured', quoteMode: 'manual', printConfiguration: {} }).locked).toBe(false)
    expect(restoreFromRequest({ status: 'quoted', quoteMode: 'instant', printConfiguration: {} }).locked).toBe(false)
    expect(restoreFromRequest({ status: 'quoted', quote: { inputs: { options: { priority: true, specialRequest: true } } } }).options)
      .toEqual({ postProcessing: false, specialRequest: true, priority: true, expedite: false })
  })
})
