import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { WORKSHOP_SESSION } from './workshopFeedback'
import { validGuestAccess } from './workshopGuestIdentity'
import { CANVAS_IMAGE_LIMITS as LIMITS, canvasImageId, canvasImageMatches, validCanvasImage } from './workshopCanvasImageRef'
export class CanvasImageError extends Error { constructor(message, status = 400) { super(message); this.status = status } }
export function canvasImageQuery(request, upload = false) {
    const params = new URL(request.url).searchParams, group = params.get('homeGroup'), idea = params.get('idea'), digest = params.get('id')
    for (const key of params.keys()) if (!(upload ? ['homeGroup', 'idea'] : ['homeGroup', 'idea', 'id']).includes(key) || params.getAll(key).length !== 1) throw new CanvasImageError('Choose this group and idea image.')
    if (!/^g(?:[1-9]|10)$/.test(group || '') || !['1', '2'].includes(idea) || !upload && !/^[a-f0-9]{64}$/.test(digest || '')) throw new CanvasImageError('Choose an existing group image.')
    return { group, idea, ...(upload ? {} : { key: `${group}-${idea}-${digest}` }) }
}
export async function canvasImageBody(request) {
    const mime = request.headers.get('content-type')?.toLowerCase()
    if (!['image/png', 'image/jpeg'].includes(mime)) throw new CanvasImageError('Choose a PNG or JPEG picture.', 415)
    if (Number(request.headers.get('content-length')) > LIMITS.inputBytes) throw new CanvasImageError('Choose an image smaller than 4 MB.', 413)
    const reader = request.body?.getReader(); if (!reader) throw new CanvasImageError('Choose an image first.')
    const chunks = []; let bytes = 0, timer
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { reader.cancel().catch(() => {}); reject(new CanvasImageError('Image upload timed out. Your drawing is unchanged.', 408)) }, 10000) })
    try { while (true) { const next = await Promise.race([reader.read(), timeout]); if (next.done) break; bytes += next.value.length; if (bytes > LIMITS.inputBytes) { await reader.cancel(); throw new CanvasImageError('Choose an image smaller than 4 MB.', 413) }; chunks.push(next.value) }; return { source: Buffer.concat(chunks), mime } }
    finally { clearTimeout(timer); reader.releaseLock() }
}
function framing(source, mime) {
    if (mime === 'image/jpeg') return source.length >= 4 && source[0] === 255 && source[1] === 216 && source[2] === 255 && source.at(-2) === 255 && source.at(-1) === 217
    if (source.length < 33 || !source.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return false
    let offset = 8
    while (offset + 12 <= source.length) { const length = source.readUInt32BE(offset), type = source.toString('ascii', offset + 4, offset + 8); if (length > source.length - offset - 12 || ['acTL', 'fcTL', 'fdAT'].includes(type)) return false; offset += length + 12; if (type === 'IEND') return length === 0 && offset === source.length }
    return false
}
export async function storeCanvasImage(store, access, group, idea, { source, mime }) {
    if (!validGuestAccess(access) || access.group !== group || !['1', '2'].includes(idea)) throw new CanvasImageError('Use your own group image.', 403)
    if (!Buffer.isBuffer(source) || !source.length || source.length > LIMITS.inputBytes || !framing(source, mime)) throw new CanvasImageError('This is not a valid PNG or JPEG export. Your drawing is unchanged.')
    const key = `${group}-${idea}-${createHash('sha256').update(source).digest('hex')}`, _id = canvasImageId(key)
    const existing = await store.findOne({ _id }, { projection: { key: 1, width: 1, height: 1 } })
    if (existing) return { key: existing.key, width: existing.width, height: existing.height }
    let preview
    try {
        const meta = await sharp(source, { limitInputPixels: LIMITS.pixels, failOn: 'warning' }).metadata()
        if (meta.format !== (mime === 'image/png' ? 'png' : 'jpeg') || (meta.pages || 1) !== 1 || !meta.width || !meta.height || Math.max(meta.width, meta.height) > LIMITS.dimension) throw Error('Unsupported image')
        preview = await sharp(source, { limitInputPixels: LIMITS.pixels, failOn: 'warning' }).rotate().resize({ width: LIMITS.previewDimension, height: LIMITS.previewDimension, fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
        if (preview.data.length > LIMITS.previewBytes) throw new CanvasImageError('Choose a smaller image export. Your drawing is unchanged.', 413)
    } catch (error) { if (error instanceof CanvasImageError) throw error; throw new CanvasImageError('This image is corrupt, animated or too large. Choose another PNG or JPEG. Your drawing is unchanged.') }
    const descriptor = { key, width: preview.info.width, height: preview.info.height }
    if (!validCanvasImage(descriptor) || !canvasImageMatches(descriptor, group, idea)) throw new CanvasImageError('Image could not be prepared. Your drawing is unchanged.')
    const row = { _id, kind: 'canvas-image', session: WORKSHOP_SESSION, group, idea, ...descriptor, source: Buffer.from(source), sourceMime: mime, preview: preview.data, createdAt: new Date(), processingVersion: 1 }
    try { await store.insertOne(row) } catch (error) { if (error.code !== 11000) throw error; const saved = await store.findOne({ _id }, { projection: { key: 1, width: 1, height: 1 } }); if (!saved || saved.key !== key) throw error; return { key: saved.key, width: saved.width, height: saved.height } }
    return descriptor
}
