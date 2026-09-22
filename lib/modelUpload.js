import { randomUUID } from 'node:crypto'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { s3 } from '@/lib/s3'
import { sanitizeKeyPart } from '@/lib/uploadKey'

export const MODEL_UPLOAD_MAX_BYTES = 25 * 1024 * 1024
export const VIEWABLE_UPLOAD_MAX_BYTES = 15 * 1024 * 1024

export function validateModelUpload(body, viewable = false) {
  const { filename, contentType, fileSize } = body || {}
  const extensions = viewable ? ['glb', 'gltf'] : ['stl', 'obj', '3mf']
  const maximum = viewable ? VIEWABLE_UPLOAD_MAX_BYTES : MODEL_UPLOAD_MAX_BYTES
  if (typeof filename !== 'string' || !extensions.includes(filename.split('.').pop().toLowerCase())) {
    return { error: `Supported files: ${extensions.join(', ').toUpperCase()}` }
  }
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > maximum) {
    return { error: `File size must be between 1 byte and ${maximum / 1024 / 1024} MB` }
  }
  if (typeof contentType !== 'string' || !/^[\w.+-]+\/[\w.+-]+$/.test(contentType)) {
    return { error: 'A valid content type is required' }
  }
  return { filename: sanitizeKeyPart(filename), contentType, fileSize }
}

export async function signModelUpload(userId, body, viewable = false) {
  const validated = validateModelUpload(body, viewable)
  if (validated.error) return validated
  const key = `${viewable ? 'viewables' : 'models'}/${userId}/${randomUUID()}-${validated.filename}`
  const command = new PutObjectCommand({
    Bucket: process.env.NEXT_PUBLIC_S3_BUCKET_NAME,
    Key: key,
    ContentType: validated.contentType,
    ContentLength: validated.fileSize,
  })
  // The browser sends Content-Length for its Blob body. Signing that exact
  // length means a larger upload fails S3 signature validation; accepting a
  // declared size in JSON without signing it would not enforce the limit.
  const url = await getSignedUrl(s3, command, {
    expiresIn: 300,
    signableHeaders: new Set(['content-length', 'content-type']),
  })
  return { url, key }
}
