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
// Skip server geometry recompute for very large stored models (uploads allow up
// to 100MB) — buffering those in a serverless function risks OOM. The persist
// then falls back to client metrics, same as an unparseable file.
const MAX_RECOMPUTE_BYTES = 75 * 1024 * 1024

/**
 * Read a request body up to a hard byte ceiling, enforced against bytes
 * actually read off the stream — not the client-supplied Content-Length
 * header, which can understate the real size.
 * @returns {Promise<{ tooLarge: true } | { tooLarge: false, text: string }>}
 */
async function readBodyWithLimit(req, maxBytes) {
  if (!req.body) {
    const text = await req.text()
    if (new TextEncoder().encode(text).byteLength > maxBytes) return { tooLarge: true }
    return { tooLarge: false, text }
  }
  const reader = req.body.getReader()
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      reader.cancel().catch(() => {})
      return { tooLarge: true }
    }
    chunks.push(value)
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { tooLarge: false, text: new TextDecoder().decode(merged) }
}

/**
 * POST /api/quote — Instant Quoting Engine endpoint.
 *
 * Anonymous callers get a price preview. Supplying a `requestId` persists the
 * quote and auto-quotes the request, which requires authentication + ownership.
 *
 * Pricing is recomputed server-side from AppSettings.quotingConfig; the client
 * cannot set the price (the input schema rejects price/rate fields).
 *
 * Rate-limited via Upstash Redis (lib/rateLimit): authed traffic by userId,
 * anonymous by IP with tighter limits. No-ops when Upstash env vars are unset.
 */
export async function POST(req) {
  const { tooLarge, text: bodyText } = await readBodyWithLimit(req, MAX_BODY_BYTES)
  if (tooLarge) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  const { userId } = await auth()
  const rate = await limitQuoteRequest({ userId, headers: req.headers })
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests — please retry shortly' },
      { status: 429, headers: rate.headers },
    )
  }

  let body
  try {
    body = JSON.parse(bodyText)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  await connectToDatabase()
  const settings = await AppSettings.findById(getAppSettingsId()).lean()
  const pricingConfig = settings?.quotingConfig || {}
  const deliveryTypes = settings?.additionalDeliveryTypes || []

  const result = buildQuote(body, { pricingConfig, deliveryTypes })
  if (!result.ok) {
    return NextResponse.json({ error: result.error, issues: result.issues }, { status: result.status })
  }

  // Machine capacity: reject models the farm cannot print (admin-configured
  // limits; nothing is enforced until the admin sets them).
  const limitsCheck = checkMachineLimits(
    result.data.quote.inputs?.dimensionsCm,
    (result.data.quote.inputs?.weightGrams ?? 0) / 1000,
    settings?.machineLimits?.toObject?.() || settings?.machineLimits || null,
  )
  if (!limitsCheck.fits) {
    return NextResponse.json(
      { error: machineLimitMessage(limitsCheck.violations) },
      { status: 422 },
    )
  }

  const { quote, requestId, preview } = result.data
  let responseQuote = quote

  if (requestId) {
    if (!userId) {
      return NextResponse.json({ error: 'Sign in to save a quote' }, { status: 401 })
    }
    const reqDoc = await CustomPrintRequest.findOne({ requestId })
    if (!reqDoc) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }
    if (reqDoc.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Anti-tamper: for the PERSISTED quote, recompute geometry server-side from
    // the stored model (STL/OBJ/glTF/GLB/3MF) instead of trusting client
    // metrics. Best-effort — any failure falls back to the client-derived quote
    // so the save never breaks. The live preview still uses client metrics.
    let persistQuote = quote
    try {
      const mf = reqDoc.modelFile || {}
      const name = mf.originalName || mf.s3Key || ''
      if (mf.s3Key && supportsServerRecompute(name)) {
        const obj = await s3.send(
          new GetObjectCommand({ Bucket: process.env.NEXT_PUBLIC_S3_BUCKET_NAME, Key: mf.s3Key }),
        )
        const tooLarge = (obj.ContentLength ?? 0) > MAX_RECOMPUTE_BYTES
        if (tooLarge) {
          obj.Body?.destroy?.()
          console.warn(
            `[quote] skipping geometry recompute for requestId=${requestId}: ` +
              `stored model is ${obj.ContentLength} bytes (> ${MAX_RECOMPUTE_BYTES})`,
          )
        }
        const bytes = tooLarge ? null : await obj.Body.transformToByteArray()
        const serverMetrics = bytes
          ? await recomputeMetricsFromModel(bytes, name, body?.settings, pricingConfig.layerStackModel)
          : null
        if (serverMetrics?.volumeCm3 > 0) {
          // Deviation policy (product decision 2026-06-12): if the client's
          // volume understates the server recompute by more than the
          // tolerance, REJECT the request (tamper signal) — log for ops, no
          // quote is persisted. Honest divergences should retry cleanly after
          // a model reload.
          const dev = geometryDeviation(
            { volumeCm3: body?.volumeCm3 },
            { volumeCm3: serverMetrics.volumeCm3 },
          )
          if (dev.suspicious) {
            console.error(
              `[quote] geometry deviation ${dev.volumePctDelta.toFixed(1)}% > ` +
                `${dev.tolerancePct}% for requestId=${requestId} ` +
                `(client=${body?.volumeCm3} cm³, server=${serverMetrics.volumeCm3} cm³) — rejected`,
            )
            try {
              getPostHogClient().capture({
                distinctId: userId,
                event: 'quote_rejected_geometry_deviation',
                properties: {
                  request_id: requestId,
                  volume_pct_delta: Number(dev.volumePctDelta.toFixed(1)),
                  tolerance_pct: dev.tolerancePct,
                },
              })
            } catch (phErr) {
              console.error('PostHog quote_rejected capture failed:', phErr)
            }
            return NextResponse.json(
              {
                error:
                  'The model measurements sent by your browser do not match the uploaded file. ' +
                  'Please reload the model and request the quote again.',
              },
              { status: 400 },
            )
          }

          const serverResult = buildQuote(
            {
              ...body,
              volumeCm3: serverMetrics.volumeCm3,
              dimensionsCm: serverMetrics.dimensionsCm,
              confidence: serverMetrics.confidence,
            },
            {
              pricingConfig,
              deliveryTypes,
              // Server-derived: prices the print time once an admin has
              // calibrated (quotingConfig.layerStackModel), and is recorded
              // alongside the heuristic either way.
              printHoursShapeAware: serverMetrics.printHoursShapeAware,
            },
          )
          if (serverResult.ok) {
            // The pre-recompute machine-limit check ran against client-submitted
            // dimensions. A crafted request can pass that check with a squashed
            // bounding box while the real (server-recomputed) model is oversized
            // on one axis — re-check against the authoritative dimensions before
            // persisting.
            const serverLimitsCheck = checkMachineLimits(
              serverResult.data.quote.inputs?.dimensionsCm,
              (serverResult.data.quote.inputs?.weightGrams ?? 0) / 1000,
              settings?.machineLimits?.toObject?.() || settings?.machineLimits || null,
            )
            if (!serverLimitsCheck.fits) {
              return NextResponse.json(
                { error: machineLimitMessage(serverLimitsCheck.violations) },
                { status: 422 },
              )
            }
            persistQuote = serverResult.data.quote
          }
        }
      }
    } catch (verifyErr) {
      console.error('Server geometry verification failed; using client metrics:', verifyErr)
    }

    // Preview mode: the caller wanted the authoritative number, not a save.
    // Return the recomputed quote and write nothing — no status change, no
    // quotedAt, no delivery re-resolve, no notification. This is what lets the
    // editor panel show the same total the cart will charge, now that print
    // time is priced from the stored model's shape.
    // ponytail: one S3 read + parse per debounced preview. Cache the shape
    // components per (requestId, geometry-affecting settings) if that cost
    // ever shows up in the logs.
    if (preview) {
      return NextResponse.json({ quote: persistQuote, preview: true }, { headers: rate.headers })
    }

    reqDoc.quote = persistQuote
    responseQuote = persistQuote
    reqDoc.quotedAt = new Date()
    // /api/quote IS the instant path — anything persisted here is an instant
    // quote (the manual/advanced path goes through admin set-quote).
    reqDoc.quoteMode = 'instant'

    // Persist geometry-derived dimensions/weight (cm + kg) for display and
    // admin reference. Delivery pricing no longer depends on these — it mirrors
    // the product's configured delivery types (see below).
    const dims = persistQuote.inputs?.dimensionsCm
    const grams = persistQuote.inputs?.weightGrams
    if (dims && (dims.length > 0 || dims.width > 0 || dims.height > 0)) {
      reqDoc.dimensions = {
        length: dims.length || null,
        width: dims.width || null,
        height: dims.height || null,
        weight: grams != null ? grams / 1000 : null, // grams -> kg (model unit)
      }
    }

    // Delivery options for the request mirror the custom-print PRODUCT's own
    // delivery config (admin-curated types with their set prices), exactly like
    // a regular product. Re-resolve on every quote so the request always tracks
    // the current product config; prices are taken as-is (NOT recomputed from
    // the model's dimensions). Checkout charges customPrice/price downstream.
    const customPrintProduct = await Product.findOne({ slug: 'custom-print-request' }).lean()
    const productDeliveryTypes = customPrintProduct?.delivery?.deliveryTypes || []
    const deliveryDefaults = resolveCustomPrintDeliveryDefaults(productDeliveryTypes)
    if (deliveryDefaults.length > 0) {
      reqDoc.delivery = { deliveryTypes: deliveryDefaults }
    }

    if (['pending_upload', 'pending_config', 'configured'].includes(reqDoc.status)) {
      reqDoc.status = 'quoted'
      reqDoc.statusHistory.push({ status: 'quoted', note: 'Auto-quoted by Instant Quoting Engine' })
    }
    await reqDoc.save()

    try {
      getPostHogClient().capture({
        distinctId: userId,
        event: 'quote_persisted',
        properties: {
          request_id: requestId,
          total: persistQuote.total,
          currency: persistQuote.currency,
          confidence: persistQuote.confidence,
          server_recomputed: persistQuote !== quote,
        },
      })
    } catch (phErr) {
      console.error('PostHog quote_persisted capture failed:', phErr)
    }

    // Tell the customer their instant quote is ready (email + buyer↔vendor
    // chat). Best-effort — never fail the quote on a notification error.
    try {
      await notifyCustomPrintEvent({
        event: 'quote-ready',
        request: reqDoc.toObject(),
        product: customPrintProduct,
      })
    } catch (notifyErr) {
      console.error('Quote-ready notification failed:', notifyErr)
    }
  }

  return NextResponse.json({ quote: responseQuote }, { status: 200 })
}
