import { createHash } from 'node:crypto'
import { productVariantLabel } from './productVariantLabel'
import { bulkColourPreview } from './bulkFilamentPreviews'
import { BAMBU_PRICE_NOTICE } from './bulkFilamentConfig'
import { bulkCombinationKey } from './bulkFilamentSelection'

const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0
const normal = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
const code = value => String(value || '').match(/\b\d{5}\b/)?.[0]
const spoolName = value => /\bwithout spool\b/i.test(value) ? 'without spool' : /\bwith spool\b/i.test(value) ? 'with spool' : null
const families = { 'pla-basic': 'PLA Basic', 'pla-matte': 'PLA Matte', 'pla-basic-gradient': 'PLA Basic Gradient',
  'pla-lite': 'PLA Lite', abs: 'ABS', asa: 'ASA', 'pva-support': 'PVA Support', 'petg-basic': 'PETG Basic',
  'pla-glow': 'PLA Glow', 'pla-wood': 'PLA Wood', 'pla-silk': 'PLA Silk+', 'pla-tough': 'PLA Tough+' }
export const isBambuFilament = p => /^bambu-lab-3d-printing-filament-(?:1kg|0-?5kg)-/.test(p.slug || '')

// Keep current public shop identities and prices. The Sheet is authoritative
// for matched families; never infer a colour/spool pair from separate totals.
export function bambuBulkCatalogue(products, stock, checkedAt = stock.checkedAt || new Date().toISOString()) {
  return products.filter(isBambuFilament).map(p => {
    const family = families[p.slug.replace(/^bambu-lab-3d-printing-filament-(?:1kg|0-?5kg)-/, '')]
    const sheetRows = (stock.rows || []).filter(row => {
      if (normal(row.brand).replace(/\s/g, '') !== 'bambulab') return false
      const product = normal(row.slug || row.product)
      return [normal(p.slug), normal(p.name), normal(`Bambu Lab ${family}`)].includes(product) ||
        (family === 'ASA' && normal(row.material) === 'asa' && /^asa (?:gray|grey|white|black) \d{5}$/.test(product))
    })
    const sheetTracked = sheetRows.length > 0 || (stock.source === 'sheet' && family && family !== 'PVA Support')
    const rowMatches = (row, option) => code(option.name) ? code(row.colour + ' ' + row.product) === code(option.name) : normal(row.colour) === normal(option.name)
    const quantity = rows => {
      // Duplicate barcode records describe the same stock, not extra rolls.
      const unique = new Map()
      rows.forEach(row => {
        const key = row.barcode || `${normal(row.product)}:${normal(row.colour)}`
        unique.set(key, Math.min(unique.get(key) ?? Infinity, count(row.quantity)))
      })
      return [...unique.values()].reduce((sum, n) => sum + n, 0)
    }
    const types = (p.variantTypes || []).map(t => {
      const label = productVariantLabel(p, t)
      return { id: String(t._id), name: t.name, label, options: t.options.map(o => {
        const matches = /^(colour|color)$/i.test(label) ? sheetRows.filter(r => rowMatches(r, o)) : []
        const option = { id: String(o._id), name: o.name, fee: o.additionalFee ?? 0,
          stock: sheetTracked && /^(colour|color)$/i.test(label) ? quantity(matches) : count(o.stock),
          stockSource: sheetTracked && /^(colour|color)$/i.test(label) ? stock.source : 'shop', ladder: 'BAMBU_LIST' }
        return { ...option, preview: /^(colour|color)$/i.test(label) ? bulkColourPreview({ id: String(p._id), slug: p.slug }, option) : null }
      }) }
    })
    const colour = types.find(t => /^(colour|color)$/i.test(t.label)), spool = types.find(t => /^spool$/i.test(t.label))
    if (!colour || !types.length || types.some(t => !t.options.length) || p.quoteOnly ||
        p.basePrice?.presentmentCurrency !== 'SGD' || !Number.isFinite(p.basePrice?.presentmentAmount) || p.basePrice.presentmentAmount < 0 ||
        types.some(t => t.options.some(o => !Number.isFinite(o.fee)))) throw Error('Bambu catalogue needs current variant prices')
    let combinationStock
    if (sheetTracked && spool) {
      combinationStock = {}
      for (const c of colour.options) {
        c.stock = 0
        for (const s of spool.options) {
          const n = quantity(sheetRows.filter(row => rowMatches(row, c) && spoolName(row.colour) === spoolName(s.name)))
          combinationStock[bulkCombinationKey({ [colour.id]: c.id, [spool.id]: s.id })] = n
          c.stock += n
        }
      }
      for (const s of spool.options) {
        s.stock = colour.options.reduce((sum, c) => sum + combinationStock[bulkCombinationKey({ [colour.id]: c.id, [spool.id]: s.id })], 0)
        s.stockSource = stock.source
      }
    }
    const stockSource = sheetTracked ? stock.source : 'shop'
    // PVA's approved net pack size does not change price, stock, slug or gross shipping weight.
    const name = p._id?.toString() === '6aa8eae9a1ca543d895a4921' ? p.name.replace(/\b1kg\b/, '0.5kg') : p.name
    const product = { id: String(p._id), name, slug: p.slug, brand: 'Bambu Lab',
      material: p.name.match(/\b(PLA|PETG|ABS|ASA|PVA)\b/)?.[1] || '',
      stock: sheetTracked ? colour.options.reduce((n, o) => n + o.stock, 0) : count(p.stock),
      types, colourTypeId: colour.id, basePrice: p.basePrice, pricingMode: 'list',
      ...(combinationStock ? { combinationStock } : {}),
      priceNotice: BAMBU_PRICE_NOTICE, stockSource, inventorySource: stockSource, inventoryCheckedAt: checkedAt }
    return { ...product, version: createHash('sha256').update(JSON.stringify({ ...product, inventoryCheckedAt: undefined })).digest('hex') }
  }).sort((a, b) => a.name.localeCompare(b.name))
}
