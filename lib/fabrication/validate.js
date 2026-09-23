import { z } from 'zod'

export const FABRICATION_KIND_IDS = Object.freeze(['laser_cut', 'engraving', 'name_tag', 'dot_peen', 'sls', 'metal_print', 'custom'])
export const FABRICATION_FONTS = Object.freeze(['sans', 'serif', 'mono'])
// Counts bound one payload/page, not the provider's total service catalogue.
export const FABRICATION_LIMITS = Object.freeze({ offers: 24, materialsPerOffer: 40, optionGroups: 12, choicesPerGroup: 30,
  dimensionMm: 5000, quantity: 1000, money: 100000 })
export const isVolumeKind = kind => kind === 'sls' || kind === 'metal_print'
export const FABRICATION_PRICING_BASES = Object.freeze([
  { id: 'area', label: 'Area', unit: 'cm2', requiresWidth: true, requiresHeight: true, requiresDepth: false, isVolume: false, isManual: false },
  { id: 'volume', label: 'Bounding volume', unit: 'cm3', requiresWidth: true, requiresHeight: true, requiresDepth: true, isVolume: true, isManual: false },
  { id: 'length', label: 'Length', unit: 'cm', requiresWidth: true, requiresHeight: false, requiresDepth: false, isVolume: false, isManual: false },
  { id: 'item', label: 'Per item', unit: 'item', requiresWidth: false, requiresHeight: false, requiresDepth: false, isVolume: false, isManual: false },
  { id: 'manual', label: 'Provider quote', unit: null, requiresWidth: false, requiresHeight: false, requiresDepth: false, isVolume: false, isManual: true },
].map(value => Object.freeze(value)))
const pricingBasisIds = FABRICATION_PRICING_BASES.map(value => value.id)
export function pricingBasisForOffer(offer) {
  const id = offer?.kind === 'custom' ? (offer.pricingBasis || 'manual') : isVolumeKind(offer?.kind) ? 'volume' : 'area'
  return FABRICATION_PRICING_BASES.find(value => value.id === id) || null
}

const identifier = z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9_-]*$/, 'Use a lowercase identifier')
const assetId = z.string().min(1).max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, 'Invalid template asset ID')
const text = (max, required = false) => z.string().trim().max(max)
  .refine(value => !/[<>\u0000-\u001f\u007f]/.test(value), 'Use plain single-line text')
  .refine(value => !required || value.length > 0, 'This text is required')
const blockText = max => z.string().trim().max(max)
  .refine(value => !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), 'Use plain text')
const positiveDimension = z.number().finite().min(0.01).max(FABRICATION_LIMITS.dimensionMm)
const rate = z.number().finite().min(0).max(FABRICATION_LIMITS.money)
  .refine(value => Math.abs(value * 1e6 - Math.round(value * 1e6)) < 1e-5, 'Rates support up to six decimal places')
const fee = z.number().finite().min(0).max(FABRICATION_LIMITS.money)
  .refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7, 'Fees must use whole cents')
const colour = z.string().regex(/^#[0-9a-f]{6}$/i, 'Use a six-digit hex colour').transform(value => value.toLowerCase())

const region = z.object({
  x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1),
  width: z.number().finite().positive().max(1), height: z.number().finite().positive().max(1),
}).strict().superRefine((value, context) => {
  if (value.x + value.width > 1 + 1e-9 || value.y + value.height > 1 + 1e-9) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'The region must fit inside the template' })
  }
})
const template = z.object({ assetId, region, textColor: colour.default('#000000'),
  fontFamily: z.enum(FABRICATION_FONTS).default('sans') }).strict()
const material = z.object({
  id: identifier, name: text(80, true), thicknessMm: z.number().finite().min(0).max(1000),
  pricePerCm2: rate.default(0), pricePerCm3: rate.default(0), pricePerCm: rate.default(0),
  setupFee: fee.default(0), perItemFee: fee.default(0), minimumCharge: fee.default(0),
  maxWidthMm: positiveDimension, maxHeightMm: positiveDimension, maxDepthMm: positiveDimension,
}).strict()
const optionGroup = z.object({
  id: identifier, name: text(80, true), required: z.boolean().default(false),
  choices: z.array(z.object({ id: identifier, label: text(80, true), priceDelta: fee.default(0) }).strict())
    .min(1).max(FABRICATION_LIMITS.choicesPerGroup),
}).strict().superRefine((value, context) => {
  const seen = new Set()
  value.choices.forEach((choice, index) => {
    if (seen.has(choice.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['choices', index, 'id'], message: 'Choice IDs must be unique within a group' })
    seen.add(choice.id)
  })
})
const offer = z.object({
  id: identifier, kind: z.enum(FABRICATION_KIND_IDS), name: text(80, true), description: blockText(1000).default(''),
  enabled: z.boolean().default(false), leadTimeDays: z.number().int().min(1).max(120).default(7),
  pricingBasis: z.enum(pricingBasisIds).optional(),
  materials: z.array(material).max(FABRICATION_LIMITS.materialsPerOffer).default([]),
  optionGroups: z.array(optionGroup).max(FABRICATION_LIMITS.optionGroups).default([]),
  template: template.optional(),
}).strict().superRefine((value, context) => {
  const basis = pricingBasisForOffer(value)
  if (value.kind !== 'custom' && value.pricingBasis && value.pricingBasis !== basis.id) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['pricingBasis'], message: 'Use a custom service to choose another pricing basis' })
  }
  const seen = new Set()
  const groups = new Set()
  value.optionGroups.forEach((group, index) => {
    if (groups.has(group.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['optionGroups', index, 'id'], message: 'Option group IDs must be unique within an offer' })
    groups.add(group.id)
  })
  if (value.enabled && !value.materials.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['materials'], message: 'Add a material before enabling this offer' })
  value.materials.forEach((row, index) => {
    const issue = (key, message) => context.addIssue({ code: z.ZodIssueCode.custom, path: ['materials', index, key], message })
    if (seen.has(row.id)) issue('id', 'Material IDs must be unique within an offer')
    seen.add(row.id)
    if (basis.isVolume) {
      if (row.thicknessMm !== 0) issue('thicknessMm', 'Use zero thickness for a volume process; customers provide depth')
    } else if (value.kind !== 'custom') {
      if (row.thicknessMm < 0.01) issue('thicknessMm', 'Choose a positive material thickness')
    }
    if (row.thicknessMm > row.maxDepthMm) issue('thicknessMm', 'Thickness exceeds the supported depth')
    const rateKey = { area: 'pricePerCm2', volume: 'pricePerCm3', length: 'pricePerCm' }[basis.id]
    for (const key of ['pricePerCm2', 'pricePerCm3', 'pricePerCm']) {
      if (key !== rateKey && row[key] !== 0) issue(key, 'This rate does not match the offer’s pricing basis')
    }
    // Optional groups and a required group's free choice cannot establish a base price.
    const minimumOptionsPrice = value.optionGroups.filter(group => group.required)
      .reduce((sum, group) => sum + Math.min(...group.choices.map(choice => choice.priceDelta)), 0)
    if (value.enabled && !basis.isManual && minimumOptionsPrice + (row[rateKey] || 0) + row.setupFee + row.perItemFee + row.minimumCharge <= 0) {
      issue('minimumCharge', 'Set a selling price before enabling this offer')
    }
  })
})

export const fabricationCatalogSchema = z.object({ enabled: z.boolean().default(false),
  offers: z.array(offer).max(FABRICATION_LIMITS.offers).default([]) }).strict().superRefine((value, context) => {
  const seen = new Set()
  value.offers.forEach((entry, index) => {
    if (seen.has(entry.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['offers', index, 'id'], message: 'Offer IDs must be unique' })
    seen.add(entry.id)
  })
  if (value.enabled && !value.offers.some(entry => entry.enabled)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['offers'], message: 'Enable at least one offer before publishing the catalogue' })
  }
})

export const fabricationPersonalizationSchema = z.object({ text: blockText(120).refine(value => value.length > 0, 'This text is required'), region,
  fontFamily: z.enum(FABRICATION_FONTS).default('sans'), textColor: colour.default('#000000') }).strict()

export function isFabricationRegionContained(inner, outer) {
  if (!region.safeParse(inner).success || !region.safeParse(outer).success) return false
  return inner.x >= outer.x - 1e-9 && inner.y >= outer.y - 1e-9
    && inner.x + inner.width <= outer.x + outer.width + 1e-9
    && inner.y + inner.height <= outer.y + outer.height + 1e-9
}

export const fabricationInputSchema = z.object({
  offerId: identifier, materialId: identifier, widthMm: positiveDimension.optional(), heightMm: positiveDimension.optional(),
  depthMm: positiveDimension.optional(), quantity: z.number().int().min(1).max(FABRICATION_LIMITS.quantity),
  selectedOptions: z.record(identifier, identifier).default({}).refine(value => Object.keys(value).length <= FABRICATION_LIMITS.optionGroups, 'Too many option selections'),
  personalization: fabricationPersonalizationSchema.optional(),
  customerNote: blockText(1000).default(''),
}).strict()

function validate(schema, input) {
  const parsed = schema.safeParse(input)
  return parsed.success ? { ok: true, value: parsed.data }
    : { ok: false, error: parsed.error.issues[0]?.message || 'Invalid fabrication input', issues: parsed.error.issues }
}
export const validateFabricationCatalog = input => validate(fabricationCatalogSchema, input)
export const validateFabricationInput = input => validate(fabricationInputSchema, input)
export const validateFabricationPersonalization = input => validate(fabricationPersonalizationSchema, input)
