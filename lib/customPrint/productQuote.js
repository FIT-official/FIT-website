/**
 * Server-side fixed quote for a PRODUCT-sourced print job. Recomputes geometry
 * from the product's stored model (the same path /api/quote uses for tamper
 * resistance) and prices it with the vendor's fixed settings via the Instant
 * Quoting Engine — server-authoritative, the customer cannot move it.
 *
 * `computeQuoteFromModelBytes` is the pure-ish core (bytes in, quote out) so it
 * is unit-testable without S3. `computeProductPrintQuote` is the thin S3 edge.
 *
 * See openspec change `migrate-print-delivery-to-custom-requests`.
 */
import { recomputeMetricsFromModel } from '@/lib/quoting/serverGeometry'
import { buildQuote } from '@/lib/quoting/quoteRequest'

/**
 * @returns {Promise<object|null>} the engine quote, or null when the model can't
 *   be parsed/priced (caller decides how to surface that).
 */
export async function computeQuoteFromModelBytes({
  bytes,
  fileName,
  quoteSettings,
  options = {},
  deliveryTypeName,
  pricingConfig = {},
  deliveryTypes = [],
}) {
  // Pass the admin's fitted layer-stack constants so a product print is timed
  // with the same calibration as an uploaded one — with them omitted the
  // recompute would silently use the built-in defaults.
  const metrics = await recomputeMetricsFromModel(
    bytes,
    fileName,
    quoteSettings,
    pricingConfig?.layerStackModel,
  )
  if (!metrics || !(metrics.volumeCm3 > 0)) return null

  const result = buildQuote(
    {
      volumeCm3: metrics.volumeCm3,
      dimensionsCm: metrics.dimensionsCm,
      confidence: metrics.confidence,
      settings: quoteSettings,
      options,
      ...(deliveryTypeName ? { deliveryTypeName } : {}),
    },
    { pricingConfig, deliveryTypes, printHoursShapeAware: metrics.printHoursShapeAware },
  )
  if (!result.ok) return null

  return result.data.quote
}

// Skip recompute for very large stored models (uploads allow up to 100MB) —
// buffering those in a serverless function risks OOM. Mirrors /api/quote.
const MAX_RECOMPUTE_BYTES = 75 * 1024 * 1024

/**
 * Fetch a product's `viewableModel` from S3 and compute its fixed quote.
 * Thin edge over the testable core above.
 * @returns {Promise<object|null>}
 */
export async function computeProductPrintQuote({ product, quoteSettings, ...rest }) {
  if (!product?.viewableModel) return null
  // Lazy import so the pure core stays dependency-free for tests.
  const { s3 } = await import('@/lib/s3')
  const { GetObjectCommand } = await import('@aws-sdk/client-s3')

  const obj = await s3.send(
    new GetObjectCommand({ Bucket: process.env.NEXT_PUBLIC_S3_BUCKET_NAME, Key: product.viewableModel }),
  )
  if ((obj.ContentLength ?? 0) > MAX_RECOMPUTE_BYTES) {
    obj.Body?.destroy?.()
    console.warn(`[productQuote] skipping recompute: ${product.viewableModel} is ${obj.ContentLength} bytes`)
    return null
  }
  const bytes = await obj.Body.transformToByteArray()
  const name = product.viewableModel.split('/').pop() || product.viewableModel
  return computeQuoteFromModelBytes({ bytes, fileName: name, quoteSettings, ...rest })
}
