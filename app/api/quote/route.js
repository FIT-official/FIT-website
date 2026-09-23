import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import AppSettings from '@/models/AppSettings'
import CustomPrintRequest from '@/models/CustomPrintRequest'
import Product from '@/models/Product'
import { buildQuote } from '@/lib/quoting/quoteRequest'
import { getAppSettingsId } from '@/lib/appSettingsId'
import { recomputeMetricsFromModel, supportsServerRecompute } from '@/lib/quoting/serverGeometry'
import { geometryDeviation } from '@/lib/quoting/geometryDeviation'
import { printSettingsToQuoteSettings } from '@/lib/quoting/printSettingsToQuote'
import { MUTABLE_PRINT_STATUSES } from '@/lib/quoting/validatePrintConfiguration'
import { validate3mfBytes } from '@/lib/modelImport/file'
import { resolveCustomPrintDeliveryDefaults } from '@/lib/customPrintDelivery'
import { notifyCustomPrintEvent } from '@/lib/notifications/customPrint'
import { s3 } from '@/lib/s3'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { limitQuoteRequest } from '@/lib/rateLimit'
import { checkMachineLimits, machineLimitMessage } from '@/lib/quoting/machineLimits'
import { getPostHogClient } from '@/lib/posthog-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const MAX_BODY_BYTES = 50_000
const MAX_RECOMPUTE_BYTES = 75 * 1024 * 1024

async function readBodyWithLimit(req, maxBytes) {
  if (!req.body) {
    const text = await req.text()
    return new TextEncoder().encode(text).byteLength > maxBytes ? { tooLarge: true } : { tooLarge: false, text }
  }
  const reader = req.body.getReader()
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) { reader.cancel().catch(() => {}); return { tooLarge: true } }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return { tooLarge: false, text: new TextDecoder().decode(bytes) }
}

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

function manualReview() {
  return NextResponse.json({
    error: 'The uploaded model could not be verified for an instant quote. Choose a manual quote for review.',
    manualReviewRequired: true,
  }, { status: 422 })
}

function checkLimits(quote, settings) {
  return checkMachineLimits(quote.inputs?.dimensionsCm, (quote.inputs?.weightGrams ?? 0) / 1000,
    settings?.machineLimits?.toObject?.() || settings?.machineLimits || null)
}

export async function POST(req) {
  try {
    const { tooLarge, text } = await readBodyWithLimit(req, MAX_BODY_BYTES)
    if (tooLarge) return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    const { userId } = await auth()
    const rate = await limitQuoteRequest({ userId, headers: req.headers })
    if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Please retry shortly.' }, { status: 429, headers: rate.headers })
    let body
    try { body = JSON.parse(text) } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
    await connectToDatabase()
    const settings = await AppSettings.findById(getAppSettingsId()).lean()
    const pricingConfig = settings?.quotingConfig || {}
    const deliveryTypes = settings?.additionalDeliveryTypes || []
    const result = buildQuote(body, { pricingConfig, deliveryTypes })
    if (!result.ok) return NextResponse.json({ error: result.error, issues: result.issues }, { status: result.status })
    const { quote, requestId, preview } = result.data
    if (!requestId) {
      const limits = checkLimits(quote, settings)
      if (!limits.fits) return NextResponse.json({ error: machineLimitMessage(limits.violations) }, { status: 422 })
      return NextResponse.json({ quote, estimateOnly: true }, { headers: rate.headers })
    }
    if (!userId) return NextResponse.json({ error: 'Sign in to save a quote' }, { status: 401 })
    const request = await CustomPrintRequest.findOne({ requestId })
    if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    if (request.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (request.creatorUserId) return NextResponse.json({ error: 'Your print provider prepares the price for this request.' }, { status: 409 })
    if (request.source === 'product') return NextResponse.json({ error: 'This product has a fixed print configuration and price.' }, { status: 409 })
    if (!MUTABLE_PRINT_STATUSES.includes(request.status) || request.paidAt || request.stripePaymentIntentId || request.stripeSessionId) {
      return NextResponse.json({ error: 'This request is in payment or fulfilment and its quote is locked.' }, { status: 409 })
    }
    if (!preview && (!request.printConfiguration?.isConfigured || request.quoteMode !== 'instant')) {
      return NextResponse.json({ error: 'Save your print settings for an instant quote first.' }, { status: 409 })
    }
    // Previews can explore unsaved settings. Persisted prices must describe the
    // saved print configuration, not cheaper settings supplied independently.
    const quoteSettings = preview ? body.settings : printSettingsToQuoteSettings(request.printConfiguration.printSettings)
    if (!preview && quoteSettings.materialType !== 'plastic') {
      return NextResponse.json({ error: 'This material needs a manual quote.', manualReviewRequired: true }, { status: 422 })
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
    const deviation = geometryDeviation({ volumeCm3: body.volumeCm3 }, { volumeCm3: metrics.volumeCm3 })
    if (deviation.suspicious) return NextResponse.json({ error: 'The model measurements do not match the uploaded file. Reload the model and try again.' }, { status: 400 })
    const verified = buildQuote({ ...body, settings: quoteSettings, volumeCm3: metrics.volumeCm3,
      dimensionsCm: metrics.dimensionsCm, confidence: metrics.confidence },
    { pricingConfig, deliveryTypes, printHoursShapeAware: metrics.printHoursShapeAware })
    if (!verified.ok) return NextResponse.json({ error: verified.error, issues: verified.issues }, { status: verified.status })
    const persistQuote = verified.data.quote
    persistQuote.inputs.options = Object.fromEntries(['postProcessing', 'specialRequest', 'priority', 'expedite'].map(key => [key, body.options?.[key] === true]))
    const limits = checkLimits(persistQuote, settings)
    if (!limits.fits) return NextResponse.json({ error: machineLimitMessage(limits.violations) }, { status: 422 })
    if (preview) return NextResponse.json({ quote: persistQuote, preview: true, geometryVerified: true }, { headers: rate.headers })

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
    if (!saved) return NextResponse.json({ error: 'This request changed while its quote was being calculated. Reload it before trying again.' }, { status: 409 })
    try {
      getPostHogClient().capture({ distinctId: userId, event: 'quote_persisted', properties: {
        request_id: requestId, total: persistQuote.total, currency: persistQuote.currency, confidence: persistQuote.confidence, server_recomputed: true,
      } })
    } catch (error) { console.error('Quote analytics failed:', error?.message) }
    try { await notifyCustomPrintEvent({ event: 'quote-ready', request: saved.toObject(), product: customPrintProduct }) }
    catch (error) { console.error('Quote-ready notification failed:', error?.message) }
    return NextResponse.json({ quote: persistQuote, geometryVerified: true }, { headers: rate.headers })
  } catch (error) {
    console.error('Quote request failed:', error?.message || 'quote_error')
    return NextResponse.json({ error: 'The quote service is temporarily unavailable. Please try again.' }, { status: 503 })
  }
}
