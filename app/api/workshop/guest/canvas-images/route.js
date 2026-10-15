import { requireGuestAccess, requireGuestTeacher } from '@/lib/workshopGuestAccess'
import { guestDb, classJson, classFailure, sameOrigin, limitGuestOperation } from '@/lib/workshopGuestHttp'
import { requireCanvasEnabled } from '@/lib/workshopCanvasHttp'
import { canvasId } from '@/lib/workshopCanvasStore'
import { canvasImageId } from '@/lib/workshopCanvasImageRef'
import { canvasImageQuery, canvasImageBody, storeCanvasImage, CanvasImageError } from '@/lib/workshopCanvasImages'
import { WORKSHOP_SESSION } from '@/lib/workshopFeedback'
export const runtime = 'nodejs'
export async function GET(request) {
    try {
        requireCanvasEnabled(); const query = canvasImageQuery(request); let access, scopeError
        try { access = await requireGuestAccess(request); if (access.group !== query.group) scopeError = new CanvasImageError('Use your own group image.', 403) } catch (error) { if (error.status && error.status !== 401) throw error }
        if (!access || scopeError) { try { await requireGuestTeacher(request) } catch (error) { throw scopeError || error } }
        const db = await guestDb(), row = await db.collection('workshopGuestLessons').findOne({ _id: canvasImageId(query.key), kind: 'canvas-image', session: WORKSHOP_SESSION, group: query.group, idea: query.idea }, { projection: { preview: 1 } })
        if (!row?.preview) throw new CanvasImageError('This saved image was not found.', 404)
        const bytes = Buffer.isBuffer(row.preview) ? row.preview : row.preview.value?.()
        if (!Buffer.isBuffer(bytes)) throw new CanvasImageError('This saved image is unavailable.', 503)
        return new Response(bytes, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'X-Robots-Tag': 'noindex, nofollow' } })
    } catch (error) { return classFailure(error) }
}
export async function POST(request) {
    try {
        requireCanvasEnabled(); sameOrigin(request); const access = await requireGuestAccess(request), query = canvasImageQuery(request, true)
        if (access.group !== query.group) throw new CanvasImageError('Use your own group image.', 403)
        const db = await guestDb(); await limitGuestOperation(db, 'canvas-image-' + access.seat, 5); await limitGuestOperation(db, 'canvas-image-group-' + access.group, 12)
        const store = db.collection('workshopGuestLessons'), current = await store.findOne({ _id: canvasId(query.group, query.idea) }, { projection: { status: 1 } })
        if (current?.status === 'submitted') throw new CanvasImageError('Start a new drawing revision before adding an image.', 409)
        const image = await storeCanvasImage(store, access, query.group, query.idea, await canvasImageBody(request))
        return classJson({ image })
    } catch (error) { return classFailure(error) }
}
