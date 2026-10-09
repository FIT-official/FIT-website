// Approved 9 Oct 2026: equivalent discounts from the recovered Lanbo PLA prices.
// 50/100-roll prices were provisional historically; the latest reply confirms them.
export const BULK_PRICE_TIERS = Object.freeze([
  { minQuantity: 10, maxQuantity: 19, numerator: 1390 },
  { minQuantity: 20, maxQuantity: 49, numerator: 1330 },
  { minQuantity: 50, maxQuantity: 99, numerator: 1290 },
  { minQuantity: 100, maxQuantity: null, numerator: 1250 },
])
export const BULK_PRICE_DENOMINATOR = 1490
export function bulkDiscountCategory(product) {
  const label = `${product?.name || ''} ${product?.slug || ''}`
  if (!/\blanbo\b/i.test(label) || /\bbambu[ -]*labs?\b/i.test(label)) return null
  if (product.slug === '1kg-pla-3d-printing-filament-lanbo') return 'Lanbo PLA'
  if (product.slug === '1kg-petg-3d-printing-filament-lanbo') return 'Lanbo PETG'
  return /\bsilk\b/i.test(label) && /\bfilament\b/i.test(label) ? 'Lanbo silk' : null
}
export const bulkDiscountEligible = product => !!bulkDiscountCategory(product)
export function bulkPriceSchedule(product) {
  const category = bulkDiscountCategory(product)
  return category ? { category, denominator: BULK_PRICE_DENOMINATOR, tiers: BULK_PRICE_TIERS } : null
}
export function bulkPricingQuantities(lines, catalogue) {
  const quantities = new Map()
  for (const line of lines) {
    const category = bulkDiscountCategory(catalogue.find(p => p.id === line.productId))
    const quantity = line.quantity ?? line.recordedQuantity + line.extraQuantity
    if (category && Number.isSafeInteger(quantity) && quantity > 0) quantities.set(category, (quantities.get(category) || 0) + quantity)
  }
  return quantities
}
export const bulkQuantityTier = quantity => BULK_PRICE_TIERS.find(t => quantity >= t.minQuantity && (t.maxQuantity == null || quantity <= t.maxQuantity)) || null
const cents = amount => Math.round((amount + Number.EPSILON) * 100)
export function bulkSelection(product, selections, quantity = 1, categoryQuantity = quantity) {
  const selected = product?.types.map(t => t.options.find(o => o.id === selections[t.id])) || []
  const stocks = [product?.stock, ...selected.map(o => o?.stock)]
  const known = stocks.every(v => Number.isSafeInteger(v) && v >= 0)
  const fees = selected.map(o => o?.fee)
  const amount = product?.price && fees.every(v => typeof v === 'number' && Number.isFinite(v))
    ? product.price.amount + fees.reduce((sum, fee) => sum + fee, 0) : null
  const price = amount != null && Number.isFinite(amount) && amount >= 0 && Number.isSafeInteger(cents(amount))
    ? { amount: cents(amount) / 100, currency: product.price.currency } : null
  if (!price || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000020) return { stock: known ? Math.min(...stocks) : null, price, estimate: null }
  const category = bulkDiscountCategory(product)
  const tier = category && Number.isSafeInteger(categoryQuantity) ? bulkQuantityTier(categoryQuantity) : null
  const unitCents = cents(price.amount)
  // Round the exact rational price once per unit, then multiply the displayed unit.
  const discountedUnitCents = tier ? Number((BigInt(unitCents) * BigInt(tier.numerator) + 745n) / 1490n) : unitCents
  const listCents = unitCents * quantity, totalCents = discountedUnitCents * quantity
  if (!Number.isSafeInteger(listCents) || !Number.isSafeInteger(totalCents)) return { stock: known ? Math.min(...stocks) : null, price, estimate: null }
  const money = n => ({ amount: n / 100, currency: price.currency })
  return { stock: known ? Math.min(...stocks) : null, price, estimate: {
    publicUnitPrice: price, publicLineTotal: money(listCents), discountAmount: money(listCents - totalCents),
    estimatedUnitPrice: money(discountedUnitCents), estimatedLineTotal: money(totalCents),
    appliedTier: tier ? { ...tier, denominator: BULK_PRICE_DENOMINATOR, category, categoryQuantity } : null,
  } }
}
export function bulkEstimateSummary(estimates) {
  const totals = new Map()
  let unpricedLines = 0
  for (const estimate of estimates) {
    if (!estimate) { unpricedLines++; continue }
    const currency = estimate.estimatedLineTotal.currency
    const total = totals.get(currency) || { currency, subtotal: 0, discount: 0, total: 0 }
    total.subtotal += cents(estimate.publicLineTotal.amount)
    total.discount += cents(estimate.discountAmount.amount)
    total.total += cents(estimate.estimatedLineTotal.amount)
    if (![total.subtotal,total.discount,total.total].every(Number.isSafeInteger)) return { totals: [], unpricedLines: estimates.length }
    totals.set(currency, total)
  }
  return { totals: [...totals.values()].map(t => ({ currency: t.currency, subtotal: t.subtotal / 100, discount: t.discount / 100, total: t.total / 100 })), unpricedLines }
}
