import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { GetObjectCommand, PutObjectCommand, GetPublicAccessBlockCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { s3 } from '@/lib/s3'
import FabricationAsset from '@/models/FabricationAsset'
import FabricationRequest from '@/models/FabricationRequest'
import CreatorFabricationService from '@/models/CreatorFabricationService'
import CreatorFabricationOffer from '@/models/CreatorFabricationOffer'
import { validateModelResponse } from '@/lib/modelImport/file'
import { fabricationEntitlements } from './serverAccess'
import { checkedId, fail, readBytes } from './serverHttp'
import { reserveDailyFabricationAsset } from './serverAssetQuota'

const MAX_UPLOAD = 3 * 1024 * 1024
const privateChecks = new Map()
const safeName = name => String(name || 'file').split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._ ()-]/g, '_').slice(-160)

export async function privateFabricationBucket(bucket = process.env.FABRICATION_S3_BUCKET_NAME) {
  if (!bucket || bucket !== process.env.FABRICATION_S3_BUCKET_NAME) fail('Private fabrication storage is not configured.', 503, 'storage_unavailable')
  if ((privateChecks.get(bucket) || 0) > Date.now()) return bucket
  let result
  try { result = await s3.send(new GetPublicAccessBlockCommand({ Bucket: bucket })) } catch {
    fail('Private fabrication storage could not be verified.', 503, 'storage_unavailable')
  }
  const config = result.PublicAccessBlockConfiguration || {}
  if (!['BlockPublicAcls', 'IgnorePublicAcls', 'BlockPublicPolicy', 'RestrictPublicBuckets'].every(key => config[key] === true)) {
    fail('Fabrication storage must have all public-access blocks enabled.', 503, 'storage_unavailable')
  }
  privateChecks.set(bucket, Date.now() + 60000)
  return bucket
}

export async function shapeFabricationAsset(asset) {
  if (!asset) return null
  await privateFabricationBucket(asset.bucket)
  const image = asset.kind === 'image'
  const filename = safeName(asset.originalName)
  const url = await getSignedUrl(s3, new GetObjectCommand({
    Bucket: asset.bucket, Key: asset.key,
    ResponseContentType: image ? 'image/webp' : 'application/octet-stream',
    ResponseContentDisposition: `${image ? 'inline' : 'attachment'}; filename="${image ? `${filename.replace(/\.[^.]*$/, '')}.webp` : filename}"`,
    ResponseCacheControl: 'private, no-store',
  }), { expiresIn: 300 })
  return { assetId: asset.assetId, kind: asset.kind, originalName: asset.originalName,
    ...(image ? { imageUrl: url, width: asset.width, height: asset.height } : { fileUrl: url }) }
}

export async function findOwnedAsset(assetId, userId, kind) {
  const asset = await FabricationAsset.findOne({ assetId: checkedId(assetId, 'asset ID'), ownerUserId: userId, ...(kind ? { kind } : {}) }).lean()
  if (!asset) fail('That attachment is not available to this account.', 400, 'invalid_attachment')
  return asset
}

export async function validateCatalogAssets(catalog, userId) {
  const ids = [...new Set((catalog.offers || []).map(offer => offer.template?.assetId).filter(Boolean))]
  for (const id of ids) await findOwnedAsset(id, userId, 'image')
}

export async function shapeFabricationCatalog(catalog, creatorUserId) {
  const copy = structuredClone(catalog)
  for (const offer of copy.offers || []) {
    if (!offer.template?.assetId) continue
    const asset = await FabricationAsset.findOne({ assetId: offer.template.assetId, ownerUserId: creatorUserId, kind: 'image' }).lean()
    if (!asset) fail('A catalog template is unavailable. The creator needs to update it.', 503, 'template_unavailable')
    const image = await shapeFabricationAsset(asset)
    offer.template = { ...offer.template, imageUrl: image.imageUrl, width: image.width, height: image.height, originalName: image.originalName }
  }
  return copy
}

export async function authorizedFabricationAsset(assetId, userId) {
  const asset = await FabricationAsset.findOne({ assetId: checkedId(assetId, 'asset ID') }).lean()
  if (!asset) fail('Attachment not found.', 404)
  if (userId && asset.ownerUserId === userId) return asset
  if (userId) {
    const attached = await FabricationRequest.exists({ $and: [
      { $or: [{ customerUserId: userId }, { creatorUserId: userId }] },
      { $or: [{ imageAssetId: asset.assetId }, { referenceAssetId: asset.assetId }] },
    ] })
    if (attached) return asset
  }
  if (asset.kind === 'image') {
    const service = await CreatorFabricationService.findOne({ creatorUserId: asset.ownerUserId }).lean()
    const enabled = service?.catalog ? service.catalog.enabled === true : service?.enabled === true
    if (enabled) {
      const publishedOffer = await CreatorFabricationOffer.exists({ creatorUserId: asset.ownerUserId, enabled: true, 'offer.template.assetId': asset.assetId })
      const legacyTemplate = service.catalog && !(await CreatorFabricationOffer.exists({ creatorUserId: asset.ownerUserId })) &&
        service.catalog.offers?.some(offer => offer.enabled && offer.template?.assetId === asset.assetId)
      if ((publishedOffer || legacyTemplate) && (await fabricationEntitlements(asset.ownerUserId)).canManage) return asset
    }
  }
  fail('Attachment not found.', 404)
}

export async function createFabricationAsset(request, userId) {
  const contentType = request.headers.get('content-type') || ''
  if (!contentType.startsWith('multipart/form-data;')) fail('Upload a file using multipart form data.')
  const body = await readBytes(request, MAX_UPLOAD + 65536)
  let form
  try { form = await new Request(request.url, { method: 'POST', headers: { 'content-type': contentType }, body }).formData() } catch { fail('Invalid file upload.') }
  const entries = [...form.entries()]
  const file = form.get('file')
  if (entries.length !== 1 || !file || typeof file.arrayBuffer !== 'function') fail('Upload one file in the file field.')
  if (!file.size || file.size > MAX_UPLOAD) fail('Files must be no larger than 3 MB.', 413)
  const input = Buffer.from(await file.arrayBuffer())
  const originalName = safeName(file.name)
  const extension = originalName.toLowerCase().split('.').pop()
  let bytes, kind, outputType, width, height, outputExtension
  if (['png', 'jpg', 'jpeg', 'webp'].includes(extension)) {
    const png = input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    const jpeg = input[0] === 255 && input[1] === 216 && input[2] === 255
    const webp = input.subarray(0, 4).toString() === 'RIFF' && input.subarray(8, 12).toString() === 'WEBP'
    if (!png && !jpeg && !webp) fail('This file is not a PNG, JPEG or WebP image.')
    try {
      const instance = sharp(input, { limitInputPixels: 4096 * 4096, failOn: 'warning', animated: false })
      const metadata = await instance.metadata()
      if (!['png', 'jpeg', 'webp'].includes(metadata.format) || !metadata.width || !metadata.height ||
          metadata.width > 4096 || metadata.height > 4096 || (metadata.pages || 1) !== 1) fail('Use a single PNG, JPEG or WebP image no larger than 4096 × 4096 pixels.')
      const output = await instance.rotate().webp({ quality: 90, effort: 3 }).toBuffer({ resolveWithObject: true })
      bytes = output.data; width = output.info.width; height = output.info.height
      if (bytes.length > 6 * 1024 * 1024) fail('This image is too large after processing. Upload a smaller image.', 413)
    } catch (error) {
      if (error?.status) throw error
      fail('This image could not be decoded safely. Use a PNG, JPEG or WebP image up to 4096 × 4096 pixels.')
    }
    kind = 'image'; outputType = 'image/webp'; outputExtension = 'webp'
  } else if (['stl', 'obj', '3mf'].includes(extension)) {
    try { validateModelResponse({ body: input, url: `https://upload.invalid/${encodeURIComponent(originalName)}`, headers: {} }, originalName) } catch {
      fail('This reference file is not a supported, complete STL, OBJ or 3MF file.')
    }
    bytes = input; kind = 'reference'; outputType = 'application/octet-stream'; outputExtension = extension
  } else if (extension === 'pdf') {
    if (!input.subarray(0, 5).equals(Buffer.from('%PDF-')) || !input.subarray(-1024).toString('latin1').includes('%%EOF')) fail('This reference file is not a complete PDF.')
    bytes = input; kind = 'reference'; outputType = 'application/octet-stream'; outputExtension = 'pdf'
  } else fail('Use PNG, JPEG, WebP, STL, OBJ, 3MF or PDF. Files must be no larger than 3 MB.')
  const bucket = await privateFabricationBucket()
  const assetId = randomUUID()
  const key = `fabrication/${userId}/${assetId}.${outputExtension}`
  const reservation = await reserveDailyFabricationAsset(userId)
  try {
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: outputType,
      CacheControl: 'private, no-store', ContentDisposition: `${kind === 'image' ? 'inline' : 'attachment'}; filename="${originalName}"` }))
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode
    // Keep reservations for ambiguous network/5xx responses: the object may exist.
    if (status >= 400 && status < 500 && status !== 408) await reservation.release()
    throw error
  }
  // If persistence fails, retain the private object for lifecycle/operator cleanup;
  // immediate deletes can race a successful but uncertain database write.
  const asset = await FabricationAsset.create({ assetId, ownerUserId: userId, kind, bucket, key, originalName,
    contentType: outputType, byteLength: bytes.length, ...(kind === 'image' ? { width, height } : {}) })
  return shapeFabricationAsset(asset.toObject?.() || asset)
}
