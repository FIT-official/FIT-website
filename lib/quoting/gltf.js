/**
 * Minimal, dependency-free glTF 2.0 / GLB parser → flat world-space positions.
 * Used for server-side geometry verification (recompute volume from the stored
 * model rather than trusting client-sent metrics).
 *
 * Scope: triangle primitives with float32 POSITION accessors, indexed or not,
 * with full node-hierarchy transforms (matrix or TRS). Buffers must be embedded
 * (GLB BIN chunk or base64 data URI). Anything outside that scope — external
 * .bin files, Draco/meshopt compression, sparse accessors, non-triangle modes —
 * returns null so the caller falls back to client metrics instead of risking a
 * wrong (under-counted) volume.
 */

const GLB_MAGIC = 0x46546c67 // 'glTF'
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942
const FLOAT = 5126
const INDEX_READERS = {
  5121: (dv, o) => dv.getUint8(o),
  5123: (dv, o) => dv.getUint16(o, true),
  5125: (dv, o) => dv.getUint32(o, true),
}
const INDEX_SIZES = { 5121: 1, 5123: 2, 5125: 4 }

class Unsupported extends Error {}

// Safety cap on total emitted position array elements across a whole parse.
// Depth alone doesn't bound cost: a shallow but heavily fanned-out node graph
// (repeated `children` entries pointing at an already-large subtree) can still
// emit an unbounded amount of geometry. 2,000,000 elements (~222k triangles)
// is far beyond any real print-farm model.
const MAX_POSITIONS = 2_000_000

function toUint8(buffer) {
  if (buffer instanceof Uint8Array) return buffer
  if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer)
  return new Uint8Array(buffer)
}

function decodeBase64(b64) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'))
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Split a GLB container into { json, bin }; null if not GLB. */
function parseGlbContainer(buf) {
  if (buf.length < 20) return null
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  if (dv.getUint32(0, true) !== GLB_MAGIC) return null
  let json = null
  let bin = null
  let offset = 12
  while (offset + 8 <= buf.length) {
    const chunkLength = dv.getUint32(offset, true)
    const chunkType = dv.getUint32(offset + 4, true)
    const start = offset + 8
    if (start + chunkLength > buf.length) break
    const chunk = buf.subarray(start, start + chunkLength)
    if (chunkType === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(chunk))
    else if (chunkType === CHUNK_BIN) bin = chunk
    offset = start + chunkLength
  }
  return json ? { json, bin } : null
}

function resolveBuffer(gltfBuffer, glbBin) {
  const uri = gltfBuffer?.uri
  if (uri == null) {
    if (!glbBin) throw new Unsupported('buffer without uri outside GLB')
    return glbBin
  }
  const dataMatch = /^data:.*?;base64,(.*)$/s.exec(uri)
  if (!dataMatch) throw new Unsupported('external buffer uri') // can't fetch server-side
  return decodeBase64(dataMatch[1])
}

function viewSlice(json, buffers, viewIndex) {
  const view = json.bufferViews?.[viewIndex]
  if (!view) throw new Unsupported('missing bufferView')
  const buf = buffers[view.buffer]
  const offset = view.byteOffset || 0
  return { bytes: buf.subarray(offset, offset + view.byteLength), stride: view.byteStride || 0 }
}

/** Read a VEC3 float accessor into [[x,y,z], ...]. */
function readPositions(json, buffers, accessorIndex) {
  const acc = json.accessors?.[accessorIndex]
  if (!acc) throw new Unsupported('missing accessor')
  if (acc.sparse) throw new Unsupported('sparse accessor')
  if (acc.componentType !== FLOAT || acc.type !== 'VEC3') {
    throw new Unsupported('non-float32 POSITION')
  }
  const { bytes, stride } = viewSlice(json, buffers, acc.bufferView)
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const step = stride || 12
  const base = acc.byteOffset || 0
  const out = new Array(acc.count)
  for (let i = 0; i < acc.count; i++) {
    const o = base + i * step
    out[i] = [dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)]
  }
  return out
}

function readIndices(json, buffers, accessorIndex) {
  const acc = json.accessors?.[accessorIndex]
  if (!acc) throw new Unsupported('missing index accessor')
  if (acc.sparse) throw new Unsupported('sparse accessor')
  const read = INDEX_READERS[acc.componentType]
  if (!read || acc.type !== 'SCALAR') throw new Unsupported('unsupported index type')
  const { bytes, stride } = viewSlice(json, buffers, acc.bufferView)
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const step = stride || INDEX_SIZES[acc.componentType]
  const base = acc.byteOffset || 0
  const out = new Array(acc.count)
  for (let i = 0; i < acc.count; i++) out[i] = read(dv, base + i * step)
  return out
}

// --- column-major 4x4 matrix helpers (glTF convention) ---

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

function mat4Multiply(a, b) {
  const out = new Array(16)
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k]
      out[col * 4 + row] = sum
    }
  }
  return out
}

function nodeLocalMatrix(node) {
  if (node.matrix) return node.matrix
  const [tx, ty, tz] = node.translation || [0, 0, 0]
  const [qx, qy, qz, qw] = node.rotation || [0, 0, 0, 1]
  const [sx, sy, sz] = node.scale || [1, 1, 1]
  // column-major T * R * S
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz
  const xx = qx * x2, xy = qx * y2, xz = qx * z2
  const yy = qy * y2, yz = qy * z2, zz = qz * z2
  const wx = qw * x2, wy = qw * y2, wz = qw * z2
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ]
}

function transformPoint(m, [x, y, z]) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ]
}

function emitMesh(json, buffers, meshIndex, worldMatrix, positions) {
  const mesh = json.meshes?.[meshIndex]
  if (!mesh) return
  for (const prim of mesh.primitives || []) {
    if ((prim.mode ?? 4) !== 4) throw new Unsupported('non-triangle primitive')
    if (prim.extensions && Object.keys(prim.extensions).some((e) => /draco|meshopt/i.test(e))) {
      throw new Unsupported('compressed primitive')
    }
    if (prim.attributes?.POSITION == null) continue
    const verts = readPositions(json, buffers, prim.attributes.POSITION)
    const world = verts.map((v) => transformPoint(worldMatrix, v))
    const indices =
      prim.indices != null
        ? readIndices(json, buffers, prim.indices)
        : world.map((_, i) => i)
    for (const idx of indices) {
      const p = world[idx]
      if (!p) throw new Unsupported('index out of range')
      positions.push(p[0], p[1], p[2])
      if (positions.length > MAX_POSITIONS) throw new Unsupported('geometry too large')
    }
  }
}

function walkNode(json, buffers, nodeIndex, parentMatrix, positions, depth = 0) {
  if (depth > 64) throw new Unsupported('node graph too deep')
  const node = json.nodes?.[nodeIndex]
  if (!node) return
  const world = mat4Multiply(parentMatrix, nodeLocalMatrix(node))
  if (node.mesh != null) emitMesh(json, buffers, node.mesh, world, positions)
  for (const child of node.children || []) {
    walkNode(json, buffers, child, world, positions, depth + 1)
  }
}

/**
 * Parse a GLB or .gltf (embedded buffers only) into a flat [x,y,z,...] array of
 * world-space triangle positions, in the file's native unit (metres per spec).
 * @returns {number[]|null} null if not parseable or uses unsupported features
 */
export function parseGltfToPositions(buffer) {
  try {
    const buf = toUint8(buffer)
    let json
    let glbBin = null
    const glb = parseGlbContainer(buf)
    if (glb) {
      json = glb.json
      glbBin = glb.bin
    } else {
      json = JSON.parse(new TextDecoder().decode(buf))
    }
    if (!json || typeof json !== 'object' || !json.asset) return null

    const buffers = (json.buffers || []).map((b) => resolveBuffer(b, glbBin))
    const positions = []
    const sceneIndex = json.scene ?? 0
    const rootNodes =
      json.scenes?.[sceneIndex]?.nodes ?? (json.nodes ? json.nodes.map((_, i) => i) : [])
    // When there are no scenes, every node is treated as a root; nested children
    // would then be emitted twice, so only do that for flat node lists.
    if (!json.scenes && json.nodes?.some((n) => n.children?.length)) {
      throw new Unsupported('node hierarchy without scenes')
    }
    for (const root of rootNodes) {
      walkNode(json, buffers, root, IDENTITY, positions)
    }
    return positions.length >= 9 ? positions : null
  } catch {
    return null // not glTF, or uses features we don't support -> caller falls back
  }
}
