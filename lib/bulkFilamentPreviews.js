import evidence from './bulkFilamentPreviews.json'
const previews = new Map(evidence.entries.map(entry => [`${entry.productId}:${entry.optionId}`, entry]))
export function bulkColourPreview(product, option) {
  const entry = previews.get(`${product.id}:${option.id}`)
  // A changed catalogue identity must be reviewed, even when a shade name looks similar.
  if (!entry || entry.slug !== product.slug || entry.originalName !== option.name) return null
  return entry.preview
}
export const colourPreviewDisclaimer = evidence.disclaimer

// The bulk catalogue uses Sheet identities. Match only the same brand, material
// and colour; never copy catalogue prices or quantities into Sheet stock.
export function bulkSheetColourPreview(item) {
  const colour = item.colour.toLowerCase()
  const slug = item.brand === 'FIT' ? '1kg-marble-pla-3d-printing-filament-fit'
    : item.material === 'PLA' && colour === 'marble' ? '1kg-marble-pla-3d-printing-filament-lanbo'
    : `1kg-${item.material.toLowerCase()}-3d-printing-filament-lanbo`
  if (!['FIT', 'Lanbo'].includes(item.brand) || !['PLA', 'PETG'].includes(item.material)) return null
  const name = item.material === 'PLA' && colour === 'silvery' ? 'silver' : colour
  return evidence.entries.find(entry => entry.slug === slug && entry.originalName.toLowerCase() === name)?.preview || null
}
