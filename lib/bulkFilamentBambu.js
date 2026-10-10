import { createHash } from 'node:crypto'
import { productVariantLabel } from './productVariantLabel'
import { bulkColourPreview } from './bulkFilamentPreviews'
import { BAMBU_PRICE_NOTICE } from './bulkFilamentConfig'
import { bulkCombinationKey } from './bulkFilamentSelection'

const validCount = value => Number.isSafeInteger(value) && value >= 0
const count = value => validCount(value) ? value : 0
const normal = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
const code = value => String(value || '').match(/\b\d{5}\b/)?.[0]
const spoolName = value => /\bwithout spool\b/i.test(value) ? 'without spool' : /\bwith spool\b/i.test(value) ? 'with spool' : null
const rowCode = row => {
  const codes = [...new Set(`${row.colour || ''} ${row.product || ''}`.match(/\b\d{5}\b/g) || [])]
  return codes.length === 1 ? codes[0] : null
}
const rowSpool = row => {
  const names = [...new Set(`${row.colour || ''} ${row.product || ''}`.toLowerCase().match(/\b(?:with|without) spool\b/g) || [])]
  return names.length > 1 ? 'ambiguous' : names[0] || null
}
const families = { 'pla-basic': 'PLA Basic', 'pla-matte': 'PLA Matte', 'pla-basic-gradient': 'PLA Basic Gradient',
  'pla-lite': 'PLA Lite', abs: 'ABS', asa: 'ASA', 'pva-support': 'PVA Support', 'petg-basic': 'PETG Basic',
  'pla-glow': 'PLA Glow', 'pla-wood': 'PLA Wood', 'pla-silk': 'PLA Silk+', 'pla-tough': 'PLA Tough+' }
export const isBambuFilament = p => /^bambu-lab-3d-printing-filament-(?:1kg|0-?5kg)-/.test(p.slug || '')

// Each Sheet identity supplies at most one row. Its quantity and the shop
// colour total are independent upper bounds, shared across all request lines.
// Issues contain identifiers only; the HTTP loader logs them server-side.
export function bambuBulkCatalogue(products, stock, checkedAt = stock.checkedAt || new Date().toISOString(), stockIssues = []) {
  return products.filter(isBambuFilament).map(p => {
    const family = families[p.slug.replace(/^bambu-lab-3d-printing-filament-(?:1kg|0-?5kg)-/, '')]
    const sheetRows = (stock.rows || []).filter(row => {
      if (normal(row.brand).replace(/\s/g, '') !== 'bambulab') return false
      const product = normal(row.slug || row.product)
      const shortName = family && product.startsWith(`${normal(family)} `) &&
        /^[a-z][a-z ]* \d{5}$/.test(product.slice(family.length + 1))
      return [normal(p.slug), normal(p.name), normal(`Bambu Lab ${family}`)].includes(product) ||
        (shortName && normal(row.material) === normal(family))
    })
    const sheetTracked = family !== 'PVA Support'
    const rowMatches = (row, option) => code(option.name) ? rowCode(row) === code(option.name) : normal(row.colour) === normal(option.name)
    const quantity = (option, spool) => {
      const rows = sheetRows.filter(row => rowMatches(row, option) && rowSpool(row) !== 'ambiguous' &&
        (!spool || rowSpool(row) === spoolName(spool.name)))
      if (rows.length !== 1) {
        stockIssues.push({ productId: String(p._id), colourCode: code(option.name) || null,
          spool: spool ? spoolName(spool.name) : null, kind: rows.length ? 'duplicate_sheet_identity' : 'missing_sheet_identity', rowCount: rows.length })
        return { amount: 0, verified: false }
      }
      return { amount: count(rows[0].quantity), verified: validCount(rows[0].quantity) }
    }
    const types = (p.variantTypes || []).map(t => {
      const label = productVariantLabel(p, t)
      return { id: String(t._id), name: t.name, label, options: t.options.map(o => {
        const option = { id: String(o._id), name: o.name, fee: o.additionalFee ?? 0,
          stock: count(o.stock), stockVerified: validCount(o.stock),
          ...(sheetTracked && /^(colour|color)$/i.test(label) ? { shopStock: count(o.stock) } : {}),
          stockSource: sheetTracked && /^(colour|color)$/i.test(label) ? stock.source : 'shop', ladder: 'BAMBU_LIST' }
        return { ...option, preview: /^(colour|color)$/i.test(label) ? bulkColourPreview({ id: String(p._id), slug: p.slug }, option) : null }
      }) }
    })
    const colour = types.find(t => /^(colour|color)$/i.test(t.label)), spool = types.find(t => /^spool$/i.test(t.label))
    if (!colour || !types.length || types.some(t => !t.options.length) || p.quoteOnly ||
        p.basePrice?.presentmentCurrency !== 'SGD' || !Number.isFinite(p.basePrice?.presentmentAmount) || p.basePrice.presentmentAmount < 0 ||
        types.some(t => t.options.some(o => !Number.isFinite(o.fee)))) throw Error('Bambu catalogue needs current variant prices')
    let combinationStock
    const unverifiedCombinations = []
    if (sheetTracked) {
      if (spool) combinationStock = {}
      for (const c of colour.options) {
        c.sheetQuantity = 0
        if (spool) {
          for (const s of spool.options) {
            const n = quantity(c, s), key = bulkCombinationKey({ [colour.id]: c.id, [spool.id]: s.id })
            combinationStock[key] = Math.min(n.amount, c.shopStock)
            if (!n.verified) unverifiedCombinations.push(key)
            c.sheetQuantity += n.amount
          }
        } else {
          const n = quantity(c)
          c.sheetQuantity = n.amount
          c.stockVerified = c.stockVerified && n.verified
        }
        c.stock = Math.min(c.sheetQuantity, c.shopStock)
      }
      for (const s of spool?.options || []) {
        s.stock = colour.options.reduce((sum, c) => sum + combinationStock[bulkCombinationKey({ [colour.id]: c.id, [spool.id]: s.id })], 0)
        s.stockSource = stock.source
        s.stockVerified = true
      }
    }
    const stockSource = sheetTracked ? stock.source : 'shop'
    // PVA's approved net pack size does not change price, stock, slug or gross shipping weight.
    const name = p._id?.toString() === '6aa8eae9a1ca543d895a4921' ? p.name.replace(/\b1kg\b/, '0.5kg') : p.name
    const product = { id: String(p._id), name, slug: p.slug, brand: 'Bambu Lab',
      material: p.name.match(/\b(PLA|PETG|ABS|ASA|PVA)\b/)?.[1] || '',
      stockVerified: sheetTracked || validCount(p.stock),
      stock: sheetTracked ? colour.options.reduce((n, o) => n + o.stock, 0) : count(p.stock),
      types, colourTypeId: colour.id, basePrice: p.basePrice, pricingMode: 'list',
      ...(sheetTracked ? { stockPolicy: 'sheet-shop-min' } : {}),
      ...(combinationStock ? { combinationStock, unverifiedCombinations } : {}),
      priceNotice: BAMBU_PRICE_NOTICE, stockSource, inventorySource: stockSource, inventoryCheckedAt: checkedAt }
    return { ...product, version: createHash('sha256').update(JSON.stringify({ ...product, inventoryCheckedAt: undefined })).digest('hex') }
  }).sort((a, b) => a.name.localeCompare(b.name))
}
