// SOFTWARE preview of a model for the reminder email. The existing STL / OBJ / 3MF parsers produce triangle positions; this file shades them as a SOLID on the CPU: a z-buffered
// rasteriser with per-pixel lighting, 2x supersampled by the caller. No WebGL, no GPU, no external code, no wireframe or triangle-edge overlay.
//
// Smooth shading is crease-aware. Vertices are welded by position (this only groups them for shading; the geometry that is drawn is never moved or changed), and a corner's normal is the
// average of the normals of the faces that meet at that vertex AND lie within the crease angle of the corner's own face. A cylinder wall therefore shades smoothly, while a cube edge,
// a cylinder cap rim or a chamfer steeper than the crease angle stays a crisp, shaded step. The silhouette is always the real polygon outline of the file. The uploaded bytes are only
// read. Limits: very high-valence vertices (a fan with more than MAX_VALENCE faces) and meshes past the pair budget fall back to flat shading for the affected corners; shells that
// touch only at coincident vertices of opposite winding are treated as creases (never smoothed); inconsistent winding is shaded two-sided, as flat.
import { parseStlToPositions } from '@/lib/quoting/stl'
import { parseObjToPositions } from '@/lib/quoting/obj'
import { parse3mfToPositions } from '@/lib/quoting/threeMf'
import { positionsInPrintAxes } from '@/lib/quoting/modelOrientation'
import { extensionOf } from '@/lib/email/printPreviewModels'

export class PreviewError extends Error { constructor(kind, message) { super(message); this.kind = kind } }
const PARSERS = { stl: parseStlToPositions, obj: parseObjToPositions, '3mf': parse3mfToPositions }
export const CREASE_DEGREES = 40
const MAX_VALENCE = 64            // faces per vertex examined for smoothing
const PAIR_BUDGET = 24e6          // total face-pair comparisons for smoothing across the whole model

/** Parse model bytes to triangle positions (Z up). Throws PreviewError('unsupported' | 'unreadable'). The input buffer is never modified. */
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

// Camera: yaw 35 deg, pitch 28 deg, orthographic. View space is (right, up, toward-viewer).
const YAW = (35 * Math.PI) / 180, PITCH = (28 * Math.PI) / 180
const cy = Math.cos(YAW), sy = Math.sin(YAW), cp = Math.cos(PITCH), sp = Math.sin(PITCH)
const toView = (x, y, z, out, o) => { const x1 = x * cy - y * sy, y1 = x * sy + y * cy; out[o] = x1; out[o + 1] = z * cp - y1 * sp; out[o + 2] = y1 * cp + z * sp }

const BACKGROUND = [244, 242, 238]
const BODY = [168, 170, 176]
const norm3 = (v, o) => { const l = Math.hypot(v[o], v[o + 1], v[o + 2]) || 1; v[o] /= l; v[o + 1] /= l; v[o + 2] /= l }
const KEY = [-0.42, 0.62, 0.66], FILL = [0.7, 0.1, 0.45]
for (const l of [KEY, FILL]) { const n = Math.hypot(...l); l[0] /= n; l[1] /= n; l[2] /= n }

/** Per-corner normals (3 floats per corner, model space) with crease-aware smoothing. creaseDegrees <= 0 gives flat shading. */
function cornerNormals(positions, triangles, creaseDegrees, tolerance) {
  const faceN = new Float32Array(triangles * 3), cornerN = new Float32Array(triangles * 9), valid = new Uint8Array(triangles)
  for (let t = 0; t < triangles; t++) {
    const o = t * 9
    const ux = positions[o + 3] - positions[o], uy = positions[o + 4] - positions[o + 1], uz = positions[o + 5] - positions[o + 2]
    const vx = positions[o + 6] - positions[o], vy = positions[o + 7] - positions[o + 1], vz = positions[o + 8] - positions[o + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz)
    if (len > 0 && Number.isFinite(len)) { valid[t] = 1; faceN[t * 3] = nx / len; faceN[t * 3 + 1] = ny / len; faceN[t * 3 + 2] = nz / len }
  }
  for (let t = 0; t < triangles; t++) for (let k = 0; k < 3; k++) { cornerN[t * 9 + k * 3] = faceN[t * 3]; cornerN[t * 9 + k * 3 + 1] = faceN[t * 3 + 1]; cornerN[t * 9 + k * 3 + 2] = faceN[t * 3 + 2] }
  if (!(creaseDegrees > 0)) return { cornerN, valid }

  // Weld by quantised position into vertex ids (open-addressing hash), then list the faces at each vertex.
  const corners = triangles * 3, inv = 1 / tolerance
  const qx = new Int32Array(corners), qy = new Int32Array(corners), qz = new Int32Array(corners)
  const size = 1 << Math.ceil(Math.log2(corners * 2 + 2)), table = new Int32Array(size).fill(-1), vertexOf = new Int32Array(corners)
  let vertices = 0
  for (let c = 0; c < corners; c++) {
    const a = Math.round(positions[c * 3] * inv), b = Math.round(positions[c * 3 + 1] * inv), d = Math.round(positions[c * 3 + 2] * inv)
    let h = (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(d, 83492791)) >>> 0
    h &= size - 1
    for (;;) {
      const slot = table[h]
      if (slot === -1) { table[h] = vertices; qx[vertices] = a; qy[vertices] = b; qz[vertices] = d; vertexOf[c] = vertices++; break }
      if (qx[slot] === a && qy[slot] === b && qz[slot] === d) { vertexOf[c] = slot; break }
      h = (h + 1) & (size - 1)
    }
  }
  const start = new Int32Array(vertices + 1)
  for (let c = 0; c < corners; c++) start[vertexOf[c] + 1]++
  for (let v = 0; v < vertices; v++) start[v + 1] += start[v]
  const fill = start.slice(0, vertices), faces = new Int32Array(corners)
  for (let c = 0; c < corners; c++) faces[fill[vertexOf[c]]++] = (c / 3) | 0
  const cosCrease = Math.cos((creaseDegrees * Math.PI) / 180)
  let pairs = 0
  for (let t = 0; t < triangles; t++) {
    if (!valid[t]) continue
    for (let k = 0; k < 3; k++) {
      const v = vertexOf[t * 3 + k], from = start[v], to = start[v + 1], valence = to - from
      if (valence < 2 || valence > MAX_VALENCE || pairs > PAIR_BUDGET) continue   // flat for this corner
      pairs += valence
      let sx = 0, sy2 = 0, sz = 0
      for (let i = from; i < to; i++) {
        const f = faces[i]
        if (!valid[f]) continue
        const dot = faceN[t * 3] * faceN[f * 3] + faceN[t * 3 + 1] * faceN[f * 3 + 1] + faceN[t * 3 + 2] * faceN[f * 3 + 2]
        if (dot < cosCrease) continue
        // weight by the face's corner angle at this vertex would be ideal; the unit face normal weighted by area keeps cost low and is stable on near-regular meshes
        const o = f * 9, w = faceArea(positions, o)
        sx += faceN[f * 3] * w; sy2 += faceN[f * 3 + 1] * w; sz += faceN[f * 3 + 2] * w
      }
      const len = Math.hypot(sx, sy2, sz)
      if (len > 0) { cornerN[t * 9 + k * 3] = sx / len; cornerN[t * 9 + k * 3 + 1] = sy2 / len; cornerN[t * 9 + k * 3 + 2] = sz / len }
    }
  }
  return { cornerN, valid }
}
function faceArea(p, o) {
  const ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2], vx = p[o + 6] - p[o], vy = p[o + 7] - p[o + 1], vz = p[o + 8] - p[o + 2]
  return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) * 0.5
}

/**
 * Shade the model as a solid.
 * @param {Float32Array|number[]} positions  flat x,y,z triples, three vertices per triangle (Z up)
 * @returns {{ pixels: Uint8Array, width: number, height: number, triangles: number, drawn: number, bbox: object }} RGB pixels (3 bytes each)
 * @throws PreviewError('too_large') when maxMillis is exceeded (the work is CPU-bound and cannot be interrupted from outside)
 */
export function shadeModel(positions, width, height, { creaseDegrees = CREASE_DEGREES, maxMillis = 4000, margin = 14 } = {}) {
  const started = Date.now()
  const triangles = Math.floor(positions.length / 9), bbox = boundingBox(positions)
  const diag = Math.hypot(...bbox.size) || 1
  const { cornerN, valid } = cornerNormals(positions, triangles, creaseDegrees, diag * 1e-5)

  // Project every corner (position and normal) into view space.
  const pv = new Float32Array(triangles * 9), nv = new Float32Array(triangles * 9)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (let c = 0; c < triangles * 3; c++) {
    toView(positions[c * 3], positions[c * 3 + 1], positions[c * 3 + 2], pv, c * 3)
    toView(cornerN[c * 3], cornerN[c * 3 + 1], cornerN[c * 3 + 2], nv, c * 3)
    const x = pv[c * 3], y = pv[c * 3 + 1]
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  const spanX = Math.max(1e-9, maxX - minX), spanY = Math.max(1e-9, maxY - minY)
  const scale = Math.min((width - 2 * margin) / spanX, (height - 2 * margin) / spanY)
  const offX = (width - spanX * scale) / 2 - minX * scale, offY = (height - spanY * scale) / 2 + maxY * scale

  const pixels = new Uint8Array(width * height * 3), depth = new Float32Array(width * height).fill(-Infinity)
  for (let i = 0; i < width * height; i++) { pixels[i * 3] = BACKGROUND[0]; pixels[i * 3 + 1] = BACKGROUND[1]; pixels[i * 3 + 2] = BACKGROUND[2] }
  const n = [0, 0, 0]
  let drawn = 0
  for (let t = 0; t < triangles; t++) {
    if ((t & 1023) === 0 && Date.now() - started > maxMillis) throw new PreviewError('too_large', 'This model took too long to draw.')
    if (!valid[t]) continue
    const o = t * 9
    const x0 = pv[o] * scale + offX, y0 = offY - pv[o + 1] * scale, z0 = pv[o + 2]
    const x1 = pv[o + 3] * scale + offX, y1 = offY - pv[o + 4] * scale, z1 = pv[o + 5]
    const x2 = pv[o + 6] * scale + offX, y2 = offY - pv[o + 7] * scale, z2 = pv[o + 8]
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
    if (Math.abs(area) < 1e-9) continue
    const bx0 = Math.max(0, Math.floor(Math.min(x0, x1, x2))), bx1 = Math.min(width - 1, Math.ceil(Math.max(x0, x1, x2)))
    const by0 = Math.max(0, Math.floor(Math.min(y0, y1, y2))), by1 = Math.min(height - 1, Math.ceil(Math.max(y0, y1, y2)))
    const inv = 1 / area
    drawn++
    for (let py = by0; py <= by1; py++) {
      for (let px = bx0; px <= bx1; px++) {
        const sx = px + 0.5, sy2 = py + 0.5
        const w0 = ((x1 - sx) * (y2 - sy2) - (x2 - sx) * (y1 - sy2)) * inv
        const w1 = ((x2 - sx) * (y0 - sy2) - (x0 - sx) * (y2 - sy2)) * inv
        const w2 = 1 - w0 - w1
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue
        const z = w0 * z0 + w1 * z1 + w2 * z2, idx = py * width + px
        if (z <= depth[idx]) continue
        depth[idx] = z
        n[0] = w0 * nv[o] + w1 * nv[o + 3] + w2 * nv[o + 6]; n[1] = w0 * nv[o + 1] + w1 * nv[o + 4] + w2 * nv[o + 7]; n[2] = w0 * nv[o + 2] + w1 * nv[o + 5] + w2 * nv[o + 8]
        norm3(n, 0)
        if (n[2] < 0) { n[0] = -n[0]; n[1] = -n[1]; n[2] = -n[2] }     // two-sided: always light the side that faces the camera
        const key = Math.max(0, n[0] * KEY[0] + n[1] * KEY[1] + n[2] * KEY[2]), fill = Math.max(0, n[0] * FILL[0] + n[1] * FILL[1] + n[2] * FILL[2])
        const rim = Math.pow(1 - n[2], 2) * 0.12
        const light = Math.min(1.15, 0.34 + 0.62 * key + 0.16 * fill - rim)
        const o3 = idx * 3
        pixels[o3] = Math.min(255, BODY[0] * light); pixels[o3 + 1] = Math.min(255, BODY[1] * light); pixels[o3 + 2] = Math.min(255, BODY[2] * light)
      }
    }
  }
  return { pixels, width, height, triangles, drawn, bbox }
}
