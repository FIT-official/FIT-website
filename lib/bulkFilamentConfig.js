import { productListPrice } from './productListPrice'
export const BAMBU_PRICE_NOTICE = 'Bambu Lab, list price, quote confirmed by FIT'
export function bulkListUnitCents(product, selected) {
  if (product?.pricingMode !== 'list') return undefined
  const variantTypes = product.types.map(t => ({ name: t.name, options: t.options.map(o => ({ name: o.name, additionalFee: o.fee })) }))
  const names = Object.fromEntries(product.types.map(t => [t.name, t.options.find(o => o.id === selected[t.id])?.name]))
  return Math.round(productListPrice({ basePrice: product.basePrice, variantTypes }, names).total * 100)
}
export const BULK_BANDS = [
  { min: 1, label: '<10' }, { min: 10, label: '10–19' },
  { min: 20, label: '20–49' }, { min: 50, label: '50–99' }, { min: 100, label: '100+' },
]
// Integer cents keep line totals exact. All prices are SGD per 1kg roll.
export const BULK_LADDERS = {
  PLA: { label: 'Plain PLA', material: 'PLA', cents: [1490, 1390, 1330, 1290, 1250] },
  PETG: { label: 'PETG', material: 'PETG', cents: [1390, 1340, 1280, 1240, 1200] },
  SPECIALTY_PLA: { label: 'Marble & Wood PLA', material: 'PLA', cents: [1990, 1890, 1830, 1790, 1750] },
}
export const BULK_PRICE_NOTICE = 'Indicative, final quote confirmed by owner.'
export const BULK_CONSENT = 'I consent to Fix It Today using these details to respond to this enquiry, in line with the PDPA.'
export function bulkTier(ladder, rolls) {
  if (!BULK_LADDERS[ladder] || !Number.isSafeInteger(rolls) || rolls < 1) throw Error('Invalid tier selection')
  const index = BULK_BANDS.findLastIndex(band => rolls >= band.min)
  return { band: BULK_BANDS[index].label, unitCents: BULK_LADDERS[ladder].cents[index] }
}
export const BULK_PRICING_POLICY = 'lanbo-pla-petg-1kg-v1'
export function bulkPricingContext(product) {
  return { brand: product?.brand, material: product?.material, unit: product?.unit, rollWeightGrams: product?.rollWeightGrams }
}
function tierGroup(line) {
  const material = BULK_LADDERS[line.ladder].material
  // Legacy single-material calculators cannot silently opt into a new group.
  if (line.brand == null) return { key: 'legacy:' + material, label: material }
  if (line.unit !== 'roll' || line.rollWeightGrams !== 1000 || line.material !== material) throw Error('Bulk tiers require verified 1kg rolls')
  if (line.brand === 'Lanbo') return { key: 'lanbo:PLA+PETG:1kg', label: 'Lanbo PLA + PETG' }
  if (line.brand === 'FIT' && line.ladder === 'SPECIALTY_PLA') return { key: 'fit:PLA:1kg', label: 'FIT PLA' }
  throw Error('No approved bulk tier for this brand')
}
// Combine only canonical Lanbo 1kg PLA/PETG rolls; each line keeps its own ladder.
export function priceBulkLines(lines) {
  const counts = new Map()
  for (const line of lines) {
    if (line.ladder === 'BAMBU_LIST') {
      if (!Number.isSafeInteger(line.listUnitCents) || line.listUnitCents < 0 || !Number.isSafeInteger(line.quantity) || line.quantity < 1) throw Error('Invalid list price or quantity')
      continue
    }
    if (!BULK_LADDERS[line.ladder] || !Number.isSafeInteger(line.quantity) || line.quantity < 1) throw Error('Invalid roll quantity')
    const { key } = tierGroup(line)
    const count = (counts.get(key) || 0) + line.quantity
    if (!Number.isSafeInteger(count)) throw Error('Invalid combined roll quantity')
    counts.set(key, count)
  }
  return lines.map(line => {
    if (line.ladder === 'BAMBU_LIST') return { ...line, unitCents: line.listUnitCents, band: 'List price',
      tierRolls: 0, lineCents: line.quantity * line.listUnitCents, priceNotice: BAMBU_PRICE_NOTICE }
    const group = tierGroup(line)
    const tierRolls = counts.get(group.key)
    const price = bulkTier(line.ladder, tierRolls)
    return { ...line, ...price, tierRolls, tierGroupLabel: group.label, lineCents: line.quantity * price.unitCents }
  })
}
