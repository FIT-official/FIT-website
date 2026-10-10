import { createHash } from 'node:crypto'
import { guidedSummary, validateGuidedBrief } from '@/lib/customPrint/guidedBrief'
import { lineNeedsDeliveryAddress } from '@/lib/checkoutAddressGate'
import { OWNER_DIGEST_EMAIL } from './ownerDigestPolicy'

const fail = () => { throw new Error('A complete stored source record is required for the owner digest.') }
const id = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : fail()
const text = (value, fallback = 'Not recorded') => typeof value === 'string' && value.trim() ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim() : fallback
const oneLine = value => text(value).replace(/[\r\n]+/g, ' ')
const block = value => text(value, 'None').replace(/\r\n/g, '\n').split('\n').map(line => '    ' + line).join('\n')
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
const entries = value => value instanceof Map ? [...value] : value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value) : []
const phone = value => typeof value === 'string' ? oneLine(value) : value?.number ? [value.countryCode, value.number].filter(Boolean).map(oneLine).join(' ') : 'Not recorded in this source snapshot'
const money = (cents, currency) => Number.isSafeInteger(cents) && cents >= 0 ? `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}` : fail()
const when = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : fail()

function message(kind, reference, rows) {
  const key = id(reference)
  const body = rows.join('\n')
  // Fail explicitly instead of silently truncating a preparation instruction.
  if (Buffer.byteLength(body, 'utf8') > 128 * 1024) fail()
  return {
    to: OWNER_DIGEST_EMAIL,
    subject: `FIT ${kind === 'guided' ? 'print enquiry' : 'paid order'} ${key}`,
    messageId: `<fit-owner-${kind}-${createHash('sha256').update(key).digest('hex')}@fixitoday.com>`,
    text: body,
    html: `<div style="font:15px/1.6 Arial,sans-serif;white-space:pre-wrap">${escape(body)}</div>`,
  }
}

export function buildGuidedOwnerDigest(request) {
  if (!request || request.creatorUserId || !request.userId || !request.guidedFingerprint || request.guidedBrief?.version !== 1) fail()
  const checked = validateGuidedBrief(request.guidedBrief)
  if (checked.error) fail()
  const brief = checked.value
  const rows = [
    `Customer: ${oneLine(request.userName)}`, `Phone: ${phone(request.userPhone)}`,
    'Address / collection: not agreed in this enquiry; review the customer remarks and confirm.',
    '', 'Preparation / enquiry review',
    `1. ${oneLine(brief.purpose)}`, `Copies requested: ${brief.quantity}`,
    ...guidedSummary(brief).filter(([key]) => !['Purpose', 'Quantity', 'Remarks', 'Design permissions', 'Permission details'].includes(key)).map(([key, value]) => `${key}: ${oneLine(value)}`),
    `Private attachment reference: ${request.guidedAssetId ? id(request.guidedAssetId) : 'No file attached'}`,
    'Attachment bytes are a reference, not proof of printable geometry, units or permission.',
    'Item remarks:', block(brief.notes),
    `Customer-stated design permission (unverified): ${brief.rights}`,
    'Customer permission details (unverified):', block(brief.permissionNote),
    'Review required: exact file/version, dimensions/units, quantity, material/colour, printability and paid-print permission.',
    '', 'Payment / Stripe',
    'No payment taken by this enquiry. No Stripe transaction. No quote or shipping charge is agreed.',
    'No stock is reserved and no production or delivery date is promised.',
    `Customer email: ${oneLine(request.userEmail)}`, `Enquiry reference: ${id(request.requestId)}`,
    `Brief fingerprint: ${oneLine(request.guidedFingerprint)}`,
    'Review: https://www.fixitoday.com/admin',
  ]
  return message('guided', request.requestId, rows)
}

const settings = {
  materialType: 'Material type', filamentType: 'Filament', layerHeight: 'Layer height (mm)',
  initialLayerHeight: 'Initial layer height (mm)', wallLoops: 'Wall loops',
  internalSolidInfillPattern: 'Solid infill pattern', sparseInfillDensity: 'Infill (%)',
  sparseInfillPattern: 'Infill pattern', nozzleDiameter: 'Nozzle (mm)',
  enableSupport: 'Supports', supportType: 'Support type', printPlate: 'Build plate',
}
function printPreparation(source) {
  if (!source) return []
  const rows = []
  if (source.guidedBrief?.version === 1) {
    const checked = validateGuidedBrief(source.guidedBrief)
    if (checked.error) fail()
    rows.push(`Copies to prepare in this paid print line: ${checked.value.quantity}`)
    rows.push(...guidedSummary(checked.value).filter(([key]) => !['Design permissions', 'Permission details'].includes(key)).map(([key, value]) => `${key}: ${oneLine(value)}`))
    rows.push(`Private attachment reference: ${source.guidedAssetId ? id(source.guidedAssetId) : 'None'}`)
    rows.push(`Reviewed file/version: ${oneLine(source.guidedReview?.exactFile)}`)
    rows.push(`Review status: ${oneLine(source.guidedReview?.status)}; staff: ${oneLine(source.guidedReview?.reviewedBy)}`)
    rows.push(`Reviewed scope confirmed: ${source.guidedReview?.scopeConfirmed === true ? 'yes' : 'Not confirmed in this snapshot'}`)
    rows.push('Recorded paid-print permission evidence:', block(source.guidedReview?.licenceEvidence))
  }
  if (source.modelFile?.originalName) rows.push(`Model filename: ${oneLine(source.modelFile.originalName)}`)
  const config = source.printConfiguration || {}
  for (const [key, label] of Object.entries(settings)) {
    const value = config.printSettings?.[key]
    if (['string', 'number', 'boolean'].includes(typeof value)) rows.push(`${label}: ${oneLine(String(value))}`)
  }
  for (const [key, value] of entries(config.generic)) if (value != null) rows.push(`Simple preference ${oneLine(key)}: ${oneLine(String(value))}`)
  for (const [mesh, colour] of entries(config.meshColors)) rows.push(`Mesh colour ${oneLine(mesh)}: ${oneLine(colour)}`)
  for (const [key, label] of Object.entries({ postProcessing: 'Post-processing', specialRequest: 'Special request', priority: 'Priority', expedite: 'Expedite' })) {
    const value = source.quote?.inputs?.options?.[key]
    if (typeof value === 'boolean') rows.push(`Recorded ${label}: ${value ? 'yes' : 'no'}`)
  }
  return rows
}

// Read only the immutable checkout plus its committed paid Order. Never read a
// current cart, product, account profile, price table, payment API or asset URL.
export function buildPaidOrderOwnerDigest({ checkout, order } = {}) {
  if (!checkout || !order || checkout.snapshotVersion !== 1 || checkout.status !== 'completed' ||
      !Array.isArray(checkout.items) || !checkout.items.length || checkout.items.length > 100 ||
      checkout.sessionId !== order.stripeSessionId || checkout.userId !== order.userId ||
      !checkout.userId || !/^[a-z]{3}$/.test(checkout.currency || '') ||
      String(order.currency).toLowerCase() !== checkout.currency ||
      !Number.isFinite(order.totalAmount) || Math.round(order.totalAmount * 100) !== checkout.totalAmount) fail()
  const reference = id(order.orderId), sessionId = id(checkout.sessionId), confirmedAt = when(order.paidConfirmedAt)
  const currency = checkout.currency
  let subtotal = 0, delivery = 0
  for (const item of checkout.items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.currency !== currency ||
        !Number.isSafeInteger(item.unitAmount) || item.unitAmount < 0 ||
        !Number.isSafeInteger(item.deliveryAmount) || item.deliveryAmount < 0 ||
        item.totalAmount !== item.unitAmount * item.quantity + item.deliveryAmount ||
        !item.productName || !item.chosenDeliveryType) fail()
    subtotal += item.unitAmount * item.quantity; delivery += item.deliveryAmount
  }
  if (!Number.isSafeInteger(subtotal + delivery) || subtotal + delivery !== checkout.totalAmount) fail()
  const methods = [...new Set(checkout.items.map(item => item.chosenDeliveryType))]
  const physical = methods.filter(type => type !== 'digital')
  const address = checkout.shippingAddress
  const ships = methods.some(lineNeedsDeliveryAddress)
  const formattedAddress = address ? ['street', 'unitNumber', 'city', 'state', 'postalCode', 'country'].map(key => text(address[key], '')).filter(Boolean).map(oneLine).join(', ') : ''
  const handover = ships ? `Delivery address: ${formattedAddress || 'NOT RECORDED — staff review required'}` : physical.length ? 'Collection: selected; confirm the recorded collection arrangement before preparation.' : 'Fulfilment: digital; no physical delivery or collection.'
  const rows = [
    `Customer: ${oneLine(checkout.customerName || order.customerName)}`,
    `Phone: ${phone(checkout.customerPhone)}`, handover,
    `Recorded fulfilment method${methods.length === 1 ? '' : 's'}: ${methods.map(oneLine).join(', ')}`,
    ...(physical.length > 1 ? ['REVIEW REQUIRED: multiple physical fulfilment methods are recorded; do not choose a replacement or charge.'] : []),
    '', 'Exact preparation list — committed checkout snapshot',
  ]
  checkout.items.forEach((item, index) => {
    rows.push(`${index + 1}. ${oneLine(item.productName)}`, `Product reference: ${oneLine(item.productId)}; slug: ${oneLine(item.productSlug)}`,
      `Purchased quantity: ${item.quantity}`, `Fulfilment: ${oneLine(item.chosenDeliveryType)}`)
    const options = entries(item.selectedVariants)
    rows.push(options.length ? 'Selected options: ' + options.map(([name, value]) => `${oneLine(name)}: ${oneLine(value)}`).join(' | ') : 'Selected options: none recorded')
    for (const option of item.variantInfo || []) rows.push(`Recorded variant: ${oneLine(option.type)}: ${oneLine(option.option)}`)
    if (item.requestId) rows.push(`Print request: ${id(item.requestId)}`)
    rows.push(...printPreparation(item.customRequest || item.productPrintInput))
    const choice = (item.customRequest || item.productPrintInput)?.delivery?.deliveryTypes?.find(option => option.type === item.chosenDeliveryType)
    if (choice?.pickupLocation) rows.push(`Recorded pickup location: ${oneLine(choice.pickupLocation)}`)
    if (choice?.customDescription) rows.push(`Recorded fulfilment instructions: ${oneLine(choice.customDescription)}`)
    rows.push('Item remarks:', block(item.orderNote), `Recorded unit price: ${money(item.unitAmount, currency)}`,
      `Recorded line total including allocated delivery: ${money(item.totalAmount, currency)}`, '')
  })
  rows.push('Payment / Stripe — recorded confirmation',
    `Order reference: ${reference}`, `Stripe checkout session: ${sessionId}`,
    `Stripe payment intent: ${order.stripePaymentIntentId ? id(order.stripePaymentIntentId) : 'Not recorded'}`,
    `Paid confirmation recorded at: ${confirmedAt}`, `Recorded payment method: ${oneLine(order.paymentMethod?.type)}`)
  if (order.paymentMethod?.brand) rows.push(`Recorded payment brand: ${oneLine(order.paymentMethod.brand)}`)
  if (/^\d{4}$/.test(order.paymentMethod?.last4 || '')) rows.push(`Recorded payment method ending: ${order.paymentMethod.last4}`)
  rows.push(`Items after recorded discounts: ${money(subtotal, currency)}`, `Recorded delivery total: ${money(delivery, currency)}`,
    `Recorded paid total: ${money(checkout.totalAmount, currency)}`, 'No tax allocation or additional charge is inferred by this digest.',
    `Customer email: ${oneLine(checkout.customerEmail || order.customerEmail)}`, 'Review: https://www.fixitoday.com/admin')
  return message('paid', reference, rows)
}
