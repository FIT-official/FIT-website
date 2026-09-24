/**
 * Server-authoritative instant quote for a SAVED custom-print request: the
 * stored model is downloaded, re-measured and priced with the request's saved
 * print settings, then (unless `preview`) written back as the chargeable quote.
 *
 * Shared by POST /api/quote (customer asks for a quote) and PUT
 * /api/custom-print/config (settings changed on an already-quoted request, so
 * the price is refreshed instead of silently disappearing). Returns
 * `{ status, body }` so each route wraps it in its own response.
 */
import CustomPrintRequest from '@/models/CustomPrintRequest'
import Product from '@/models/Product'
import { buildQuote } from '@/lib/quoting/quoteRequest'
import { recomputeMetricsFromModel, supportsServerRecompute } from '@/lib/quoting/serverGeometry'
import { getFilamentAvailability, rushAvailability } from '@/lib/filamentInventory'
import { printSettingsToQuoteSettings } from '@/lib/quoting/printSettingsToQuote'
import { MUTABLE_PRINT_STATUSES } from '@/lib/quoting/validatePrintConfiguration'
import { validate3mfBytes } from '@/lib/modelImport/file'
import { resolveCustomPrintDeliveryDefaults } from '@/lib/customPrintDelivery'
import { notifyCustomPrintEvent } from '@/lib/notifications/customPrint'
import { s3 } from '@/lib/s3'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { checkMachineLimits, machineLimitMessage } from '@/lib/quoting/machineLimits'
import { getPostHogClient } from '@/lib/posthog-server'

const MAX_RECOMPUTE_BYTES = 75 * 1024 * 1024
const OPTION_KEYS = ['postProcessing', 'specialRequest', 'priority', 'expedite']

// Bound bytes actually received, even when object metadata understates its size.
async function readStoredModel(object) {
  if (object.ContentLength > MAX_RECOMPUTE_BYTES) { object.Body?.destroy?.(); throw new Error('Model exceeds verification limit') }
  const stream = object.Body
  if (!stream) throw new Error('Stored model has no body')
  const chunks = []
  let total = 0
  const append = value => {
    total += value.byteLength
    if (total > MAX_RECOMPUTE_BYTES) { stream.destroy?.(); throw new Error('Model exceeds verification limit') }
    chunks.push(value)
  }
  if (stream[Symbol.asyncIterator]) {
    for await (const chunk of stream) append(chunk)
  } else if (stream.getReader) {
    const reader = stream.getReader()
    try { for (;;) { const { done, value } = await reader.read(); if (done) break; append(value) } }
    catch (error) { await reader.cancel().catch(() => {}); throw error }
  } else {
    // Node S3 bodies are async iterable. Refuse an unbounded buffering fallback.
    throw new Error('Stored model stream cannot be read safely')
  }
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength }
  return result
}

const manualReview = () => ({ status: 422, body: {
  error: 'The uploaded model could not be verified for an instant quote. Choose a manual quote for review.',
  manualReviewRequired: true,
} })

export function checkQuoteLimits(quote, appSettings) {
  return checkMachineLimits(quote.inputs?.dimensionsCm, (quote.inputs?.weightGrams ?? 0) / 1000,
    appSettings?.machineLimits?.toObject?.() || appSettings?.machineLimits || null)
}

/**
 * @param {object} args
 * @param {import('mongoose').Document} args.request - the CustomPrintRequest document
 * @param {string} args.userId - authenticated caller
 * @param {object} args.body - the quote input (options, settings, selection, volume/dimensions for previews)
 * @param {boolean} [args.preview] - price without writing anything
 * @param {object} args.appSettings - AppSettings document (lean)
 * @returns {Promise<{status:number, body:object}>}
 */
export async function persistInstantQuote({ request, userId, body = {}, preview = false, appSettings }) {
  const pricingConfig = appSettings?.quotingConfig || {}
  const deliveryTypes = appSettings?.additionalDeliveryTypes || []
  const requestId = request.requestId
  if (request.userId !== userId) return { status: 403, body: { error: 'Forbidden' } }
  if (request.creatorUserId) return { status: 409, body: { error: 'Your print provider prepares the price for this request.' } }
  if (request.source === 'product') return { status: 409, body: { error: 'This product has a fixed print configuration and price.' } }
  if (!MUTABLE_PRINT_STATUSES.includes(request.status) || request.paidAt || request.stripePaymentIntentId || request.stripeSessionId) {
    return { status: 409, body: { error: 'This request is in payment or fulfilment and its quote is locked.' } }
  }
  if (!preview && (!request.printConfiguration?.isConfigured || request.quoteMode !== 'instant')) {
    return { status: 409, body: { error: 'Save your print settings for an instant quote first.' } }
  }
  // Previews can explore unsaved settings. Persisted prices must describe the
  // saved print configuration, not cheaper settings supplied independently.
  const quoteSettings = preview ? body.settings : printSettingsToQuoteSettings(request.printConfiguration.printSettings)
  if (!preview && request.printConfiguration.printSettings?.materialType !== 'plastic') {
    return { status: 422, body: { error: 'This material needs a manual quote.', manualReviewRequired: true } }
  }
  if (body.options?.priority || body.options?.expedite) {
    const chosen = preview && body.selection ? body.selection : {
      filament: request.printConfiguration?.printSettings?.filamentType || 'pla',
      colour: request.printConfiguration?.generic?.colour,
    }
    let colours
    try { colours = await getFilamentAvailability() }
    catch { return { status: 503, body: { error: 'Rush availability cannot be checked right now. Try again shortly.' } } }
    if (rushAvailability(colours, chosen.filament, chosen.colour) !== 'in_stock')
      return { status: 409, body: { error: 'This colour is unavailable for rush or priority. Choose an in-stock colour.' } }
  }
  const model = request.modelFile || {}
  const name = model.originalName || model.s3Key || ''
  if (!model.s3Key || !supportsServerRecompute(name)) return manualReview()
  let metrics
  try {
    const object = await s3.send(new GetObjectCommand({ Bucket: process.env.NEXT_PUBLIC_S3_BUCKET_NAME, Key: model.s3Key }))
    const bytes = await readStoredModel(object)
    if (name.toLowerCase().endsWith('.3mf')) validate3mfBytes(bytes)
    metrics = await recomputeMetricsFromModel(bytes, name, quoteSettings, pricingConfig.layerStackModel)
  } catch (error) {
    console.error('Stored model verification failed:', error?.message || 'verification_error')
    return manualReview()
  }
  if (!(metrics?.volumeCm3 > 0) || !Number.isFinite(metrics.volumeCm3) ||
      !['length', 'width', 'height'].every(axis => Number.isFinite(metrics.dimensionsCm?.[axis]) && metrics.dimensionsCm[axis] > 0)) return manualReview()
  // Different mesh loaders can disagree on volume, particularly for open or
  // zero-normal STL meshes. Price and machine limits use only the saved file.
  const options = Object.fromEntries(OPTION_KEYS.map(key => [key, body.options?.[key] === true]))
  const verified = buildQuote({ requestId, preview, options, settings: quoteSettings, volumeCm3: metrics.volumeCm3,
    dimensionsCm: metrics.dimensionsCm, confidence: metrics.confidence,
    ...(body.deliveryTypeName ? { deliveryTypeName: body.deliveryTypeName } : {}) },
  { pricingConfig, deliveryTypes, printHoursShapeAware: metrics.printHoursShapeAware })
  if (!verified.ok) return { status: verified.status, body: { error: verified.error, issues: verified.issues } }
  const persistQuote = verified.data.quote
  persistQuote.inputs.options = options
  const limits = checkQuoteLimits(persistQuote, appSettings)
  if (!limits.fits) return { status: 422, body: { error: machineLimitMessage(limits.violations) } }
  if (preview) return { status: 200, body: { quote: persistQuote, preview: true, geometryVerified: true } }

  const customPrintProduct = await Product.findOne({ slug: 'custom-print-request' }).lean()
  const delivery = resolveCustomPrintDeliveryDefaults(customPrintProduct?.delivery?.deliveryTypes || [])
  const dimensions = persistQuote.inputs.dimensionsCm
  const now = new Date()
  const saved = await CustomPrintRequest.findOneAndUpdate({
    requestId, userId, status: request.status, paidAt: null, creatorUserId: null,
    source: { $ne: 'product' }, quoteMode: 'instant', stripePaymentIntentId: null, stripeSessionId: null,
    'modelFile.s3Key': model.s3Key,
    ...(request.updatedAt ? { updatedAt: request.updatedAt } : {}),
    ...(request.printConfiguration.configuredAt ? { 'printConfiguration.configuredAt': request.printConfiguration.configuredAt } : {}),
  }, {
    $set: { quote: persistQuote, quoteMode: 'instant', quotedAt: now, status: 'quoted',
      dimensions: { ...dimensions, weight: persistQuote.inputs.weightGrams / 1000 },
      ...(delivery.length ? { delivery: { deliveryTypes: delivery } } : {}),
    },
    $push: { statusHistory: { status: 'quoted', updatedAt: now, note: 'Instant quote verified against the stored model' } },
  }, { new: true, runValidators: true })
  if (!saved) return { status: 409, body: { error: 'This request changed while its quote was being calculated. Reload it before trying again.' } }
  try {
    getPostHogClient().capture({ distinctId: userId, event: 'quote_persisted', properties: {
      request_id: requestId, total: persistQuote.total, currency: persistQuote.currency, confidence: persistQuote.confidence, server_recomputed: true,
    } })
  } catch (error) { console.error('Quote analytics failed:', error?.message) }
  try { await notifyCustomPrintEvent({ event: 'quote-ready', request: saved.toObject(), product: customPrintProduct }) }
  catch (error) { console.error('Quote-ready notification failed:', error?.message) }
  return { status: 200, body: { quote: persistQuote, geometryVerified: true }, request: saved }
}
