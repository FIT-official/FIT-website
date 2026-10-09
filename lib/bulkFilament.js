import { createHash } from 'node:crypto'
import { bulkCombinationKey } from './bulkFilamentSelection'
import { bulkSheetColourPreview } from './bulkFilamentPreviews'
import { bulkEmailStatus } from './bulkFilamentEmail'
import { BULK_LADDERS, BULK_PRICE_NOTICE, BULK_CONSENT, priceBulkLines, bulkListUnitCents } from './bulkFilamentConfig'
export const MAX_LINES = 50
export function bulkFail(message, status = 400, code = 'invalid_request') {
  throw Object.assign(new Error(message), { status, code })
}
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const identity = value => hash(value).slice(0, 24)
const objectId = value => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value)
const text = (value, name, maximum, required = false) => {
  if (value == null && !required) return ''
  if (typeof value !== 'string' || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) bulkFail(`Check ${name}.`)
  const result = value.trim()
  if (required && !result) bulkFail(`Enter ${name}.`)
  return result
}
// Stable Sheet identities belong only to enquiries, never the shop/cart.
// Absent Lanbo/FIT Sheet products stay absent. Bambu uses its separate shop adapter.
export function bulkCatalogue(stock) {
  const groups = new Map()
  for (const item of stock.items) {
    const key = `${item.brand}:${item.material}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  return [...groups].map(([key, items]) => {
    const first = items[0], id = identity(key), colourTypeId = identity(key + ':Colour')
    const options = items.map(item => ({ id: identity(item.key), name: item.colour, stock: item.available,
      sheetQuantity: item.sheetQuantity, barcode: item.barcode, ladder: item.ladder, preview: bulkSheetColourPreview(item) }))
    const product = { id, name: first.brand === 'FIT' ? 'FIT Marble PLA · 1kg' : `Lanbo ${first.material} · 1kg`,
      material: first.material, brand: first.brand, stock: options.reduce((n, o) => n + o.stock, 0), colourTypeId,
      types: [{ id: colourTypeId, name: 'Colour', label: 'Colour', options }],
      stockSource: stock.source, inventorySource: stock.source, inventoryCheckedAt: stock.checkedAt }
    return { ...product, version: hash({ ...product, inventoryCheckedAt: undefined, ladders: BULK_LADDERS }) }
  }).sort((a, b) => (a.brand === 'FIT' ? 2 : a.material === 'PLA' ? 0 : 1) - (b.brand === 'FIT' ? 2 : b.material === 'PLA' ? 0 : 1))
}
export function parseBulkInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) bulkFail('Send a request object.')
  if (Object.hasOwn(body, 'extraQuantity') || Object.hasOwn(body, 'recordedQuantity')) bulkFail('Use only quantity, within available stock.')
  if (typeof body.clientRequestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.clientRequestId)) bulkFail('Refresh the form before submitting.')
  if (body.confirmReview !== true) bulkFail('Confirm that availability and the final quotation need owner review.')
  if (body.consent !== true) bulkFail('Consent is required to respond to this enquiry.')
  const customer = {
    name: text(body.customer?.name, 'your name', 120, true),
    email: text(body.customer?.email, 'your email', 254, true).toLowerCase(),
    phone: text(body.customer?.phone, 'your phone number', 40),
    organisation: text(body.customer?.organisation, 'organisation', 160),
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email) || /[\r\n]/.test(customer.email)) bulkFail('Enter a valid email address.')
  if (customer.phone && !/^[+()\d .-]{6,40}$/.test(customer.phone)) bulkFail('Enter a valid phone number.')
  if (!['collection', 'delivery'].includes(body.fulfilment)) bulkFail('Choose collection or delivery enquiry.')
  const address = text(body.address, 'delivery address', 1000, body.fulfilment === 'delivery')
  if (!Array.isArray(body.lines) || !body.lines.length || body.lines.length > MAX_LINES) bulkFail('Choose between 1 and 50 filament lines.')
  const lines = body.lines.map(line => {
    if (!objectId(line?.productId) || !/^[a-f0-9]{64}$/.test(line?.version || '')) bulkFail('Choose a current catalogue product.')
    if (!Array.isArray(line.options) || !line.options.length || line.options.length > 5 ||
        line.options.some(o => !objectId(o?.typeId) || !objectId(o?.optionId))) bulkFail('Choose valid product options.')
    if (new Set(line.options.map(o => o.typeId.toLowerCase())).size !== line.options.length) bulkFail('Choose each option once.')
    if (Object.hasOwn(line, 'extraQuantity') || Object.hasOwn(line, 'recordedQuantity')) bulkFail('Use only quantity, within available stock.')
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 1000000) bulkFail('Enter a whole quantity of at least one roll.')
    return { productId: line.productId.toLowerCase(), version: line.version,
      options: line.options.map(o => ({ typeId: o.typeId.toLowerCase(), optionId: o.optionId.toLowerCase() })).sort((a,b) => a.typeId.localeCompare(b.typeId)),
      quantity: line.quantity, remarks: text(line.remarks, 'item remarks', 500) }
  }).sort((a,b) => (a.productId + JSON.stringify(a.options)).localeCompare(b.productId + JSON.stringify(b.options)))
  return { clientRequestId: body.clientRequestId.toLowerCase(), customer, fulfilment: body.fulfilment,
    address: body.fulfilment === 'delivery' ? address : '', notes: text(body.notes, 'notes', 2000), lines, confirmReview: true, consent: true }
}
export const bulkFingerprint = input => hash(input)
export function prepareBulkLines(input, catalogue) {
  const used = new Map()
  const lines = input.lines.map(line => {
    const p = catalogue.find(p => p.id === line.productId)
    if (!p || p.version !== line.version) bulkFail('Inventory or prices changed. Refresh inventory and review your request.', 409, 'inventory_changed')
    if (line.options.length !== p.types.length) bulkFail('Select every product option.')
    const options = p.types.map(t => {
      const o = t.options.find(o => o.id === line.options.find(s => s.typeId === t.id)?.optionId)
      if (!o) bulkFail('A selected option does not belong to this product.')
      return { typeId: t.id, type: t.label, optionId: o.id, name: o.name, availableStock: o.stock, sheetQuantity: o.sheetQuantity, barcode: o.barcode, ladder: o.ladder }
    })
    const colour = options.find(o => o.typeId === p.colourTypeId)
    const key = p.id + ':' + colour.optionId, total = (used.get(key) || 0) + line.quantity
    if (total > colour.availableStock) bulkFail(`${colour.name}: choose 1 to ${colour.availableStock} rolls across all lines.`, 409, 'inventory_changed')
    used.set(key, total)
    if (p.pricingMode === 'list') {
      if (p.combinationStock) {
        const combination = bulkCombinationKey(Object.fromEntries(line.options.map(o => [o.typeId, o.optionId])))
        const stockKey = p.id + ':combination:' + combination
        const maximum = p.combinationStock[combination] ?? 0
        const claimed = (used.get(stockKey) || 0) + line.quantity
        if (claimed > maximum) bulkFail(`${colour.name}: selected spool option has ${maximum} rolls available across all lines.`, 409, 'inventory_changed')
        used.set(stockKey, claimed)
      }
      // Product and spool stock are shared across colours and separate lines.
      for (const [stockKey, maximum] of [[p.id, p.stock], ...options.filter(o => o.typeId !== p.colourTypeId).map(o => [p.id + ':' + o.optionId, o.availableStock])]) {
        const claimed = (used.get(stockKey) || 0) + line.quantity
        if (claimed > maximum) bulkFail('Shared product or spool stock exceeded. Review quantities.', 409, 'inventory_changed')
        used.set(stockKey, claimed)
      }
    }
    return { productId: p.id, productName: p.name, material: p.material, colour: colour.name,
      options, version: p.version, quantity: line.quantity, remarks: line.remarks, ladder: colour.ladder,
      listUnitCents: bulkListUnitCents(p, Object.fromEntries(line.options.map(o => [o.typeId, o.optionId]))),
      stockSource: p.stockSource, inventorySource: p.inventorySource, inventoryCheckedAt: p.inventoryCheckedAt }
  })
  return priceBulkLines(lines).map(line => ({ ...line, currency: 'SGD', priceNotice: line.priceNotice || BULK_PRICE_NOTICE }))
}
export function bulkReceipt(doc) {
  return { requestId: doc._id, status: doc.status, submittedAt: doc.createdAt,
    totalRolls: doc.lines.reduce((n,l) => n + l.quantity, 0),
    ownerEmailStatus: bulkEmailStatus(doc),
    notificationCoverage: bulkEmailStatus(doc) === 'accepted' ? 'owner_dashboard_and_email_provider' : 'owner_dashboard_only' }
}
export async function saveBulkRequest(store, input, loadCatalogue, now = new Date()) {
  const fingerprint = bulkFingerprint(input)
  const existing = await store.findOne({ _id: input.clientRequestId })
  const replay = doc => {
    if (doc.fingerprint !== fingerprint) bulkFail('This request reference already belongs to a different submission. Start a new request.', 409, 'idempotency_conflict')
    return { receipt: bulkReceipt(doc), created: false }
  }
  if (existing) return replay(existing)
  const lines = prepareBulkLines(input, await loadCatalogue())
  const doc = { _id: input.clientRequestId, fingerprint, customer: input.customer, fulfilment: input.fulfilment,
    address: input.address, notes: input.notes, lines, totalCents: lines.reduce((n,l) => n + l.lineCents, 0), currency: 'SGD',
    priceNotice: BULK_PRICE_NOTICE, consent: { accepted: true, text: BULK_CONSENT, acceptedAt: now },
    confirmReview: true, status: 'new', revision: 0, ownerNote: '',
    createdAt: now, updatedAt: now, inventoryCheckedAt: now, notifications: { email: { status: 'pending', attempts: 0 } } }
  try { await store.insertOne(doc) }
  catch (error) {
    const recovered = await store.findOne({ _id: input.clientRequestId })
    if (recovered) return replay(recovered)
    throw error
  }
  return { receipt: bulkReceipt(doc), created: true, document: doc }
}
