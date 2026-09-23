import { FABRICATION_KIND_IDS, validateFabricationCatalog, isVolumeKind } from './validate'

export { FABRICATION_KIND_IDS, FABRICATION_FONTS, FABRICATION_LIMITS, FABRICATION_PRICING_BASES, pricingBasisForOffer } from './validate'
const LABELS = { laser_cut: 'Laser cutting', engraving: 'Engraving', name_tag: 'Name tags',
  dot_peen: 'Dot-peen marking', sls: 'SLS printing', metal_print: 'Metal printing', custom: 'Custom service' }
const DESCRIPTIONS = {
  laser_cut: 'Cut panels, signs and small parts from selected sheet materials.',
  engraving: 'Personalise flat items with text or artwork.',
  name_tag: 'Personalised tags for bags, desks and equipment.',
  dot_peen: 'Permanent identification marks on suitable workpieces.',
  sls: 'Powder-bed polymer parts, reviewed for build suitability.',
  metal_print: 'Metal parts with a provider-reviewed manufacturing plan.',
  custom: 'Custom making and finishing, with details agreed before work begins.',
}
export const FABRICATION_KINDS = Object.freeze(FABRICATION_KIND_IDS.map(id => Object.freeze({ id, label: LABELS[id], isVolume: isVolumeKind(id) })))
export const emptyFabricationCatalog = () => ({ enabled: false, offers: [] })

let fallbackSequence = 0
const uniqueId = () => globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + (++fallbackSequence).toString(36)

/** Disabled illustrations for the owner to replace with their verified service. */
export function createFabricationOffer(kind) {
  if (!FABRICATION_KIND_IDS.includes(kind)) throw new RangeError('Unknown fabrication process')
  const volume = isVolumeKind(kind)
  const custom = kind === 'custom'
  return {
    id: kind + '-' + uniqueId(), kind, name: LABELS[kind] + ' example',
    description: DESCRIPTIONS[kind],
    enabled: false, leadTimeDays: 7,
    ...(custom ? { pricingBasis: 'manual' } : {}), optionGroups: [],
    materials: [{
      id: 'material-' + uniqueId(), name: custom ? 'Standard service' : volume ? 'Example material' : 'Example sheet (3 mm)',
      thicknessMm: volume || custom ? 0 : 3, pricePerCm2: volume || custom ? 0 : 0.02, pricePerCm3: volume ? 0.5 : 0, pricePerCm: 0,
      setupFee: custom ? 0 : 5, perItemFee: custom ? 0 : 1, minimumCharge: custom ? 0 : 10,
      maxWidthMm: 200, maxHeightMm: 200, maxDepthMm: volume || custom ? 200 : 3,
    }],
  }
}
export const starterFabricationCatalog = () => ({ enabled: false, offers: FABRICATION_KIND_IDS.map(createFabricationOffer) })

const materialKeys = ['id', 'name', 'thicknessMm', 'pricePerCm2', 'pricePerCm3', 'pricePerCm', 'setupFee', 'perItemFee', 'minimumCharge', 'maxWidthMm', 'maxHeightMm', 'maxDepthMm']
const pick = (source, keys) => Object.fromEntries(keys.filter(key => source?.[key] !== undefined).map(key => [key, source[key]]))
const publicRegion = value => pick(value, ['x', 'y', 'width', 'height'])

/** Strip database/private fields before validation; disabled offers never leak. */
export function publicFabricationCatalog(doc) {
  if (!doc || doc.enabled !== true || !Array.isArray(doc.offers)) return null
  const candidate = { enabled: true, offers: doc.offers.filter(offer => offer?.enabled === true).map(offer => ({
    ...pick(offer, ['id', 'kind', 'name', 'description', 'enabled', 'leadTimeDays', 'pricingBasis']),
    materials: Array.isArray(offer.materials) ? offer.materials.map(row => pick(row, materialKeys)) : [],
    optionGroups: Array.isArray(offer.optionGroups) ? offer.optionGroups.map(group => ({
      ...pick(group, ['id', 'name', 'required']),
      choices: Array.isArray(group.choices) ? group.choices.map(choice => pick(choice, ['id', 'label', 'priceDelta'])) : [],
    })) : [],
    ...(offer.template ? { template: { ...pick(offer.template, ['assetId', 'textColor', 'fontFamily']),
      region: publicRegion(offer.template.region) } } : {}),
  })) }
  const parsed = validateFabricationCatalog(candidate)
  return parsed.ok ? parsed.value : null
}
