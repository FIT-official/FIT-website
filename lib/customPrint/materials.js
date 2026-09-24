// Material cards and colour swatches for the print request page. The catalogue
// (families + colours) lives in lib/filamentCatalogue; stock comes from
// /api/filament-availability. Pure helpers, shared with the editor's settings.
import { FILAMENTS, DEFAULT_FIT_COLOURS } from '@/lib/filamentCatalogue'

export const RECOMMENDED_FILAMENT = 'pla'

export const MATERIAL_DESCRIPTIONS = Object.freeze({
  pla: 'Everyday parts, models and props',
  pla_matte: 'Soft matte finish that hides layer lines',
  petg: 'Tougher, takes heat and outdoor use',
  asa: 'Outdoor parts, stays stable in sunlight',
  abs: 'Heat-resistant, can be sanded and glued',
  tpu: 'Flexible and rubbery: cases, gaskets, feet',
})

export function coloursForFilament(colours = DEFAULT_FIT_COLOURS, filament = RECOMMENDED_FILAMENT) {
  return (colours || []).filter(colour => (colour.filament || 'pla') === filament)
}

export function materialOptions(colours = DEFAULT_FIT_COLOURS) {
  return FILAMENTS.map(material => ({
    value: material.value,
    label: material.label,
    description: MATERIAL_DESCRIPTIONS[material.value] || 'Ask us about this material',
    recommended: material.value === RECOMMENDED_FILAMENT,
    colours: coloursForFilament(colours, material.value),
  }))
}

export function colourStockLabel(status) {
  if (status === 'out_of_stock') return 'Out of stock · 4–6 weeks'
  if (status === 'unknown') return 'Stock check pending'
  return ''
}

export function colourStockNote(status) {
  if (status === 'out_of_stock') return 'This colour is out of stock. Allow 4–6 weeks, or choose another colour. Rush and priority are unavailable.'
  if (status === 'unknown') return 'Stock cannot be confirmed right now. Rush and priority are unavailable until the inventory check succeeds.'
  return ''
}
