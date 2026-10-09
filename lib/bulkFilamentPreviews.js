import evidence from './bulkFilamentPreviews.json'
const previews = new Map(evidence.entries.map(entry => [`${entry.productId}:${entry.optionId}`, entry]))
export function bulkColourPreview(product, option) {
  const entry = previews.get(`${product.id}:${option.id}`)
  // A changed catalogue identity must be reviewed, even when a shade name looks similar.
  if (!entry || entry.slug !== product.slug || entry.originalName !== option.name) return null
  return entry.preview
}
export const colourPreviewDisclaimer = evidence.disclaimer
