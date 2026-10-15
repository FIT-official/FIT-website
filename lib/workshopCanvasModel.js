import { resolveCanvasReference } from './workshopPublication'
import { validCanvasImage } from './workshopCanvasImageRef'
export const BOARD = Object.freeze({ width: 1600, height: 1000 })
export const CANVAS_LIMITS = Object.freeze({ objects: 240, points: 16000, bytes: 240000, historyBytes: 8_000_000 })
export const blankCanvas = () => ({ format: 1, width: BOARD.width, height: BOARD.height, objects: [] })
export const copyCanvas = value => JSON.parse(JSON.stringify(value))
export const sameCanvas = (a, b) => JSON.stringify(a) === JSON.stringify(b)
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n))
const plain = o => o && typeof o === 'object' && !Array.isArray(o)
const keys = (o, allowed) => plain(o) && Object.keys(o).every(k => allowed.includes(k))
const number = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max
const colour = c => /^#[0-9a-f]{6}$/i.test(c || '')
export function validCanvas(doc) {
    if (!keys(doc, ['format', 'width', 'height', 'objects', 'reference', 'image']) || doc.format !== 1 || doc.width !== BOARD.width || doc.height !== BOARD.height || !Array.isArray(doc.objects) || doc.objects.length > CANVAS_LIMITS.objects || doc.reference !== undefined && !resolveCanvasReference(doc.reference) || doc.image !== undefined && !validCanvasImage(doc.image)) return false
    const ids = new Set(); let points = 0
    for (const o of doc.objects) {
        if (!keys(o, ['id', 'type', 'x', 'y', 'w', 'h', 'colour', 'fill', 'size', 'opacity', 'points', 'text', 'fontSize', 'reverse', 'backward', 'lineStyle']) || !/^[a-z0-9-]{8,64}$/i.test(o.id || '') || ids.has(o.id)) return false
        ids.add(o.id)
        if (!['stroke', 'rect', 'ellipse', 'line', 'arrow', 'text'].includes(o.type) || !number(o.x, 0, BOARD.width) || !number(o.y, 0, BOARD.height) || !number(o.w, 1, BOARD.width) || !number(o.h, 1, BOARD.height) || o.x + o.w > BOARD.width + 1 || o.y + o.h > BOARD.height + 1 || !colour(o.colour) || !(o.fill === 'none' || colour(o.fill)) || !number(o.size, 1, 30) || ![1, .3].includes(o.opacity)) return false
        if (o.type === 'stroke') { if (!Array.isArray(o.points) || !o.points.length || o.points.length > 3000) return false; points += o.points.length; if (o.points.some(p => !Array.isArray(p) || p.length !== 2 || !number(p[0], 0, 1) || !number(p[1], 0, 1))) return false }
        else if (o.points !== undefined) return false
        if (o.type === 'text') { if (typeof o.text !== 'string' || o.text.length > 240 || /https?:\/\/|\b[^\s@]+@[^\s@]+\.[^\s@]+\b|[\u0000-\u0008\u000b-\u001f]/i.test(o.text) || !number(o.fontSize, 16, 80)) return false }
        else if (o.text !== undefined || o.fontSize !== undefined) return false
        if (o.reverse !== undefined && (!['line', 'arrow'].includes(o.type) || typeof o.reverse !== 'boolean')) return false
        if (o.backward !== undefined && (!['line', 'arrow'].includes(o.type) || typeof o.backward !== 'boolean')) return false
        if (o.lineStyle !== undefined && (o.type === 'text' || !['solid', 'dotted'].includes(o.lineStyle))) return false
    }
    return points <= CANVAS_LIMITS.points && new TextEncoder().encode(JSON.stringify(doc)).length <= CANVAS_LIMITS.bytes
}
export function strokeObject(points, settings, id) {
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]), x = Math.min(...xs), y = Math.min(...ys), w = Math.max(1, Math.max(...xs) - x), h = Math.max(1, Math.max(...ys) - y)
    return { id, type: 'stroke', x, y, w, h, colour: settings.colour, fill: 'none', size: settings.size, opacity: settings.opacity, ...(settings.lineStyle === 'dotted' ? { lineStyle: 'dotted' } : {}), points: points.map(p => [Number(((p[0] - x) / w).toFixed(4)), Number(((p[1] - y) / h).toFixed(4))]) }
}
export function translateObject(o, dx, dy, snap = false) { const unit = snap ? 20 : 1; return { ...o, x: clamp(Math.round((o.x + dx) / unit) * unit, 0, BOARD.width - o.w), y: clamp(Math.round((o.y + dy) / unit) * unit, 0, BOARD.height - o.h) } }
export function resizeObject(o, dw, dh, constrain = false) { let w = clamp(o.w + dw, 12, BOARD.width - o.x), h = clamp(o.h + dh, 12, BOARD.height - o.y); if (constrain) { const scale = Math.min(w / o.w, h / o.h); w = o.w * scale; h = o.h * scale }; return { ...o, w, h } }
export function shapeObject(type, a, b, settings, id, constrain = false) {
    let dx = b[0] - a[0], dy = b[1] - a[1]
    if (constrain) { if (['line', 'arrow'].includes(type)) { const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4, d = Math.hypot(dx, dy); dx = Math.cos(angle) * d; dy = Math.sin(angle) * d } else { const size = Math.min(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * size; dy = Math.sign(dy || 1) * size } }
    const x2 = clamp(a[0] + dx, 0, BOARD.width - 1), y2 = clamp(a[1] + dy, 0, BOARD.height - 1)
    return { id, type, x: Math.min(a[0], x2), y: Math.min(a[1], y2), w: Math.max(1, Math.abs(x2 - a[0])), h: Math.max(1, Math.abs(y2 - a[1])), colour: settings.colour, fill: ['rect', 'ellipse'].includes(type) ? settings.fill : 'none', size: settings.size, opacity: 1, ...(settings.lineStyle === 'dotted' ? { lineStyle: 'dotted' } : {}), ...(['line', 'arrow'].includes(type) ? { reverse: (x2 - a[0]) * (y2 - a[1]) < 0, backward: x2 < a[0] || (x2 === a[0] && y2 < a[1]) } : {}) }
}
