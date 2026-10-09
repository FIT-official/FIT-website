import { createHash } from 'node:crypto'
import { bulkColourPreview } from './bulkFilamentPreviews'
import { bulkPriceSchedule, bulkPricingQuantities, bulkDiscountCategory, bulkSelection, bulkEstimateSummary } from './bulkFilamentPricing'
import { productVariantLabel } from './productVariantLabel'
import { isPublicCatalogueProduct, NON_PUBLIC_PRODUCT_SLUGS } from './productPublicContent'

export const MAX_EXTRA = 20
export const MAX_LINES = 50
export const BULK_FILTER = {
  productType: 'shop', hidden: false, flaggedForModeration: { $ne: true },
  slug: { $nin: NON_PUBLIC_PRODUCT_SLUGS },
  $and: [
    { $or: [{ listing: 'fit' }, { listing: { $exists: false } }] },
    { $or: [{ categoryId: /^filament$/i }, { categoryId: { $exists: false }, category: 1 }] },
  ],
}
export const BULK_PROJECTION = '_id name slug productType listing hidden flaggedForModeration category categoryId subcategoryId basePrice stock infiniteStock quoteOnly variantTypes'
export function bulkFail(message, status = 400, code = 'invalid_request') {
  throw Object.assign(new Error(message), { status, code })
}
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const objectId = value => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value)
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null
const text = (value, name, maximum, required = false) => {
  if (value == null && !required) return ''
  if (typeof value !== 'string' || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) bulkFail(`Check ${name}.`)
  const result = value.trim()
  if (required && !result) bulkFail(`Enter ${name}.`)
  return result
}
function catalogueRank(p) {
  if (p.slug === '1kg-pla-3d-printing-filament-lanbo') return 0
  if (p.slug === '1kg-petg-3d-printing-filament-lanbo') return 1
  return 2
}
export function bulkCatalogue(products) {
  return products.filter(p => isPublicCatalogueProduct(p) && p.productType === 'shop' &&
    (!p.listing || p.listing === 'fit') && (/^filament$/i.test(p.categoryId || '') || (!p.categoryId && p.category === 1)))
    .flatMap(p => {
      const types = (p.variantTypes || []).map(t => ({
        id: String(t._id), name: t.name, label: productVariantLabel(p, t),
        options: (t.options || []).map(o => ({ id: String(o._id), name: o.name,
          stock: count(o.stock), fee: typeof o.additionalFee === 'number' && Number.isFinite(o.additionalFee) ? o.additionalFee : null })),
      }))
      // Unclassified colours or invalid identities cannot safely use a per-colour allowance.
      const colourTypes = types.filter(t => /^(colour|color)$/i.test(t.label))
      if (colourTypes.length !== 1 || types.length > 5 || types.some(t => !objectId(t.id) || !t.options.length || t.options.some(o => !objectId(o.id)))) return []
      const amount = p.basePrice?.presentmentAmount, currency = p.basePrice?.presentmentCurrency
      const product = { id: String(p._id), name: p.name, slug: p.slug, material: p.subcategoryId || '',
        stock: p.infiniteStock ? null : count(p.stock), types, colourTypeId: colourTypes[0].id,
        pricingSchedule: bulkPriceSchedule(p),
        price: !p.quoteOnly && typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 && /^[A-Z]{3}$/.test(currency || '')
          ? { amount, currency } : null }
      return [{ ...product, version: hash(product), types: types.map(t => t.id !== product.colourTypeId ? t : { ...t, options: t.options.map(o => ({ ...o, preview: bulkColourPreview(product, o) })) }) }]
    }).sort((a, b) => catalogueRank(a) - catalogueRank(b) || a.name.localeCompare(b.name))
}
export function parseBulkInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) bulkFail('Send a request object.')
  if (typeof body.clientRequestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.clientRequestId)) bulkFail('Refresh the form before submitting.')
  if (body.confirmReview !== true) bulkFail('Confirm that availability and the final quotation need owner review.')
  const customer = {
    name: text(body.customer?.name, 'your name', 120, true),
    email: text(body.customer?.email, 'your email', 254, true).toLowerCase(),
    phone: text(body.customer?.phone, 'your phone number', 40, true),
    organisation: text(body.customer?.organisation, 'organisation', 160),
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email) || /[\r\n]/.test(customer.email)) bulkFail('Enter a valid email address.')
  if (!/^[+()\d .-]{6,40}$/.test(customer.phone)) bulkFail('Enter a valid phone number.')
  if (!['collection', 'delivery'].includes(body.fulfilment)) bulkFail('Choose collection or delivery enquiry.')
  const address = text(body.address, 'delivery address', 1000, body.fulfilment === 'delivery')
  if (!Array.isArray(body.lines) || !body.lines.length || body.lines.length > MAX_LINES) bulkFail('Choose between 1 and 50 filament lines.')
  const lines = body.lines.map(line => {
    if (!objectId(line?.productId) || !/^[a-f0-9]{64}$/.test(line?.version || '')) bulkFail('Choose a current catalogue product.')
    if (!Array.isArray(line.options) || !line.options.length || line.options.length > 5 ||
        line.options.some(o => !objectId(o?.typeId) || !objectId(o?.optionId))) bulkFail('Choose valid product options.')
    if (new Set(line.options.map(o => o.typeId)).size !== line.options.length) bulkFail('Choose each option once.')
    const totalMode = Object.hasOwn(line, 'quantity')
    if (totalMode && (count(line.quantity) == null || line.quantity < 1 || line.quantity > 1000020 || Object.hasOwn(line, 'recordedQuantity') || Object.hasOwn(line, 'extraQuantity'))) bulkFail('Enter a whole quantity of at least one roll.')
    if (!totalMode && (count(line.recordedQuantity) == null || count(line.extraQuantity) == null || line.extraQuantity > MAX_EXTRA ||
        line.recordedQuantity > 1000000 || line.recordedQuantity + line.extraQuantity < 1)) bulkFail('Use whole roll quantities and at most 20 extra rolls per colour.')
    return { productId: line.productId.toLowerCase(), version: line.version,
      options: line.options.map(o => ({ typeId: o.typeId.toLowerCase(), optionId: o.optionId.toLowerCase() })).sort((a,b) => a.typeId.localeCompare(b.typeId)),
      ...(totalMode ? { quantity: line.quantity } : { recordedQuantity: line.recordedQuantity, extraQuantity: line.extraQuantity }),
      remarks: text(line.remarks, 'item remarks', 500) }
  }).sort((a,b) => (a.productId + JSON.stringify(a.options)).localeCompare(b.productId + JSON.stringify(b.options)))
  if (lines.some(l => Object.hasOwn(l, 'quantity')) && lines.some(l => !Object.hasOwn(l, 'quantity'))) bulkFail('Use one quantity format for the request.')
  const keys = lines.map(l => l.productId + JSON.stringify(l.options))
  if (lines.some(l => !Object.hasOwn(l, 'quantity')) && new Set(keys).size !== keys.length) bulkFail('Combine duplicate product options into one line.')
  return { clientRequestId: body.clientRequestId.toLowerCase(), customer, fulfilment: body.fulfilment,
    address: body.fulfilment === 'delivery' ? address : '', notes: text(body.notes, 'notes', 2000), lines, confirmReview: true }
}
export const bulkFingerprint = input => hash(input)
export function prepareBulkLines(input, catalogue) {
  const rows = input.lines.every(l => Object.hasOwn(l, 'quantity')) ? prepareTotalLines(input, catalogue) : prepareLegacyLines(input, catalogue)
  const categoryQuantities = bulkPricingQuantities(rows, catalogue)
  return rows.map(row => {
    const product = catalogue.find(p => p.id === row.productId)
    const quantity = row.quantity ?? row.recordedQuantity + row.extraQuantity
    const { estimate } = bulkSelection(product, Object.fromEntries(row.options.map(o => [o.typeId, o.optionId])), quantity, categoryQuantities.get(bulkDiscountCategory(product)))
    return { ...row, ...(estimate || { estimatedUnitPrice: null, estimatedLineTotal: null, discountAmount: null, appliedTier: null }) }
  })
}
function prepareLegacyLines(input, catalogue) {
  const byId = new Map(catalogue.map(p => [p.id, p]))
  const stockUse = new Map(), extras = new Map()
  const claimStock = (key, quantity, maximum) => {
    const total = (stockUse.get(key) || 0) + quantity
    if (total > (maximum ?? 0)) bulkFail('Recorded stock changed or a shared stock limit was exceeded. Review quantities and refresh inventory.', 409, 'inventory_changed')
    stockUse.set(key, total)
  }
  return input.lines.map(line => {
    const p = byId.get(line.productId)
    if (!p || p.version !== line.version) bulkFail('Inventory or public prices changed. Refresh inventory and review your request.', 409, 'inventory_changed')
    if (line.options.length !== p.types.length) bulkFail('Select every product option.')
    const options = p.types.map(t => {
      const selected = line.options.find(o => o.typeId === t.id)
      const o = t.options.find(o => o.id === selected?.optionId)
      if (!o) bulkFail('A selected option does not belong to this product.')
      return { typeId: t.id, type: t.label, storedType: t.name, optionId: o.id, name: o.name, recordedStock: o.stock, fee: o.fee }
    })
    const colour = options.find(o => o.typeId === p.colourTypeId)
    const material = options.filter(o => /^material$/i.test(o.type)).map(o => o.optionId).join(':')
    const extraKey = p.id + ':' + material + ':' + colour.optionId
    const extraTotal = (extras.get(extraKey) || 0) + line.extraQuantity
    if (extraTotal > MAX_EXTRA) bulkFail('Extra rolls are limited to 20 per product, material and colour, shared across spool options.')
    extras.set(extraKey, extraTotal)
    claimStock(p.id, line.recordedQuantity, p.stock)
    for (const o of options) claimStock(p.id + ':' + o.optionId, line.recordedQuantity, o.recordedStock)
    const unit = p.price && options.every(o => o.fee != null) ? p.price.amount + options.reduce((n,o) => n + o.fee, 0) : null
    return { productId: p.id, productName: p.name, slug: p.slug, material: p.material, colour: colour.name,
      options, version: p.version, recordedProductStock: p.stock,
      recordedQuantity: line.recordedQuantity, extraQuantity: line.extraQuantity, remarks: line.remarks,
      publicUnitPrice: unit != null && Number.isFinite(unit) && unit >= 0 ? { amount: Math.round(unit * 100) / 100, currency: p.price.currency } : null }
  })
}
// Allocate only recorded stock internally. Total quantities remain customer-authored.
// First satisfy each colour's required recorded portion so a small enquiry cannot
// consume stock needed by another colour and incorrectly exhaust its allowance.
function prepareTotalLines(input, catalogue) {
  const rows = input.lines.map(line => {
    const p = catalogue.find(p => p.id === line.productId)
    if (!p || p.version !== line.version) bulkFail('Inventory or public prices changed. Refresh inventory and review your request.', 409, 'inventory_changed')
    if (line.options.length !== p.types.length) bulkFail('Select every product option.')
    const options = p.types.map(t => {
      const o = t.options.find(o => o.id === line.options.find(s => s.typeId === t.id)?.optionId)
      if (!o) bulkFail('A selected option does not belong to this product.')
      return { typeId: t.id, type: t.label, storedType: t.name, optionId: o.id, name: o.name, recordedStock: o.stock, fee: o.fee }
    })
    const colour = options.find(o => o.typeId === p.colourTypeId)
    const material = options.filter(o => /^material$/i.test(o.type)).map(o => o.optionId).join(':')
    return { line, p, options, colour, group: p.id + ':' + material + ':' + colour.optionId, recorded: 0,
      stocks: [[p.id, p.stock], ...options.map(o => [p.id + ':' + o.optionId, o.recordedStock])] }
  })
  const used = new Map(), groups = new Map()
  const available = row => Math.max(0, Math.min(...row.stocks.map(([key, stock]) => (stock ?? 0) - (used.get(key) || 0))))
  const allocate = (row, wanted) => {
    const n = Math.min(wanted, row.line.quantity - row.recorded, available(row))
    row.recorded += n
    row.stocks.forEach(([key]) => used.set(key, (used.get(key) || 0) + n))
    return n
  }
  for (const row of rows) { if (!groups.has(row.group)) groups.set(row.group, []); groups.get(row.group).push(row) }
  for (const group of groups.values()) {
    let required = Math.max(0, group.reduce((n,r) => n + r.line.quantity, 0) - MAX_EXTRA)
    for (const row of [...group].sort((a,b) => available(a) - available(b))) required -= allocate(row, required)
    if (required > 0) for (const row of group) {
      for (const [key] of row.stocks) {
        for (const donor of rows.filter(r => r.group !== row.group && r.recorded > 0 && r.stocks.some(([k]) => k === key))) {
          for (const alternative of groups.get(donor.group).filter(r => !r.stocks.some(([k]) => k === key))) {
            const moved = Math.min(required, donor.recorded, alternative.line.quantity - alternative.recorded, ...alternative.stocks.map(([k, stock]) => (stock ?? 0) - (used.get(k) || 0) + (donor.stocks.some(([d]) => d === k) ? donor.recorded : 0)))
            if (moved <= 0) continue
            donor.recorded -= moved
            donor.stocks.forEach(([k]) => used.set(k, used.get(k) - moved))
            allocate(alternative, moved)
          }
        }
      }
      required -= allocate(row, required)
      if (!required) break
    }
    if (required > 0) bulkFail('Requested quantity exceeds current availability for a selected colour. Review quantities and refresh inventory.', 409, 'inventory_changed')
  }
  for (const row of rows) allocate(row, row.line.quantity - row.recorded)
  return rows.map(({line,p,options,colour,recorded}) => {
    // Preserve the normal public list price alongside the approved estimate.
    // Eligibility and discount arithmetic are rebuilt by prepareBulkLines.
    const unit = p.price && options.every(o => o.fee != null) ? p.price.amount + options.reduce((n,o) => n + o.fee, 0) : null
    const publicUnitPrice = unit != null && Number.isFinite(unit) && unit >= 0 ? { amount: Math.round(unit * 100) / 100, currency: p.price.currency } : null
    return { productId: p.id, productName: p.name, slug: p.slug, material: p.material, colour: colour.name,
      options, version: p.version, recordedProductStock: p.stock, quantity: line.quantity,
      recordedQuantity: recorded, extraQuantity: line.quantity - recorded, remarks: line.remarks, publicUnitPrice,
      publicLineTotal: publicUnitPrice ? { amount: Math.round(publicUnitPrice.amount * line.quantity * 100) / 100, currency: publicUnitPrice.currency } : null }
  })
}
export function bulkReceipt(doc) {
  return { requestId: doc._id, status: doc.status, submittedAt: doc.createdAt,
    totalRolls: doc.lines.reduce((n,l) => n + (l.quantity ?? l.recordedQuantity + l.extraQuantity), 0),
    recordedRolls: doc.lines.reduce((n,l) => n + l.recordedQuantity, 0),
    extraRolls: doc.lines.reduce((n,l) => n + l.extraQuantity, 0), notificationCoverage: 'owner_dashboard_only',
    ...(doc.estimatedTotals ? { estimatedTotals: doc.estimatedTotals } : {}) }
}
export async function saveBulkRequest(store, input, loadCatalogue, now = new Date()) {
  const fingerprint = bulkFingerprint(input)
  const existing = await store.findOne({ _id: input.clientRequestId })
  const replay = doc => {
    if (doc.fingerprint !== fingerprint) bulkFail('This request reference already belongs to a different submission. Start a new request.', 409, 'idempotency_conflict')
    return { receipt: bulkReceipt(doc), created: false }
  }
  if (existing) return replay(existing)
  const catalogue = await loadCatalogue()
  const lines = prepareBulkLines(input, catalogue)
  const doc = { _id: input.clientRequestId, fingerprint, customer: input.customer, fulfilment: input.fulfilment,
    address: input.address, notes: input.notes, lines, estimatedTotals: bulkEstimateSummary(lines.map(line => line.estimatedLineTotal ? line : null)), status: 'new', revision: 0, ownerNote: '',
    createdAt: now, updatedAt: now, inventoryCheckedAt: now, notifications: { email: 'not_configured', telegram: 'not_configured' } }
  try { await store.insertOne(doc) }
  catch (error) {
    // Also recover a committed insert whose acknowledgement was lost.
    const recovered = await store.findOne({ _id: input.clientRequestId })
    if (recovered) return replay(recovered)
    throw error
  }
  return { receipt: bulkReceipt(doc), created: true }
}
