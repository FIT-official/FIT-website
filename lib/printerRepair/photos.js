import { randomUUID } from 'node:crypto'
import PrinterRepairPhoto from '@/models/PrinterRepairPhoto'
import PrinterRepairRequest from '@/models/PrinterRepairRequest'
import CreatorQuota from '@/models/CreatorQuota'
import { findOwnedAsset, shapeFabricationAsset, privateFabricationBucket } from '@/lib/fabrication/serverAssets'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { s3 } from '@/lib/s3'
import { checkedClientRequestId, fail, readBytes } from '@/lib/fabrication/serverHttp'
import { normalizeRepairPhoto, safePhotoName } from './photoDecode'
import { REPAIR_PHOTO_BYTES, REPAIR_PHOTO_LIMIT } from './validate'

let ready
async function ensureIndexes() {
  if (!ready) ready = PrinterRepairPhoto.createIndexes().catch(error => { ready = null; throw error })
  await ready
}
async function reserve(key, amount, limit) {
  try { await CreatorQuota.updateOne({ _id: key }, { $setOnInsert: { used: 0 } }, { upsert: true }) }
  catch (error) { if (error.code !== 11000) throw error }
  const result = await CreatorQuota.findOneAndUpdate({ _id: key, used: { $lte: limit - amount } }, { $inc: { used: amount } }, { new: true })
  if (!result) fail('The photo storage limit has been reached. Keep your draft and contact FIT, or send without photos.', 429, 'photo_storage_limit')
}
export function shapeRepairPhoto(photo) {
  if (photo.bucket) return shapeFabricationAsset(photo)
  return { assetId: photo.assetId, kind: 'image', originalName: photo.originalName, width: photo.width, height: photo.height, imageUrl: `/api/printer-repair/photos/${photo.assetId}` }
}
export async function ownedRepairPhoto(assetId, userId, kind = 'image', { bytes = false } = {}) {
  checkedClientRequestId(assetId)
  let query = PrinterRepairPhoto.findOne({ assetId, ownerUserId: userId })
  if (bytes) query = query.select('+bytes')
  const photo = await query.lean()
  // Retain access to existing private S3 photos; no migration or public fallback.
  return photo || findOwnedAsset(assetId, userId, kind)
}
export async function createRepairPhoto(request, userId) {
  const contentType = request.headers.get('content-type') || ''
  if (!contentType.startsWith('multipart/form-data;')) fail('Choose one photo to upload.')
  const body = await readBytes(request, REPAIR_PHOTO_BYTES + 65536)
  let form
  try { form = await new Request(request.url, { method: 'POST', headers: { 'content-type': contentType }, body }).formData() } catch { fail('Invalid photo upload.') }
  const file = form.get('file')
  if ([...form.entries()].length !== 1 || !file || typeof file.arrayBuffer !== 'function') fail('Upload one photo in the file field.')
  if (!file.size || file.size > REPAIR_PHOTO_BYTES) fail('Each photo must be between 1 byte and 3 MB.', 413)
  const photo = await normalizeRepairPhoto(Buffer.from(await file.arrayBuffer()), file.name)
  await ensureIndexes()
  // Separate counters cannot oversubscribe. Keep reservations on any uncertain
  // outcome: losing a little capacity is safer than unbounded database growth.
  // 25 MiB total retained bytes, 5 MiB per account, 15 images per UTC day.
  // A separate total-count cap also bounds document/index overhead for tiny images.
  await reserve(`repair-photos:${userId}:${new Date().toISOString().slice(0,10)}`, 1, 15)
  await reserve(`repair-photo-bytes:${userId}`, photo.bytes.length, 5 * 1024 * 1024)
  await reserve('repair-photo-bytes:global', photo.bytes.length, 25 * 1024 * 1024)
  await reserve('repair-photo-count:global', 1, 2000)
  const saved = await PrinterRepairPhoto.create({ ...photo, byteLength: photo.bytes.length, assetId: randomUUID(), ownerUserId: userId })
  return shapeRepairPhoto(saved)
}
export async function authorizedRepairPhoto(assetId, userId, isAdmin = false) {
  checkedClientRequestId(assetId)
  if (!userId) fail('Sign in to view this photo.', 401)
  const photo = await PrinterRepairPhoto.findOne({ assetId }).select('+bytes').lean()
  if (!photo) fail('Photo not found.', 404)
  if (photo.ownerUserId !== userId && !(isAdmin && await PrinterRepairRequest.exists({ customerUserId: photo.ownerUserId, photoAssetIds: assetId }))) fail('Photo not found.', 404)
  return photo
}
export async function repairPhotoAttachments(row) {
  if (!Array.isArray(row.photoAssetIds) || row.photoAssetIds.length > REPAIR_PHOTO_LIMIT) fail('Photo attachments could not be verified.', 503)
  const attachments = []
  for (const [index, id] of row.photoAssetIds.entries()) {
    const photo = await ownedRepairPhoto(id, row.customerUserId, 'image', { bytes: true })
    let content
    if (photo.bucket) {
      await privateFabricationBucket(photo.bucket)
      const object = await s3.send(new GetObjectCommand({ Bucket: photo.bucket, Key: photo.key }))
      const chunks = []; let size = 0
      try {
        for await (const chunk of object.Body) { size += chunk.length; if (size > REPAIR_PHOTO_BYTES) fail('Photo attachment exceeds its safe limit.', 503); chunks.push(Buffer.from(chunk)) }
      } finally { object.Body?.destroy?.() }
      content = (await normalizeRepairPhoto(Buffer.concat(chunks), 'existing.webp')).bytes
    } else content = Buffer.isBuffer(photo.bytes) ? photo.bytes : Buffer.from(photo.bytes?.value?.() || [])
    if (!content.length || content.length > 512 * 1024) fail('Photo attachment is unavailable. Please retry after checking the saved photo.', 503)
    attachments.push({ filename: `${index + 1}-${safePhotoName(photo.originalName).replace(/\.[^.]*$/, '') || 'photo'}.jpg`, content, contentType: 'image/jpeg', contentDisposition: 'attachment' })
  }
  return attachments
}
