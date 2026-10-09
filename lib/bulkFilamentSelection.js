// Shared browser/server stock constraints. Missing combinations are unavailable;
// independent colour/spool totals must never imply a stocked combination.
export const bulkCombinationKey = options => Object.entries(options).sort(([a], [b]) => a.localeCompare(b)).map(([type, option]) => `${type}:${option}`).join('|')
export function bulkSelectionStock(product, selected, lines = [], exclude = -1) {
  if (!product) return 0
  const count = n => Number.isSafeInteger(n) && n >= 0 ? n : 0
  const others = lines.filter((line, i) => i !== exclude && line.productId === product.id)
  const constraints = [count(product.stock) - others.reduce((n, line) => n + count(line.quantity), 0)]
  for (const type of product.types) {
    const option = type.options.find(o => o.id === selected[type.id])
    constraints.push(count(option?.stock) - others.filter(line => line.options.some(o => o.typeId === type.id && o.optionId === option?.id)).reduce((n, line) => n + count(line.quantity), 0))
  }
  if (product.combinationStock) {
    const key = bulkCombinationKey(selected)
    constraints.push(count(product.combinationStock[key]) - others.filter(line => bulkCombinationKey(Object.fromEntries(line.options.map(o => [o.typeId, o.optionId]))) === key).reduce((n, line) => n + count(line.quantity), 0))
  }
  return Math.max(0, Math.min(...constraints))
}
