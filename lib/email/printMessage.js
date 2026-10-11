// Optional presentation only. A missing/unsupported model never blocks mail.
const MAX_BYTES = 4 * 1024 * 1024
export function ownedModelKey(request) {
  const file = request?.modelFile, user = request?.userId, key = file?.s3Key
  if (request?.source === 'product' || !/^[a-zA-Z0-9_-]{1,128}$/.test(user || '') ||
      typeof key !== 'string' || key.length > 1024 || !key.startsWith(`models/${user}/`) ||
      /[\\\0]/.test(key) || key.split('/').includes('..') ||
      !/\.(stl|obj|3mf)$/i.test(file?.originalName || '') || Number(file.fileSize) > MAX_BYTES) return null
  return key
}
async function readOwnedModel(request, key) {
  const bucket = process.env.NEXT_PUBLIC_S3_BUCKET_NAME
  if (!bucket) return null
  const [{ s3 }, { GetObjectCommand }] = await Promise.all([import('@/lib/s3'), import('@aws-sdk/client-s3')])
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 4000)
  let body
  try {
    const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: controller.signal })
    body = response.Body
    if (!body || response.ContentLength > MAX_BYTES) return null
    const chunks = []; let length = 0
    for await (const chunk of body) {
      length += chunk.length
      if (length > MAX_BYTES) return null
      chunks.push(Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  } finally { clearTimeout(timer); body?.destroy?.() }
}
export async function thumbnailForRequest(request, { read = readOwnedModel, render } = {}) {
  const key = ownedModelKey(request)
  if (!key) return null
  try {
    const bytes = await read(request, key)
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_BYTES) return null
    const renderer = render || (await import('./modelThumbnail')).renderModelThumbnail
    const colours = Object.values(request?.printConfiguration?.meshColors || {})
    const colour = colours.length && colours.every(v => v === colours[0]) && /^#[0-9a-f]{6}$/i.test(colours[0]) ? colours[0] : '#b8c5d0'
    return await renderer(bytes, request.modelFile.originalName, { colour })
  } catch { return null }
}
export async function preparePrintEmail(builder, args, { thumbnail = thumbnailForRequest } = {}) {
  const fallback = builder(args)
  if (!fallback) return null
  try {
    const image = await thumbnail(args?.request)
    if (!image) return fallback
    const built = builder({ ...args, preview: image.preview })
    return { ...built, attachments: [...(built.attachments || []), image.attachment] }
  } catch { return fallback }
}
