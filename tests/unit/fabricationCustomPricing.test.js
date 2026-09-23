import { describe, expect, it } from 'vitest'
import { createFabricationOffer, pricingBasisForOffer, publicFabricationCatalog } from '@/lib/fabrication/catalog'
import { validateFabricationCatalog, validateFabricationInput } from '@/lib/fabrication/validate'
import { calculateFabricationEstimate } from '@/lib/fabrication/pricing'

function fixture(basis = 'manual') {
  const offer = createFabricationOffer('custom')
  Object.assign(offer, { id: 'custom-service', enabled: true, pricingBasis: basis })
  const material = offer.materials[0]
  Object.assign(material, { id: 'standard', perItemFee: 2, setupFee: 5, minimumCharge: 10 })
  if (basis === 'area') material.pricePerCm2 = 0.5
  if (basis === 'volume') material.pricePerCm3 = 0.5
  if (basis === 'length') material.pricePerCm = 0.5
  const input = { offerId: offer.id, materialId: material.id, quantity: 3 }
  return { offer, material, input, catalog: { enabled: true, offers: [offer] } }
}
const groups = () => [
  { id: 'finish', name: 'Finish', required: true, choices: [
    { id: 'plain', label: 'Plain', priceDelta: 0 }, { id: 'polished', label: 'Polished', priceDelta: 1.25 },
  ] },
  { id: 'gift-box', name: 'Packaging', required: false, choices: [{ id: 'box', label: 'Gift box', priceDelta: 2.5 }] },
]

describe('custom pricing bases', () => {
  it('defaults custom services to manual and preserves fixed process units', () => {
    const offer = createFabricationOffer('custom')
    expect(offer).toMatchObject({ enabled: false, pricingBasis: 'manual' })
    expect(pricingBasisForOffer(offer)).toMatchObject({ id: 'manual', isManual: true, requiresWidth: false })
    delete offer.pricingBasis
    expect(pricingBasisForOffer(offer).id).toBe('manual')
    expect(pricingBasisForOffer({ kind: 'sls' })).toMatchObject({ id: 'volume', requiresDepth: true, unit: 'cm3' })
    expect(pricingBasisForOffer({ kind: 'laser_cut' }).id).toBe('area')
    const fixed = createFabricationOffer('laser_cut')
    fixed.pricingBasis = 'item'
    expect(validateFabricationCatalog({ enabled: false, offers: [fixed] }).ok).toBe(false)
    fixed.pricingBasis = 'area'
    expect(validateFabricationCatalog({ enabled: false, offers: [fixed] }).ok).toBe(true)
  })
  it.each([
    ['area', { widthMm: 20, heightMm: 30 }, 'cm2', 6, 20],
    ['volume', { widthMm: 10, heightMm: 20, depthMm: 30 }, 'cm3', 6, 20],
    ['length', { widthMm: 40 }, 'cm', 4, 17],
    ['item', {}, 'item', 1, 11],
  ])('calculates %s with dimensions required only for that basis', (basis, dimensions, unit, measurePerItem, total) => {
    const { catalog, input } = fixture(basis)
    const result = calculateFabricationEstimate(catalog, { ...input, ...dimensions })
    expect(result.ok).toBe(true)
    expect(result.value.estimate).toMatchObject({ unit, measurePerItem, total, manualReviewRequired: false })
    expect(result.value.offer.pricingBasis).toBe(basis)
  })
  it.each([
    ['area', {}], ['area', { widthMm: 20 }],
    ['volume', { widthMm: 20, heightMm: 30 }], ['length', {}],
  ])('rejects missing measured dimensions for %s', (basis, dimensions) => {
    const { catalog, input } = fixture(basis)
    expect(calculateFabricationEstimate(catalog, { ...input, ...dimensions })).toMatchObject({ ok: false, status: 400 })
  })
  it('returns a genuine manual quote state with no fabricated numeric total', () => {
    const { catalog, input, offer, material } = fixture()
    Object.assign(material, { perItemFee: 0, setupFee: 0, minimumCharge: 0 })
    offer.optionGroups = groups()
    const result = calculateFabricationEstimate(catalog, { ...input, selectedOptions: { finish: 'polished' }, customerNote: 'Repair the clasp.' })
    expect(result.ok).toBe(true)
    expect(result.value.dimensions).toEqual({})
    expect(result.value.customerNote).toBe('Repair the clasp.')
    expect(result.value.estimate).toMatchObject({ basis: 'manual', total: null, subtotal: null, rate: null,
      processPerItem: null, measurePerItem: null, unit: null, optionsPerItem: 1.25,
      manualReviewRequired: true, providerConfirmationRequired: true })
  })
  it.each(['manual', 'item', 'length'])('still rejects nonfinite or oversized optional dimensions for %s', basis => {
    const { catalog, input } = fixture(basis)
    const valid = { ...input, ...(basis === 'length' ? { widthMm: 20 } : {}) }
    for (const heightMm of [NaN, Infinity, 0, 5001, 201]) {
      expect(calculateFabricationEstimate(catalog, { ...valid, heightMm }).ok).toBe(false)
    }
  })
  it('does not reinterpret wrong-unit rates and keeps exact area thickness', () => {
    const { catalog, input, material } = fixture('area')
    Object.assign(material, { thicknessMm: 3, maxDepthMm: 3 })
    const result = calculateFabricationEstimate(catalog, { ...input, widthMm: 20, heightMm: 30 })
    expect(result.value.dimensions.depthMm).toBe(3)
    expect(calculateFabricationEstimate(catalog, { ...input, widthMm: 20, heightMm: 30, depthMm: 3 }).ok).toBe(false)
    material.pricePerCm = 1
    expect(validateFabricationCatalog(catalog).ok).toBe(false)
    const manual = fixture('manual'); manual.material.pricePerCm3 = 1
    expect(validateFabricationCatalog(manual.catalog).ok).toBe(false)
  })
})

describe('published service customizations', () => {
  it('adds server-owned choices per item before a single setup and order minimum', () => {
    const { catalog, input, offer } = fixture('item')
    offer.optionGroups = groups()
    const result = calculateFabricationEstimate(catalog, { ...input, selectedOptions: { finish: 'polished', 'gift-box': 'box' } })
    expect(result.value.estimate).toMatchObject({ optionsPerItem: 3.75, subtotal: 22.25, total: 22.25, setupFee: 5 })
    expect(result.value.estimate.options).toEqual([
      { groupId: 'finish', groupName: 'Finish', choiceId: 'polished', label: 'Polished', priceDelta: 1.25 },
      { groupId: 'gift-box', groupName: 'Packaging', choiceId: 'box', label: 'Gift box', priceDelta: 2.5 },
    ])
    expect(result.value.selectedOptions).toEqual({ finish: 'polished', 'gift-box': 'box' })
    const minimum = calculateFabricationEstimate(catalog, { ...input, quantity: 1, selectedOptions: { finish: 'polished' } })
    expect(minimum.value.estimate).toMatchObject({ subtotal: 8.25, total: 10, minimumApplied: true })
  })
  it('accepts free required choices and omitted optional groups', () => {
    const { catalog, input, offer } = fixture('item'); offer.optionGroups = groups()
    const result = calculateFabricationEstimate(catalog, { ...input, selectedOptions: { finish: 'plain' } })
    expect(result.value.estimate).toMatchObject({ optionsPerItem: 0, total: 11 })
    expect(result.value.estimate.options).toHaveLength(1)
  })
  it.each([{}, { finish: 'unknown' }, { finish: 'box' }, { finish: 'plain', hidden: 'box' }])('rejects missing or unpublished selections %j', selectedOptions => {
    const { catalog, input, offer } = fixture('item'); offer.optionGroups = groups()
    expect(calculateFabricationEstimate(catalog, { ...input, selectedOptions })).toMatchObject({ ok: false, status: 400 })
  })
  it.each([
    { finish: { id: 'polished', priceDelta: 0 } }, { finish: ['plain', 'polished'] },
    { finish: 0 }, { finish: '' }, { 'bad group': 'plain' }, null,
  ])('rejects tampered option records %j', selectedOptions => {
    expect(validateFabricationInput({ offerId: 'service', materialId: 'standard', quantity: 1, selectedOptions }).ok).toBe(false)
  })
  it.each([NaN, Infinity, -1, 0.001, 100001])('rejects invalid option price %s', priceDelta => {
    const { catalog, offer } = fixture('item'); offer.optionGroups = groups()
    offer.optionGroups[0].choices[0].priceDelta = priceDelta
    expect(validateFabricationCatalog(catalog).ok).toBe(false)
  })
  it('bounds option payloads and rejects duplicate groups, duplicate choices and extra fields', () => {
    const { catalog, offer, input } = fixture('item'); offer.optionGroups = groups()
    offer.optionGroups.push(structuredClone(offer.optionGroups[0]))
    expect(validateFabricationCatalog(catalog).ok).toBe(false)
    offer.optionGroups = groups(); offer.optionGroups[0].choices.push({ id: 'plain', label: 'Other', priceDelta: 0 })
    expect(validateFabricationCatalog(catalog).ok).toBe(false)
    offer.optionGroups = groups(); offer.optionGroups[0].choices[0].privateCost = 0.1
    expect(validateFabricationCatalog(catalog).ok).toBe(false)
    offer.optionGroups = Array.from({ length: 13 }, (_, index) => ({ ...groups()[0], id: 'group-' + index }))
    expect(validateFabricationCatalog(catalog).ok).toBe(false)
    expect(validateFabricationInput({ ...input, selectedOptions: Object.fromEntries(offer.optionGroups.map(group => [group.id, 'plain'])) }).ok).toBe(false)
    offer.optionGroups = groups(); offer.optionGroups[0].choices = Array.from({ length: 31 }, (_, index) => ({ id: 'choice-' + index, label: 'Choice', priceDelta: 1 }))
    expect(validateFabricationCatalog(catalog).ok).toBe(false)
  })
  it('caps option sums and computed totals', () => {
    const { catalog, input, offer } = fixture('item'); offer.optionGroups = groups()
    offer.optionGroups[0].choices[1].priceDelta = 100000
    expect(calculateFabricationEstimate(catalog, { ...input, selectedOptions: { finish: 'polished' } }).ok).toBe(false)
    offer.pricingBasis = 'manual'
    expect(calculateFabricationEstimate(catalog, { ...input, selectedOptions: { finish: 'polished', 'gift-box': 'box' } }).ok).toBe(false)
  })
  it('requires a priced base or positive minimum across required choices before publishing', () => {
    const { catalog, input, offer, material } = fixture('item'); offer.optionGroups = groups()
    Object.assign(material, { perItemFee: 0, setupFee: 0, minimumCharge: 0 })
    // An optional paid box and a required finish with a free alternative are insufficient.
    expect(validateFabricationCatalog(catalog).ok).toBe(false)
    offer.optionGroups[0].choices = [{ id: 'polished', label: 'Polished', priceDelta: 1.25 }]
    expect(validateFabricationCatalog(catalog).ok).toBe(true)
    expect(calculateFabricationEstimate(catalog, { ...input, selectedOptions: { finish: 'polished' } }).value.estimate.total).toBe(3.75)
    offer.optionGroups[0].required = false
    expect(validateFabricationCatalog(catalog).ok).toBe(false)
    material.minimumCharge = 1
    expect(validateFabricationCatalog(catalog).ok).toBe(true)
    expect(calculateFabricationEstimate(catalog, input).value.estimate.total).toBe(1)
  })
  it('publicly allowlists option labels and selling prices while stripping provider internals', () => {
    const { catalog, offer } = fixture('item'); offer.optionGroups = groups()
    offer.optionGroups[0].costNote = 'private'; offer.optionGroups[0].choices[0].supplierId = 'private'
    const published = publicFabricationCatalog(catalog)
    expect(published.offers[0].pricingBasis).toBe('item')
    expect(published.offers[0].optionGroups).toEqual(groups())
    expect(published.offers[0].materials[0].pricePerCm).toBe(0)
  })
  it('snapshots options independently so later catalogue changes do not rewrite a request', () => {
    const { catalog, input, offer } = fixture('item'); offer.optionGroups = groups()
    input.selectedOptions = { finish: 'polished' }
    const snapshot = calculateFabricationEstimate(catalog, input).value
    offer.optionGroups[0].choices[1].priceDelta = 99
    input.selectedOptions.finish = 'plain'
    expect(snapshot.estimate.optionsPerItem).toBe(1.25)
    expect(snapshot.selectedOptions.finish).toBe('polished')
  })
})
