// Lightweight SOFTWARE preview of a model: the existing STL / OBJ / 3MF parsers produce triangle positions, and this draws them as a shaded isometric projection on a 2D canvas.
// No WebGL, no GPU, no external code. It draws the REAL parsed triangles (their count and bounding box are reported so a test can assert real geometry was drawn); if the file cannot
// be parsed it throws, and the caller shows an honest "cannot preview" message instead of an empty or invented picture.
import { parseStlToPositions } from '@/lib/quoting/stl'
import { parseObjToPositions } from '@/lib/quoting/obj'
import { parse3mfToPositions } from '@/lib/quoting/threeMf'
import { positionsInPrintAxes } from '@/lib/quoting/modelOrientation'
import { extensionOf } from '@/lib/email/printPreviewModels'

export class PreviewError extends Error { constructor(kind, message) { super(message); this.kind = kind } }
const MAX_TRIANGLES_DRAWN = 30000
const PARSERS = { stl: parseStlToPositions, obj: parseObjToPositions, '3mf': parse3mfToPositions }

/** Parse model bytes to triangle positions (Z up). Throws PreviewError('unsupported' | 'unreadable'). */
export async function parseForPreview(buffer, fileName) {
  const parse = PARSERS[extensionOf(fileName)]
  if (!parse) throw new PreviewError('unsupported', 'This file type cannot be previewed here.')
  let positions
  try { positions = await parse(buffer) } catch { throw new PreviewError('unreadable', 'This file could not be read as a model.') }
  if (!positions || positions.length < 9) throw new PreviewError('unreadable', 'This file has no readable geometry.')
  for (let i = 0; i < positions.length; i++) if (!Number.isFinite(positions[i])) throw new PreviewError('unreadable', 'This file has invalid geometry.')
  return positionsInPrintAxes(positions, fileName)
}

export function boundingBox(positions) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i + 2 < positions.length; i += 3) for (let c = 0; c < 3; c++) { const v = positions[i + c]; if (v < min[c]) min[c] = v; if (v > max[c]) max[c] = v }
  return { min, max, size: max.map((v, i) => v - min[i]) }
}

const YAW = (35 * Math.PI) / 180, PITCH = (28 * Math.PI) / 180
const cy = Math.cos(YAW), sy = Math.sin(YAW), cp = Math.cos(PITCH), sp = Math.sin(PITCH)
const project = (x, y, z) => { const x1 = x * cy - y * sy, y1 = x * sy + y * cy; return [x1, z * cp - y1 * sp, y1 * cp + z * sp] }       // [screenX, screenY(up), depth]

/** Draw the triangles on a 2D context. Returns what was actually drawn. */
export function drawModel(ctx, positions, width, height, { maxTriangles = MAX_TRIANGLES_DRAWN } = {}) {
  const total = Math.floor(positions.length / 9)
  const box = boundingBox(positions)
  const stride = Math.max(1, Math.ceil(total / maxTriangles))
  const tris = []
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (let t = 0; t < total; t += stride) {
    const o = t * 9, p = [project(positions[o], positions[o + 1], positions[o + 2]), project(positions[o + 3], positions[o + 4], positions[o + 5]), project(positions[o + 6], positions[o + 7], positions[o + 8])]
    // face normal (model space) for a simple headlight shade
    const ux = positions[o + 3] - positions[o], uy = positions[o + 4] - positions[o + 1], uz = positions[o + 5] - positions[o + 2]
    const vx = positions[o + 6] - positions[o], vy = positions[o + 7] - positions[o + 1], vz = positions[o + 8] - positions[o + 2]
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len
    const light = Math.abs(nx * 0.35 + ny * -0.45 + nz * 0.82)
    tris.push({ p, depth: (p[0][2] + p[1][2] + p[2][2]) / 3, shade: 0.3 + 0.7 * Math.min(1, light) })
    for (const q of p) { if (q[0] < minX) minX = q[0]; if (q[0] > maxX) maxX = q[0]; if (q[1] < minY) minY = q[1]; if (q[1] > maxY) maxY = q[1] }
  }
  tris.sort((a, b) => a.depth - b.depth)
  const margin = 14, spanX = Math.max(1e-9, maxX - minX), spanY = Math.max(1e-9, maxY - minY)
  const scale = Math.min((width - 2 * margin) / spanX, (height - 2 * margin) / spanY)
  const offX = (width - spanX * scale) / 2 - minX * scale, offY = (height - spanY * scale) / 2 + maxY * scale
  ctx.save(); ctx.fillStyle = '#f4f2ee'; ctx.fillRect(0, 0, width, height)
  ctx.lineJoin = 'round'; ctx.lineWidth = 0.5
  for (const tri of tris) {
    ctx.beginPath()
    tri.p.forEach((q, i) => { const sx = q[0] * scale + offX, sy2 = offY - q[1] * scale; if (i === 0) ctx.moveTo(sx, sy2); else ctx.lineTo(sx, sy2) })
    ctx.closePath()
    const g = Math.round(70 + 150 * tri.shade)
    ctx.fillStyle = `rgb(${g},${Math.round(g * 0.97)},${Math.round(g * 0.92)})`; ctx.fill()
    ctx.strokeStyle = 'rgba(40,40,40,0.35)'; ctx.stroke()
  }
  ctx.restore()
  return { triangles: total, drawn: tris.length, bbox: box }
}
