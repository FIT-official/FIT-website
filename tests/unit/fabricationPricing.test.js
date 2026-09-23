import { describe, expect, it } from 'vitest'
import { FABRICATION_KINDS, createFabricationOffer, emptyFabricationCatalog, publicFabricationCatalog, starterFabricationCatalog } from '@/lib/fabrication/catalog'
import { validateFabricationCatalog, validateFabricationInput, validateFabricationPersonalization, isFabricationRegionContained } from '@/lib/fabrication/validate'
import { calculateFabricationEstimate } from '@/lib/fabrication/pricing'

function fixture(kind = 'laser_cut') {
  const offer = createFabricationOffer(kind)
  offer.id = 'offer-1'; offer.enabled = true; offer.materials[0].id = 'material-3'
  const catalog = { enabled: true, offers: [offer] }
  const input = { offerId: offer.id, materialId: 'material-3', widthMm: 100, heightMm: 50, quantity: 3,
    ...(kind === 'sls' || kind === 'metal_print' ? { depthMm: 20 } : {}) }
  return { catalog, input, offer, material: offer.materials[0] }
}
const personalization = () => ({ text: '  Alex Tan  ', region: { x: 0.1, y: 0.2, width: 0.7, height: 0.3 },
  textColor: '#ABCDEF', fontFamily: 'sans' })

describe('fabrication catalogue', () => {
  it('starts empty and disabled, with no automatic publishing', () => {
    expect(emptyFabricationCatalog()).toEqual({ enabled: false, offers: [] })
    const samples = starterFabricationCatalog()
    expect(samples.enabled).toBe(false)
    expect(samples.offers).toHaveLength(7)
    expect(samples.offers.every(offer => !offer.enabled && /example/.test(offer.name))).toBe(true)
    expect(validateFabricationCatalog(samples).ok).toBe(true)
    expect(publicFabricationCatalog(samples)).toBeNull()
  })
  it('supplies unique example identifiers and rejects unknown processes', () => {
    const a = createFabricationOffer('name_tag'); const b = createFabricationOffer('name_tag')
    expect(a.id).not.toBe(b.id); expect(a.materials[0].id).not.toBe(b.materials[0].id)
    expect(a.materials[0].thicknessMm).toBe(3)
    expect(() => createFabricationOffer('unknown')).toThrow()
    expect(FABRICATION_KINDS.find(kind => kind.id === 'sls').isVolume).toBe(true)
  })
  it('requires enabled offers, materials, and a nonzero selling price before publishing', () => {
    expect(validateFabricationCatalog({ enabled: true, offers: [] }).ok).toBe(false)
    const { catalog, offer, material } = fixture()
    offer.materials = []
    expect(validateFabricationCatalog(catalog).ok).toBe(false)
    offer.materials = [material]
    Object.assign(material, { pricePerCm2: 0, setupFee: 0, perItemFee: 0, minimumCharge: 0 })
    expect(validateFabricationCatalog(catalog).ok).toBe(false)
  })
  it('rejects duplicate offer IDs and duplicate thickness-row IDs', () => {
    const { catalog, offer, material } = fixture()
    catalog.offers.push(structuredClone(offer))
    expect(validateFabricationCatalog(catalog).ok).toBe(false)
    catalog.offers.pop(); offer.materials.push({ ...material, thicknessMm: 6 })
    expect(validateFabricationCatalog(catalog).ok).toBe(false)
  })
  it.each(['enabled', 'quantity', 'price', 'thicknessMm'])('rejects unknown or wrong-typed top-level input %s', field => {
    const { input } = fixture()
    expect(validateFabricationInput({ ...input, [field]: field === 'quantity' ? '3' : 5 }).ok).toBe(false)
  })
  it('rejects unknown private/pricing keys at every nested level', () => {
    const { catalog, material } = fixture()
    expect(validateFabricationCatalog({ ...catalog, ownerId: 'private' }).ok).toBe(false)
    material.costPrice = 0.01
    expect(validateFabricationCatalog(catalog).ok).toBe(false)
    delete material.costPrice
    catalog.offers[0].template = { assetId: 'asset_1', region: { x: 0, y: 0, width: 1, height: 1 }, url: 'https://example.test' }
    expect(validateFabricationCatalog(catalog).ok).toBe(false)
  })
  it.each([NaN, Infinity, -Infinity, -1, 100001])('rejects invalid catalogue rate %s', pricePerCm2 => {
    const { catalog, material } = fixture(); material.pricePerCm2 = pricePerCm2
    expect(validateFabricationCatalog(catalog).ok).toBe(false)
  })
  it('bounds offered counts, lead times, precision, and physical limits', () => {
    const { catalog, material, offer } = fixture()
    material.setupFee = 0.105; expect(validateFabricationCatalog(catalog).ok).toBe(false)
    material.setupFee = 5; material.pricePerCm2 = 0.0000001; expect(validateFabricationCatalog(catalog).ok).toBe(false)
    material.pricePerCm2 = 0.02; offer.leadTimeDays = 121; expect(validateFabricationCatalog(catalog).ok).toBe(false)
    offer.leadTimeDays = 7; material.maxWidthMm = 5001; expect(validateFabricationCatalog(catalog).ok).toBe(false)
    material.maxWidthMm = 200
    offer.materials = Array.from({ length: 41 }, (_, index) => ({ ...material, id: 'row-' + index }))
    expect(validateFabricationCatalog(catalog).ok).toBe(false)
    offer.materials = [material]
    catalog.offers = Array.from({ length: 25 }, (_, index) => ({ ...offer, id: 'offer-' + index }))
    expect(validateFabricationCatalog(catalog).ok).toBe(false)
  })
  it('requires exact positive sheet thickness and zero placeholder thickness for volume processes', () => {
    const area = fixture('name_tag'); area.material.thicknessMm = 0
    expect(validateFabricationCatalog(area.catalog).ok).toBe(false)
    area.material.thicknessMm = 4
    expect(validateFabricationCatalog(area.catalog).ok).toBe(false) // beyond advertised maxDepth=3
    const volume = fixture('sls'); volume.material.thicknessMm = 3
    expect(validateFabricationCatalog(volume.catalog).ok).toBe(false)
  })
  it('does not silently ignore a rate in the wrong unit', () => {
    const area = fixture(); area.material.pricePerCm3 = 0.5
    expect(validateFabricationCatalog(area.catalog).ok).toBe(false)
    const volume = fixture('metal_print'); volume.material.pricePerCm2 = 0.1
    expect(validateFabricationCatalog(volume.catalog).ok).toBe(false)
  })
  it('publishes an allowlist with no disabled offers, internal costs, owner data or signed URLs', () => {
    const { catalog, offer, material } = fixture()
    catalog.ownerId = 'secret'
    material.internalCost = 0.001
    offer.template = { assetId: 'template-asset', textColor: '#000000', fontFamily: 'sans',
      region: { x: 0, y: 0, width: 1, height: 1 }, signedUrl: 'private' }
    catalog.offers.push({ ...offer, id: 'hidden', enabled: false })
    const published = publicFabricationCatalog(catalog)
    expect(published.offers).toHaveLength(1)
    expect(published).not.toHaveProperty('ownerId')
    expect(published.offers[0].materials[0]).not.toHaveProperty('internalCost')
    expect(published.offers[0].template).not.toHaveProperty('signedUrl')
    expect(published.offers[0].template.assetId).toBe('template-asset')
    expect(publicFabricationCatalog({ ...catalog, enabled: false })).toBeNull()
  })
})

describe('provider selling-rate calculation', () => {
  it.each(['laser_cut', 'engraving', 'name_tag', 'dot_peen'])('%s converts mm² to cm² and charges setup once per order', kind => {
    const { catalog, input } = fixture(kind)
    const result = calculateFabricationEstimate(catalog, input)
    expect(result.ok).toBe(true)
    expect(result.value.dimensions).toEqual({ widthMm: 100, heightMm: 50, depthMm: 3 })
    expect(result.value.estimate).toMatchObject({ basis: 'area', unit: 'cm2', measurePerItem: 50,
      rate: 0.02, processPerItem: 1, perItemFee: 1, setupFee: 5, subtotal: 11, total: 11, minimumApplied: false, providerConfirmationRequired: true })
  })
  it.each(['sls', 'metal_print'])('%s uses a bounding envelope, not model material volume', kind => {
    const { catalog, input } = fixture(kind)
    Object.assign(input, { widthMm: 10, heightMm: 20, depthMm: 30, quantity: 2 })
    const result = calculateFabricationEstimate(catalog, input)
    expect(result.value.estimate).toMatchObject({ basis: 'bounding_envelope', unit: 'cm3',
      measurePerItem: 6, processPerItem: 3, subtotal: 13, total: 13, providerConfirmationRequired: true })
    expect(result.value.estimate).not.toHaveProperty('materialVolume')
  })
  it('applies the minimum once after quantity and setup, not per item', () => {
    const { catalog, input } = fixture()
    Object.assign(input, { widthMm: 20, heightMm: 10, quantity: 2 })
    expect(calculateFabricationEstimate(catalog, input).value.estimate).toMatchObject({ subtotal: 7.08, total: 10, minimumApplied: true })
  })
  it('keeps fractional unit charges until the order total is rounded', () => {
    const { catalog, input, material } = fixture()
    Object.assign(material, { pricePerCm2: 0.001, setupFee: 0, perItemFee: 0, minimumCharge: 0 })
    Object.assign(input, { widthMm: 10, heightMm: 10, quantity: 1000 })
    expect(calculateFabricationEstimate(catalog, input).value.estimate.total).toBe(1)
  })
  it('selects the exact thickness row and never interpolates thickness or multiplies it into area', () => {
    const { catalog, input, offer, material } = fixture()
    offer.materials.push({ ...material, id: 'material-6', thicknessMm: 6, maxDepthMm: 6, pricePerCm2: 0.06 })
    const result = calculateFabricationEstimate(catalog, { ...input, materialId: 'material-6' })
    expect(result.value.material.thicknessMm).toBe(6)
    expect(result.value.estimate).toMatchObject({ measurePerItem: 50, processPerItem: 3, total: 17 })
    expect(calculateFabricationEstimate(catalog, { ...input, materialId: 'material-4' })).toMatchObject({ ok: false, status: 400 })
    expect(calculateFabricationEstimate(catalog, { ...input, thicknessMm: 6 }).ok).toBe(false)
  })
  it('rejects unavailable catalogues, offers and materials from another offer', () => {
    const { catalog, input, offer } = fixture()
    expect(calculateFabricationEstimate({ ...catalog, enabled: false }, input).ok).toBe(false)
    catalog.offers.push({ ...offer, id: 'second', enabled: false, materials: [{ ...offer.materials[0], id: 'private-material' }] })
    expect(calculateFabricationEstimate(catalog, { ...input, offerId: 'second' }).ok).toBe(false)
    expect(calculateFabricationEstimate(catalog, { ...input, materialId: 'private-material' }).ok).toBe(false)
  })
  it.each([0, -1, 0.5, 1001, NaN, Infinity])('rejects invalid quantity %s', quantity => {
    const { catalog, input } = fixture()
    expect(calculateFabricationEstimate(catalog, { ...input, quantity })).toMatchObject({ ok: false, status: 400 })
  })
  it.each([0, -1, 5001, NaN, Infinity])('rejects invalid dimensions %s', widthMm => {
    const { catalog, input } = fixture()
    expect(calculateFabricationEstimate(catalog, { ...input, widthMm }).ok).toBe(false)
  })
  it('rejects valid global sizes that exceed the selected provider material limits', () => {
    const { catalog, input } = fixture()
    expect(calculateFabricationEstimate(catalog, { ...input, widthMm: 201 }).ok).toBe(false)
    expect(calculateFabricationEstimate(catalog, { ...input, heightMm: 201 }).ok).toBe(false)
    const volume = fixture('sls')
    expect(calculateFabricationEstimate(volume.catalog, { ...volume.input, depthMm: 201 }).ok).toBe(false)
  })
  it('requires volume depth, prohibits supplied area depth and caps excessive totals', () => {
    const area = fixture()
    expect(calculateFabricationEstimate(area.catalog, { ...area.input, depthMm: 1 }).ok).toBe(false)
    const volume = fixture('sls'); delete volume.input.depthMm
    expect(calculateFabricationEstimate(volume.catalog, volume.input).ok).toBe(false)
    area.material.pricePerCm2 = 100000
    expect(calculateFabricationEstimate(area.catalog, area.input).ok).toBe(false)
  })
  it('rejects customer prices, discount, currency, rate and unknown personalization fields', () => {
    const { catalog, input } = fixture()
    for (const key of ['price', 'total', 'discount', 'currency', 'pricePerCm2']) {
      expect(calculateFabricationEstimate(catalog, { ...input, [key]: 0 }).ok).toBe(false)
    }
    expect(calculateFabricationEstimate(catalog, { ...input, personalization: { ...personalization(), html: '<b>fake</b>' } }).ok).toBe(false)
  })
  it('makes an independent snapshot while keeping image authorization outside the calculator', () => {
    const { catalog, input } = fixture()
    input.personalization = personalization()
    const before = structuredClone({ catalog, input })
    const result = calculateFabricationEstimate(catalog, input)
    expect(result.value.personalization).toMatchObject({ text: 'Alex Tan', textColor: '#abcdef' })
    expect({ catalog, input }).toEqual(before)
    result.value.personalization.region.x = 0.5
    expect(input.personalization.region.x).toBe(0.1)
    expect(result.value.currency).toBe('sgd')
  })
})

describe('personalization geometry', () => {
  it.each([
    { x: -0.1, y: 0, width: 0.5, height: 0.5 },
    { x: 0.8, y: 0, width: 0.5, height: 0.5 },
    { x: 0, y: 0.9, width: 0.5, height: 0.2 },
    { x: 0, y: 0, width: 0, height: 0.5 },
    { x: Infinity, y: 0, width: 0.5, height: 0.5 },
  ])('rejects a region outside the image or with invalid extent %j', region => {
    expect(validateFabricationPersonalization({ ...personalization(), region }).ok).toBe(false)
  })
  it('permits providers to adjust a valid image region and supports explicit template containment checks', () => {
    const outer = { x: 0.2, y: 0.2, width: 0.6, height: 0.4 }
    expect(isFabricationRegionContained({ x: 0.3, y: 0.3, width: 0.2, height: 0.2 }, outer)).toBe(true)
    expect(isFabricationRegionContained({ x: 0.1, y: 0.3, width: 0.2, height: 0.2 }, outer)).toBe(false)
    expect(isFabricationRegionContained(null, outer)).toBe(false)
    expect(validateFabricationPersonalization({ ...personalization(), region: { x: 0, y: 0, width: 1, height: 1 } }).ok).toBe(true)
  })
  it('rejects blank/oversized text, custom CSS fonts and image URLs', () => {
    for (const patch of [{ text: '' }, { text: 'a'.repeat(121) }, { fontFamily: 'url(evil)' }, { textColor: 'red' }, { imageUrl: 'https://example.test' }]) {
      expect(validateFabricationPersonalization({ ...personalization(), ...patch }).ok).toBe(false)
    }
  })
  it('accepts bounded multiline text and only the shared editor font identifiers', () => {
    for (const fontFamily of ['sans', 'serif', 'mono']) {
      expect(validateFabricationPersonalization({ ...personalization(), text: 'Alex Tan\nStudio', fontFamily }).ok).toBe(true)
    }
    expect(validateFabricationPersonalization({ ...personalization(), fontFamily: 'Arial' }).ok).toBe(false)
  })
})
