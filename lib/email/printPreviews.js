/**
 * Server-side preparation of MODEL previews for the idle-nudge email. This is the only I/O step; the email template stays pure.
 *
 * What it does, for ONE custom-print request: describe its models with the pure helper in printPreviewModels.js, resolve each file ONLY from the stored request (the recorded legacy key, or
 * a listed FabricationAsset whose ownerUserId equals request.userId; never a client-supplied URL such as modelFile.s3Url), read the bytes with a hard size limit, parse them with the
 * existing STL/OBJ/3MF parsers, draw the real triangles with the same software renderer the order model viewer uses, and rasterise that drawing to a PNG with sharp. Each PNG becomes an
 * inline `cid:` attachment. Any file that cannot be previewed (unsupported, missing, too large, corrupt, not owned, fetch error, out of time) is reported as unavailable for that file only;
 * it never fails the email and no broken image is produced. Nothing here changes storage permissions, ACLs or CORS.
 */
import { randomBytes } from 'node:crypto'
import { buildPreviewModels } from '@/lib/email/printPreviewModels'
import { parseForPreview, shadeModel, PreviewError } from '@/lib/email/printPreviewRender'

export const PREVIEW_LIMITS = Object.freeze({
  maxModels: 6,                    // the batch upload accepts at most six files, so every accepted file can be drawn; any further model is listed without a picture
  maxTotalBytes: 30 * 1024 * 1024, // source bytes read for one email, across all its models
  maxFileBytes: 15 * 1024 * 1024,  // a larger source file is not previewed
  maxTriangles: 400000,            // parsed geometry above this is not previewed
  renderMs: 4000,                  // CPU time allowed for shading one model (the shading loop checks this itself; it cannot be interrupted from outside)
  supersample: 2,                  // anti-aliasing: shaded at 2x and scaled down
  maxPngBytes: 250 * 1024,         // a larger picture is dropped rather than attached (six pictures stay under 1.5 MB)
  width: 480, height: 320,
  budgetMs: 8000,                  // wall clock for the whole preparation of one email, asset lookup included; the cron route passes in whatever is left of its own run budget
})

const ID = /^[A-Za-z0-9_-]{1,80}$/
const isSafeId = value => typeof value === 'string' && ID.test(value)

/** Where the model's bytes live, from the stored request only. Returns null when the model is not this customer's file. */
export function storageFor(request, model, assets = {}) {
  if (model.id === 'legacy') {
    const file = request.modelFile
    if (!file?.s3Key || (request.guidedAssets?.length || request.guidedAssetId)) return null
    return { kind: 'upload', bucket: process.env.NEXT_PUBLIC_S3_BUCKET_NAME, key: file.s3Key, fileName: model.fileName }
  }
  const listed = (request.guidedAssets || []).some(a => a.assetId === model.id) || request.guidedAssetId === model.id
  if (!listed || !isSafeId(model.id)) return null
  const asset = assets[model.id]
  if (!asset?.key || !asset.bucket || asset.ownerUserId !== request.userId) return null
  return { kind: 'guided', bucket: asset.bucket, key: asset.key, fileName: asset.originalName || model.fileName }
}

/** Model bytes -> PNG bytes plus what was drawn. Throws PreviewError('unsupported' | 'unreadable' | 'too_large'). The bytes are only read. */
export async function renderModelPng(bytes, fileName, limits = PREVIEW_LIMITS) {
  const positions = await parseForPreview(bytes, fileName)
  if (positions.length / 9 > limits.maxTriangles) throw new PreviewError('too_large', 'This model has too many triangles to preview.')
  const ss = Math.max(1, Math.min(3, limits.supersample || 1))
  const shaded = shadeModel(positions, limits.width * ss, limits.height * ss, { maxMillis: limits.renderMs, margin: 14 * ss })
  const { default: sharp } = await import('sharp')
  let png
  try {
    let image = sharp(Buffer.from(shaded.pixels.buffer, shaded.pixels.byteOffset, shaded.pixels.byteLength), { raw: { width: shaded.width, height: shaded.height, channels: 3 } })
    if (ss > 1) image = image.resize(limits.width, limits.height, { kernel: 'lanczos3' })
    png = await image.png({ compressionLevel: 9 }).toBuffer()
  } catch { throw new PreviewError('unreadable', 'The preview could not be drawn.') }
  return { png, width: limits.width, height: limits.height, triangles: shaded.triangles, bbox: shaded.bbox }
}

/** Default byte source: the same S3 reads as the order model viewer, with the private-bucket check unchanged for guided files and a hard size limit. */
export async function loadModelBytes(storage, { maxBytes = PREVIEW_LIMITS.maxFileBytes, signal } = {}) {
  const [{ GetObjectCommand }, { s3 }, { privateFabricationBucket }] = await Promise.all([import('@aws-sdk/client-s3'), import('@/lib/s3'), import('@/lib/fabrication/serverAssets')])
  const bucket = storage.kind === 'guided' ? await privateFabricationBucket(storage.bucket) : storage.bucket
  if (signal?.aborted) throw new PreviewError('timeout', 'Out of time.')
  const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: storage.key }), signal ? { abortSignal: signal } : undefined)
  const stop = () => object.Body?.destroy?.()
  signal?.addEventListener?.('abort', stop, { once: true })
  try {
    if (object.ContentLength > maxBytes) throw new PreviewError('too_large', 'This file is too large to preview.')
    const chunks = []; let total = 0
    for await (const chunk of object.Body) {
      if (signal?.aborted) throw new PreviewError('timeout', 'Out of time.')
      total += chunk.length
      if (total > maxBytes) throw new PreviewError('too_large', 'This file is too large to preview.')
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  } catch (error) { stop(); throw error } finally { signal?.removeEventListener?.('abort', stop) }
}

/** Default asset lookup: only files listed on the request AND owned by the request's customer. */
export async function loadOwnedAssets(request) {
  const ids = [...new Set([...(request.guidedAssets || []).map(a => a.assetId), request.guidedAssetId].filter(Boolean))].filter(isSafeId)
  if (!ids.length) return {}
  const [{ connectToDatabase }, { default: FabricationAsset }] = await Promise.all([import('@/lib/db'), import('@/models/FabricationAsset')])
  await connectToDatabase()
  const found = await FabricationAsset.find({ assetId: { $in: ids }, ownerUserId: request.userId }).lean()
  return Object.fromEntries(found.map(asset => [asset.assetId, asset]))
}

const withTimeout = (promise, ms, controller) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { controller?.abort(); reject(new PreviewError('timeout', 'Preview timed out.')) }, Math.max(1, ms))
  promise.then(v => { clearTimeout(timer); resolve(v) }, e => { clearTimeout(timer); reject(e) })
})

// What a customer's own email may show of a price: the recorded amounts only (no payment state or staff detail).
const customerPrice = price => {
  if (!price) return { state: 'not_quoted' }
  const { state, scope, unit, quantity, amount, currency, mismatch, requestQuantity } = price
  return { state, ...(scope ? { scope } : {}), ...(unit != null ? { unit } : {}), ...(quantity != null ? { quantity } : {}), ...(amount != null ? { amount } : {}), ...(currency ? { currency } : {}), ...(mismatch ? { mismatch: true, requestQuantity } : {}) }
}

const reasonOf = error => (error instanceof PreviewError && ['unsupported', 'unreadable', 'too_large'].includes(error.kind) ? error.kind : 'unreadable')

/**
 * @returns {{ models: object[]|null, previews: Record<string, object>, attachments: object[] }} `models: null` means "send the original email".
 */
export async function prepareNudgePreviews(request, { loadAssets = loadOwnedAssets, loadBytes = loadModelBytes, render = renderModelPng, limits = PREVIEW_LIMITS, now = Date.now } = {}) {
  const empty = { models: null, previews: {}, attachments: [] }
  if (!request?.requestId || !request.userId || !request.userEmail) return empty
  const deadline = now() + limits.budgetMs
  const controller = new AbortController()
  let view
  try {
    const assets = await withTimeout(Promise.resolve(loadAssets(request)), deadline - now(), controller)
    view = { assets: assets || {} }
    view.view = buildPreviewModels(request, { assets: view.assets })
  } catch { return empty }
  const models = view.view.models.map(model => ({ ...model, price: customerPrice(model.price) }))
  if (!models.length) return empty
  const nonce = randomBytes(8).toString('hex')   // a CID is only ever valid inside this one email
  const previews = {}, attachments = []
  let attached = 0, bytesRead = 0
  for (const model of models) {
    const unavailable = reason => { previews[model.id] = { status: 'unavailable', reason } }
    if (attached >= limits.maxModels) { unavailable('not_included'); continue }
    const storage = model.fileAvailable ? storageFor(request, model, view.assets) : null
    if (!storage) { unavailable('missing'); continue }
    if (!model.previewable) { unavailable('unsupported'); continue }
    try {
      const remaining = deadline - now()
      if (remaining <= 0) throw new PreviewError('timeout', 'Out of time.')
      if (bytesRead >= limits.maxTotalBytes) throw new PreviewError('too_large', 'Too much data for one email.')
      const allowed = Math.min(limits.maxFileBytes, limits.maxTotalBytes - bytesRead)
      const bytes = await withTimeout(Promise.resolve(loadBytes(storage, { maxBytes: allowed, signal: controller.signal })), remaining, controller)
      if (!bytes || bytes.length === 0) throw new PreviewError('unreadable', 'Empty file.')
      bytesRead += bytes.length
      if (bytes.length > allowed) throw new PreviewError('too_large', 'Too large.')
      const picture = await withTimeout(Promise.resolve(render(bytes, storage.fileName || model.fileName, limits)), deadline - now(), controller)
      if (!picture?.png?.length || picture.png.length > limits.maxPngBytes) throw new PreviewError('too_large', 'Picture too large.')
      attached += 1
      const cid = `model-preview-${nonce}-${attached}@fixitoday.local`
      previews[model.id] = { status: 'ready', cid, modelId: model.id, width: picture.width, height: picture.height, requestId: request.requestId, ownerUserId: request.userId }
      attachments.push({ filename: `model-preview-${attached}.png`, content: picture.png, contentType: 'image/png', contentDisposition: 'inline', cid })
    } catch (error) {
      unavailable(error?.kind === 'timeout' ? 'timeout' : reasonOf(error))
      console.error(`[nudge:previews] ${request.requestId} model ${model.index + 1}: ${error?.kind || error?.name || 'error'}`)
    }
  }
  return { models, previews, attachments }
}
