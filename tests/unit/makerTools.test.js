import { describe, expect, it } from 'vitest'
import { COLOURS, COLOUR_SOURCE, colourDistance, hexToLab, normalizeHex, rankColours } from '@/lib/makerTools/colours'
import { estimateMaterial, planProject, validateInventory } from '@/lib/makerTools/calculations'
import { makerCatalogue } from '@/lib/makerTools/catalogue'
import { bambuBulkCatalogue } from '@/lib/bulkFilamentBambu'
import products from '../fixtures/bambuShop.json'
import { bulkCombinationKey } from '@/lib/bulkFilamentSelection'

const ref = COLOURS.find(c => c.name === 'Jade White')
const spool = (overrides = {}) => ({ id: 'spool-1', label: 'My white', brand: ref.brand, material: ref.material, referenceId: ref.id, hex: ref.hex, remainingGrams: 400, diameter: 1.75, format: 'spool', ...overrides })
const estimate = (overrides = {}) => estimateMaterial({ mode: 'mass', amount: '100', extraGrams: '20', copies: '2', allowancePercent: '10', pricePerKg: '20', minutes: '', ...overrides })
describe('source-verified colour ranking', () => {
  it('has 30 distinct documented colours with a dated official source', () => {
    expect(COLOURS).toHaveLength(30); expect(new Set(COLOURS.map(c => c.id)).size).toBe(30)
    expect(COLOUR_SOURCE.url).toMatch(/^https:\/\/store.bblcdn.eu\//)
    expect(COLOURS.find(c => c.name === 'Bambu Green').hex).toBe('#00AE42')
    expect(COLOURS.find(c => c.name === 'Blue').hex).toBe('#0A2989')
  })
  it.each(['#abc', ' abc ', 'AABBCC'])('normalizes shorthand and casing (%s)', input => expect(normalizeHex(input)).toBe('#AABBCC'))
  it.each(['', '12345', '#12345678', 'red', '#zzzzzz', null, {}, 'rgb(0,0,0)'])('rejects invalid colours (%s)', input => {
    expect(normalizeHex(input)).toBeNull(); expect(rankColours(input)).toEqual([])
  })
  it('matches independent CIELAB reference points', () => {
    expect(hexToLab('#000000')).toEqual([0, 0, 0])
    expect(hexToLab('#FFFFFF')[0]).toBeCloseTo(100, 4)
    const red = hexToLab('#FF0000')
    expect(red[0]).toBeCloseTo(53.2408, 3); expect(red[1]).toBeCloseTo(80.0925, 3); expect(red[2]).toBeCloseTo(67.2032, 3)
    expect(colourDistance('#000', '#fff')).toBeCloseTo(100, 4)
  })
  it('returns every exact reference first without percentage confidence', () => {
    for (const c of COLOURS) {
      expect(rankColours(c.hex)[0]).toMatchObject({ id: c.id, distance: 0, confidence: 'Same reference HEX' })
    }
  })
  it('ranks perceptual lightness distance and has deterministic ties', () => {
    const colours = [{ id: 'b', hex: '#777777' }, { id: 'a', hex: '#777777' }, { id: 'dark', hex: '#000000' }]
    expect(rankColours('#808080', colours).map(c => c.id)).toEqual(['a', 'b', 'dark'])
    expect(colourDistance('#123456', '#abcdef')).toBe(colourDistance('#abcdef', '#123456'))
  })
})
describe('material units and disclosed assumptions', () => {
  it('separates consumption, reserve and optional entered time', () => {
    expect(estimate()).toMatchObject({ consumptionGrams: 240, reserveGrams: 24, totalGrams: 264, costSgd: 5.28, minutes: null })
    expect(estimate({ minutes: '90' }).minutes).toBe(180)
  })
  it('converts 1 m of 1.75 mm filament to grams through cross section and density', () => {
    expect(estimate({ mode: 'length', amount: '1', diameter: '1.75', density: '1.24', copies: 1, extraGrams: 0, allowancePercent: 0 }).totalGrams).toBeCloseTo(2.98255, 4)
  })
  it('converts known deposited volume without pretending infill is known', () => {
    expect(estimate({ mode: 'volume', amount: '10', density: '1.24', copies: 1, extraGrams: 0, allowancePercent: 0 }).totalGrams).toBe(12.4)
    expect(estimate({ pricePerKg: '' }).costSgd).toBeNull()
  })
  it.each([{ amount: '' }, { amount: 'Infinity' }, { amount: -1 }, { copies: 1.5 }, { copies: 0 }, { allowancePercent: 101 }, { mode: 'box' }, { mode: 'length', diameter: 0, density: 1.24 }, { mode: 'volume', density: 0 }, { pricePerKg: true }, { amount: '0x100' }, { minutes: null, amount: null }])('rejects bad input %j', overrides => expect(() => estimate(overrides)).toThrow())
})
describe('manual inventory validation and allocation', () => {
  it('keeps only explicit user fields and normalized HEX', () => {
    expect(validateInventory({ revision: 0, spools: [spool({ hex: '#fff' })] }).spools[0].hex).toBe('#FFFFFF')
    expect(validateInventory({ revision: 0, spools: [spool({ referenceId: '', brand: 'Other', material: 'PETG', hex: '' })] }).spools).toHaveLength(1)
  })
  it.each([{ remainingGrams: '' }, { remainingGrams: null }, { remainingGrams: -1 }, { remainingGrams: 100001 }, { remainingGrams: Infinity }, { diameter: 2 }, { format: 'unknown' }, { hex: 'red' }, { brand: 'Other' }, { material: 'PETG' }, { referenceId: 'invented' }, { userId: 'victim' }, { label: '\u0000' }])('rejects unsafe or conflicting spool %j', overrides => expect(() => validateInventory({ revision: 0, spools: [spool(overrides)] })).toThrow())
  it('rejects duplicate IDs, over-limit entries and spoofed ownership/revision', () => {
    expect(() => validateInventory({ revision: 0, spools: [spool(), spool()] })).toThrow()
    expect(() => validateInventory({ revision: 0, spools: Array.from({ length: 101 }, (_, i) => spool({ id: `s${i}` })) })).toThrow()
    expect(() => validateInventory({ revision: 0, spools: [], userId: 'other' })).toThrow()
    expect(() => validateInventory({ revision: -1, spools: [] })).toThrow()
  })
  it('groups repeated colours before allocating each inventory gram once', () => {
    const plan = planProject([{ referenceId: ref.id, grams: 300 }, { referenceId: ref.id, grams: 300 }], [spool()], 10)
    expect(plan).toHaveLength(1)
    expect(plan[0]).toMatchObject({ requiredGrams: 660, onHandGrams: 400, shortageGrams: 260, rollsNeeded: 1 })
  })
  it('does not substitute another material, diameter, custom swatch or brand', () => {
    const inventory = [spool({ diameter: 2.85 }), spool({ referenceId: '' }), spool({ material: 'PETG' }), spool({ brand: 'Other' })]
    expect(planProject([{ referenceId: ref.id, grams: 1 }], inventory)[0].onHandGrams).toBe(0)
  })
  it.each([[400, 0], [1400, 1], [1400.01, 2], [0.01, 0]])('rounds missing 1kg packs conservatively (%s g)', (needed, packs) => {
    expect(planProject([{ referenceId: ref.id, grams: needed }], [spool()])[0].rollsNeeded).toBe(packs)
  })
  it('handles empty inventory and exhausted spools', () => {
    expect(planProject([{ referenceId: ref.id, grams: 1000 }], [spool({ remainingGrams: 0 })])[0].rollsNeeded).toBe(1)
    expect(() => planProject([], [])).toThrow()
    expect(() => planProject([{ referenceId: 'bad', grams: 5 }], [])).toThrow()
  })
})
describe('exact catalogue offers', () => {
  const catalogue = () => bambuBulkCatalogue(products, { rows: [], source: 'shop', checkedAt: '2026-10-09T15:00:00Z' })
  it('never calls aggregate colour/spool totals a confirmed combination', () => {
    const offers = makerCatalogue(catalogue())
    expect(offers.length).toBeGreaterThan(20)
    expect(offers.every(o => o.availableRolls === null && o.netGrams === 1000)).toBe(true)
    expect(offers.every(o => o.href === '/products/bambu-lab-3d-printing-filament-1kg-pla-basic')).toBe(true)
  })
  it('keeps spool/refill combinations separate and never revives snapshot stock', () => {
    const all = catalogue(), p = all.find(p => p.slug.endsWith('1kg-pla-basic'))
    const c = p.types.find(t => t.id === p.colourTypeId), s = p.types.find(t => t.label === 'Spool')
    p.combinationStock = { [bulkCombinationKey({ [c.id]: c.options[0].id, [s.id]: s.options[0].id })]: 2 }
    expect(makerCatalogue(all).filter(o => o.optionId === c.options[0].id).map(o => o.availableRolls).sort()).toEqual([0, 2])
    p.stockSource = 'snapshot'; expect(makerCatalogue(all).every(o => o.availableRolls === null)).toBe(true)
  })
  it('fails closed when a reviewed colour identity changes', () => {
    const all = catalogue(), p = all.find(p => p.slug.endsWith('1kg-pla-basic'))
    const c = p.types.find(t => t.id === p.colourTypeId); c.options[0].name = 'Changed identity'
    expect(makerCatalogue(all).some(o => o.optionId === c.options[0].id)).toBe(false)
    p.slug = 'bambu-lab-3d-printing-filament-0-5kg-pla-basic'; expect(makerCatalogue(all)).toEqual([])
  })
})
