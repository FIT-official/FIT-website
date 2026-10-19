// Tiny SYNTHETIC model files for tests and the sandbox preview. No real customer file, nothing downloaded.
import JSZip from 'jszip'

const CUBE_V = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]
const CUBE_T = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]
const scaled = (size, [sx, sy, sz] = [1, 1, 1]) => CUBE_V.map(([x, y, z]) => [x * size * sx, y * size * sy, z * size * sz])

/** Binary STL of a box (12 triangles). */
export function boxStl(size = 20, scale = [1, 1, 1]) {
  const v = scaled(size, scale), buf = new ArrayBuffer(84 + CUBE_T.length * 50), dv = new DataView(buf)
  dv.setUint32(80, CUBE_T.length, true)
  CUBE_T.forEach((t, i) => { const o = 84 + i * 50; t.forEach((vi, k) => v[vi].forEach((c, j) => dv.setFloat32(o + 12 + k * 12 + j * 4, c, true))) })
  return new Uint8Array(buf)
}
/** Binary STL of a cylinder with `segments` sides (4 * segments triangles): a clearly non-cube silhouette. */
export function cylinderStl(radius = 10, height = 30, segments = 24) {
  const tris = []
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * 2 * Math.PI, b = ((i + 1) / segments) * 2 * Math.PI
    const p = (ang, z) => [Math.cos(ang) * radius, Math.sin(ang) * radius, z]
    tris.push([p(a, 0), p(b, 0), p(b, height)], [p(a, 0), p(b, height), p(a, height)], [[0, 0, 0], p(b, 0), p(a, 0)], [[0, 0, height], p(a, height), p(b, height)])
  }
  const buf = new ArrayBuffer(84 + tris.length * 50), dv = new DataView(buf); dv.setUint32(80, tris.length, true)
  tris.forEach((t, i) => t.forEach((vert, k) => vert.forEach((c, j) => dv.setFloat32(84 + i * 50 + 12 + k * 12 + j * 4, c, true))))
  return new Uint8Array(buf)
}
export function boxObj(size = 20) {
  return new TextEncoder().encode(scaled(size).map(([x, y, z]) => `v ${x} ${y} ${z}`).join('\n') + '\n' + CUBE_T.map(t => `f ${t.map(i => i + 1).join(' ')}`).join('\n') + '\n')
}
export async function box3mf(size = 20) {
  const zip = new JSZip(), v = scaled(size)
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>')
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>')
  zip.file('3D/3dmodel.model', `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" type="model"><mesh><vertices>${v.map(([x, y, z]) => `<vertex x="${x}" y="${y}" z="${z}"/>`).join('')}</vertices><triangles>${CUBE_T.map(([a, b, c]) => `<triangle v1="${a}" v2="${b}" v3="${c}"/>`).join('')}</triangles></mesh></object></resources><build><item objectid="1"/></build></model>`)
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array' }))
}
export const corruptBytes = () => new TextEncoder().encode('this is not a model file at all')
