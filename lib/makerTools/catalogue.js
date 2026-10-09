import { COLOURS } from './colours'
import { bulkColourPreview } from '@/lib/bulkFilamentPreviews'
import { bulkSelectionStock } from '@/lib/bulkFilamentSelection'

const normalizeName = name => name.replace(/\s*\(\d{5}\)\s*$/, '').replace('Blue Gray', 'Blue Grey').trim()
export function makerCatalogue(products) {
  return products.filter(p => p.brand === 'Bambu Lab' && p.slug === 'bambu-lab-3d-printing-filament-1kg-pla-basic').flatMap(p => {
    const colourType = p.types.find(t => t.id === p.colourTypeId)
    const spoolType = p.types.find(t => /^spool$/i.test(t.label))
    if (!colourType || !spoolType || p.types.length !== 2) return []
    return colourType.options.flatMap(option => {
      const preview = bulkColourPreview(p, option)
      const reference = preview && COLOURS.find(c => c.name === normalizeName(preview.label))
      if (!reference || !['verified_official_variant_photo', 'official_source_code_discrepancy'].includes(preview.status)) return []
      return spoolType.options.flatMap(spool => {
        const format = /^without spool$/i.test(spool.name) ? 'refill' : /^with spool$/i.test(spool.name) ? 'spool' : null
        if (!format) return []
        const options = { [colourType.id]: option.id, [spoolType.id]: spool.id }
        // Aggregate option totals do not establish a colour/package combination.
        const verifiedStock = ['sheet', 'shop'].includes(p.stockSource) && !!p.combinationStock
        return [{ referenceId: reference.id, productId: p.id, optionId: option.id, optionName: option.name,
          slug: p.slug, href: '/products/' + encodeURIComponent(p.slug), format, netGrams: 1000,
          availableRolls: verifiedStock ? bulkSelectionStock(p, options) : null,
          stockSource: p.stockSource, checkedAt: p.inventoryCheckedAt || null,
          preview, identityNote: preview.status === 'official_source_code_discrepancy' ? 'Blue code differs across official sources; check product code before ordering.' : null }]
      })
    })
  })
}
