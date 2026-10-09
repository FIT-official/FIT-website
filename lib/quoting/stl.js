/**
 * Minimal, dependency-free STL parser (binary + ASCII) → flat positions array.
 * Used for server-side geometry verification (recompute volume from the stored
 * model rather than trusting client-sent metrics). STL is the dominant 3D-print
 * format; other formats are handled elsewhere / deferred.
 */

function toUint8(buffer) {
  if (buffer instanceof Uint8Array) return buffer
  if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer)
  // Node Buffer is a Uint8Array subclass; anything else → best effort
  return new Uint8Array(buffer)
}

/** Binary STL = 80-byte header + uint32 triangle count + 50 bytes/triangle. */
export function isBinaryStl(buf) {
  if (buf.length < 84) return false
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const triangles = dv.getUint32(80, true)
  return 84 + triangles * 50 === buf.length
}

export function parseBinaryStl(buf) {
  if (!isBinaryStl(buf)) return null
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const triangles = dv.getUint32(80, true)
  if (!triangles) return null
  const positions = new Float32Array(triangles * 9)
  let offset = 84
  let p = 0
  for (let i = 0; i < triangles; i++) {
    // Nonfinite normals/vertices make this a corrupt file, not an open mesh
    // eligible for a bounding-box estimate.
    for (let n = 0; n < 3; n++, offset += 4) {
      if (!Number.isFinite(dv.getFloat32(offset, true))) return null
    }
    for (let v = 0; v < 9; v++) {
      const value = dv.getFloat32(offset, true)
      if (!Number.isFinite(value)) return null
      positions[p++] = value
      offset += 4
    }
    offset += 2 // attribute byte count
  }
  return positions
}

export function parseAsciiStl(text) {
  if (typeof text !== 'string' || text.includes('\0')) return null
  const positions = []
  const number = '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?'
  const triple = `(${number})\\s+(${number})\\s+(${number})`
  const facet = new RegExp(`\\s*facet\\s+normal\\s+${triple}\\s+outer\\s+loop\\s+vertex\\s+${triple}\\s+vertex\\s+${triple}\\s+vertex\\s+${triple}\\s+endloop\\s+endfacet\\b`, 'iy')
  const start = /\s*solid(?:[ \t]+[^\r\n]*)?(?:\r\n|\n|\r)/iy
  const end = /\s*endsolid(?:[ \t]+[^\r\n]*)?(?:\r\n|\n|\r|$)/iy
  let offset = 0
  // Consume every byte of each solid. Harvesting matching vertices alone
  // silently priced malformed files and valid prefixes of corrupt exports.
  while (offset < text.length && /\S/.test(text.slice(offset))) {
    start.lastIndex = offset
    const opening = start.exec(text)
    if (!opening) return null
    offset = start.lastIndex
    const before = positions.length
    for (;;) {
      end.lastIndex = offset
      if (end.exec(text)) { offset = end.lastIndex; break }
      facet.lastIndex = offset
      const match = facet.exec(text)
      if (!match) return null
      const values = match.slice(1).map(Number)
      if (!values.every(Number.isFinite)) return null
      positions.push(...values.slice(3))
      offset = facet.lastIndex
    }
    if (positions.length === before) return null
  }
  return positions.length ? positions : null
}

/**
 * Parse an STL (binary or ASCII) into a flat [x,y,z,...] positions array.
 * @returns {number[]|Float32Array|null} null if not recognisable as STL
 */
export function parseStlToPositions(buffer) {
  const buf = toUint8(buffer)
  if (buf.length < 9) return null
  if (isBinaryStl(buf)) return parseBinaryStl(buf)
  const text = new TextDecoder().decode(buf)
  if (/^\s*solid/i.test(text) && /vertex/i.test(text)) {
    const positions = parseAsciiStl(text)
    return positions?.length >= 9 ? positions : null
  }
  return null
}
