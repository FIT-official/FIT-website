// Recorded stock stays separate from the nonbinding enquiry allowance.
// Every shared constraint receives the allowance once, before other lines are
// deducted, so split lines/colours/spool choices cannot multiply it.
export const BULK_EXTRA_REQUEST_ROLLS = 20
export const bulkCombinationKey = options => Object.entries(options).sort(([a], [b]) => a.localeCompare(b)).map(([type, option]) => `${type}:${option}`).join('|')
const validCount = n => Number.isSafeInteger(n) && n >= 0
const count = n => validCount(n) ? n : 0
export function bulkOptionStock(product, typeId, option) {
  if (product.stockPolicy === 'sheet-shop-min' && typeId === product.colourTypeId) {
    return Math.min(count(option?.stock), count(option?.sheetQuantity), count(option?.shopStock))
  }
  return count(option?.stock)
}
function remaining(product, selected, lines, exclude, allowance) {
  if (!product) return 0
  const others = lines.filter((line, i) => i !== exclude && line.productId === product.id)
  const constraints = [count(product.stock) + allowance - others.reduce((n, line) => n + count(line.quantity), 0)]
  for (const type of product.types) {
    const option = type.options.find(o => o.id === selected[type.id])
    if (!option) return 0
    constraints.push(bulkOptionStock(product, type.id, option) + allowance - others.filter(line => line.options.some(o => o.typeId === type.id && o.optionId === option.id)).reduce((n, line) => n + count(line.quantity), 0))
  }
  if (product.combinationStock) {
    const key = bulkCombinationKey(selected)
    if (!Object.hasOwn(product.combinationStock, key)) return 0
    constraints.push(count(product.combinationStock[key]) + allowance - others.filter(line => bulkCombinationKey(Object.fromEntries(line.options.map(o => [o.typeId, o.optionId]))) === key).reduce((n, line) => n + count(line.quantity), 0))
  }
  return Math.max(0, Math.min(...constraints))
}
export function bulkSelectionStock(product, selected, lines = [], exclude = -1) {
  return remaining(product, selected, lines, exclude, 0)
}
export function bulkSelectionLimit(product, selected, lines = [], exclude = -1) {
  // A known zero is enquiry-only, never stocked. Missing/ambiguous source
  // identities and malformed quantities cannot acquire a +20 allowance.
  if (!product || !validCount(product.stock) || product.stockVerified === false) return 0
  for (const type of product.types) {
    const option = type.options.find(o => o.id === selected[type.id])
    if (!option || !validCount(option.stock) || option.stockVerified === false) return 0
    if (product.stockPolicy === 'sheet-shop-min' && type.id === product.colourTypeId &&
      (!validCount(option.sheetQuantity) || !validCount(option.shopStock))) return 0
  }
  const key = bulkCombinationKey(selected)
  if (product.unverifiedCombinations?.includes(key) ||
    (product.combinationStock && !validCount(product.combinationStock[key]))) return 0
  return remaining(product, selected, lines, exclude, BULK_EXTRA_REQUEST_ROLLS)
}
