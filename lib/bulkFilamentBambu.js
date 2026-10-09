import { createHash } from 'node:crypto'
import { productVariantLabel } from './productVariantLabel'
import { bulkColourPreview } from './bulkFilamentPreviews'
import { BAMBU_PRICE_NOTICE } from './bulkFilamentConfig'

const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0
const normal = value => String(value || '').trim().toLowerCase()
export const isBambuFilament = p => /^bambu-lab-3d-printing-filament-1kg-/.test(p.slug || '')

// Shop records provide identities and prices. Exact Sheet product/colour matches
// override colour stock; unmatched colours retain their current shop stock.
export function bambuBulkCatalogue(products, stock, checkedAt = new Date().toISOString()) {
  return products.filter(isBambuFilament).map(p => {
    const sheetRows = (stock.rows || []).filter(row =>
      normal(row.brand) === 'bambu lab' &&
      [normal(p.slug), normal(p.name)].includes(normal(row.slug || row.product)))
    const types = (p.variantTypes || []).map(t => {
      const label = productVariantLabel(p, t)
      return { id: String(t._id), name: t.name, label, options: t.options.map(o => {
        const matches = /^(colour|color)$/i.test(label) ? sheetRows.filter(r => normal(r.colour) === normal(o.name)) : []
        const option = { id: String(o._id), name: o.name, fee: o.additionalFee || 0,
          stock: matches.length ? Math.min(...matches.map(r => count(r.quantity))) : count(o.stock),
          stockSource: matches.length ? stock.source : 'shop', ladder: 'BAMBU_LIST' }
        return { ...option, preview: /^(colour|color)$/i.test(label) ? bulkColourPreview({ id: String(p._id), slug: p.slug }, option) : null }
      }) }
    })
    const colour = types.find(t => /^(colour|color)$/i.test(t.label))
    if (!colour || !types.length || types.some(t => !t.options.length) || p.quoteOnly ||
        p.basePrice?.presentmentCurrency !== 'SGD' || !Number.isFinite(p.basePrice?.presentmentAmount) ||
        types.some(t => t.options.some(o => !Number.isFinite(o.fee)))) throw Error('Bambu catalogue needs current variant prices')
    const sources = new Set(colour.options.map(o => o.stockSource))
    const stockSource = sources.size === 1 ? [...sources][0] : 'mixed'
    const product = { id: String(p._id), name: p.name, slug: p.slug, brand: 'Bambu Lab',
      material: p.name.match(/\b(PLA|PETG|ABS|ASA|PVA)\b/)?.[1] || '',
      stock: stockSource === 'shop' ? count(p.stock) : colour.options.reduce((n, o) => n + o.stock, 0),
      types, colourTypeId: colour.id, basePrice: p.basePrice, pricingMode: 'list',
      priceNotice: BAMBU_PRICE_NOTICE, stockSource, inventorySource: stockSource,
      inventoryCheckedAt: checkedAt }
    return { ...product, version: createHash('sha256').update(JSON.stringify({ ...product, inventoryCheckedAt: undefined })).digest('hex') }
  }).sort((a, b) => a.name.localeCompare(b.name))
}
