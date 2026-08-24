import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { parseObjToPositions } from '@/lib/quoting/obj'
import { parseGltfToPositions } from '@/lib/quoting/gltf'
import { parse3mfToPositions } from '@/lib/quoting/threeMf'
import { recomputeMetricsFromModel, supportsServerRecompute } from '@/lib/quoting/serverGeometry'
import { meshVolume } from '@/lib/quoting/geometryVolume'

// Shared cube data: 8 corners of an axis-aligned cube of size `s` centred at
// the origin, and the 12 triangles (outward winding) over those corners.
function cubeCorners(s) {
  const x = s / 2
  return [
    [-x, -x, -x], [x, -x, -x], [x, x, -x], [-x, x, -x],
    [-x, -x, x], [x, -x, x], [x, x, x], [-x, x, x],
  ]
}
const CUBE_INDEX = [
  0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1,
  1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0,
]

const enc = (text) => new TextEncoder().encode(text)

describe('OBJ parser', () => {
  function cubeObj(s, { quads = false } = {}) {
    const lines = cubeCorners(s).map(([x, y, z]) => `v ${x} ${y} ${z}`)
    if (quads) {
      // Same cube as 6 quads (1-based corner indices)
      lines.push(
        'f 1 2 3 4', 'f 5 8 7 6', 'f 1 5 6 2',
        'f 2 6 7 3', 'f 3 7 8 4', 'f 4 8 5 1',
      )
    } else {
      for (let i = 0; i < CUBE_INDEX.length; i += 3) {
        lines.push(`f ${CUBE_INDEX[i] + 1} ${CUBE_INDEX[i + 1] + 1} ${CUBE_INDEX[i + 2] + 1}`)
      }
    }
    return lines.join('\n')
  }

  it('parses triangle faces into flat positions (10mm cube -> 1000 mm³)', () => {
    const positions = parseObjToPositions(enc(cubeObj(10)))
    expect(positions.length).toBe(12 * 9)
    expect(meshVolume(positions)).toBeCloseTo(1000, 3)
  })

  it('triangulates quad faces (fan)', () => {
    const positions = parseObjToPositions(enc(cubeObj(10, { quads: true })))
    expect(positions.length).toBe(12 * 9) // 6 quads -> 12 triangles
    expect(meshVolume(positions)).toBeCloseTo(1000, 3)
  })

  it('handles v/vt/vn face syntax and negative (relative) indices', () => {
    const obj = [
      'v 0 0 0', 'v 1 0 0', 'v 0 1 0',
      'vn 0 0 1', 'vt 0 0',
      'f 1/1/1 2/1/1 3/1/1',
      'f -3//1 -2//1 -1//1',
    ].join('\n')
    const positions = parseObjToPositions(enc(obj))
    expect(positions.length).toBe(2 * 9)
    expect(positions.slice(0, 9)).toEqual(positions.slice(9))
  })

  it('returns null when there are no faces', () => {
    expect(parseObjToPositions(enc('v 0 0 0\nv 1 0 0\nv 0 1 0'))).toBeNull()
  })
})

// Minimal valid glTF 2.0 JSON for an indexed cube of size `s` (metres).
function cubeGltfJson(s, { bufferUri } = {}) {
  const corners = cubeCorners(s)
  const positions = new Float32Array(corners.flat())
  const indices = new Uint16Array(CUBE_INDEX)
  const bin = new Uint8Array(positions.byteLength + indices.byteLength)
  bin.set(new Uint8Array(positions.buffer), 0)
  bin.set(new Uint8Array(indices.buffer), positions.byteLength)
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: 'VEC3' },
      { bufferView: 1, componentType: 5123, count: 36, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength },
    ],
    buffers: [{ byteLength: bin.byteLength, uri: bufferUri }],
  }
  return { json, bin }
}

function toGlb(json, bin) {
  const jsonBytes = enc(JSON.stringify(json))
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4
  const binPad = (4 - (bin.length % 4)) % 4
  const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + bin.length + binPad
  const out = new Uint8Array(total)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, 0x46546c67, true) // 'glTF'
  dv.setUint32(4, 2, true)
  dv.setUint32(8, total, true)
  let o = 12
  dv.setUint32(o, jsonBytes.length + jsonPad, true)
  dv.setUint32(o + 4, 0x4e4f534a, true) // 'JSON'
  out.set(jsonBytes, o + 8)
  for (let i = 0; i < jsonPad; i++) out[o + 8 + jsonBytes.length + i] = 0x20
  o += 8 + jsonBytes.length + jsonPad
  dv.setUint32(o, bin.length + binPad, true)
  dv.setUint32(o + 4, 0x004e4942, true) // 'BIN'
  out.set(bin, o + 8)
  return out
}

function base64(bytes) {
  return Buffer.from(bytes).toString('base64')
}

describe('glTF/GLB parser', () => {
  it('parses a GLB cube (0.01 m -> 1e-6 m³)', () => {
    const { json, bin } = cubeGltfJson(0.01)
    const positions = parseGltfToPositions(toGlb(json, bin))
    expect(positions.length).toBe(36 * 3) // de-indexed triangles
    expect(meshVolume(positions)).toBeCloseTo(1e-6, 9)
  })

  it('parses .gltf JSON with an embedded data-URI buffer', () => {
    const { json, bin } = cubeGltfJson(0.01)
    json.buffers[0].uri = `data:application/octet-stream;base64,${base64(bin)}`
    const positions = parseGltfToPositions(enc(JSON.stringify(json)))
    expect(meshVolume(positions)).toBeCloseTo(1e-6, 9)
  })

  it('applies node transforms (scale doubles each axis -> 8x volume)', () => {
    const { json, bin } = cubeGltfJson(0.01)
    json.nodes[0].scale = [2, 2, 2]
    const positions = parseGltfToPositions(toGlb(json, bin))
    expect(meshVolume(positions)).toBeCloseTo(8e-6, 9)
  })

  it('returns null for external buffer URIs (cannot resolve server-side)', () => {
    const { json } = cubeGltfJson(0.01)
    json.buffers[0].uri = 'model.bin'
    expect(parseGltfToPositions(enc(JSON.stringify(json)))).toBeNull()
  })

  it('returns null for Draco-compressed primitives', () => {
    const { json, bin } = cubeGltfJson(0.01)
    json.meshes[0].primitives[0].extensions = { KHR_draco_mesh_compression: {} }
    expect(parseGltfToPositions(toGlb(json, bin))).toBeNull()
  })

  it('returns null for garbage input', () => {
    expect(parseGltfToPositions(new Uint8Array([1, 2, 3, 4]))).toBeNull()
  })

  it('caps total emitted positions against node-graph fan-out (does not hang)', () => {
    // Chain of nodes, each with `fanFactor` children all pointing at the
    // previous level -> exponential blow-up if unbounded, but shallow enough
    // (well under the depth-64 cap) that only a total-emission cap stops it.
    const { json, bin } = cubeGltfJson(0.01)
    const nodes = [...json.nodes] // node 0: { mesh: 0 }
    let current = 0
    for (let level = 0; level < 5; level++) {
      nodes.push({ children: Array(50).fill(current) })
      current = nodes.length - 1
    }
    json.nodes = nodes
    json.scenes = [{ nodes: [current] }]

    const start = Date.now()
    const result = parseGltfToPositions(toGlb(json, bin))
    expect(Date.now() - start).toBeLessThan(2000)
    expect(result).toBeNull() // capped parse degrades like any unsupported/failed recompute
  })
})

function cube3mfXml(s, { transform } = {}) {
  const verts = cubeCorners(s)
    .map(([x, y, z]) => `<vertex x="${x}" y="${y}" z="${z}" />`)
    .join('\n')
  let tris = ''
  for (let i = 0; i < CUBE_INDEX.length; i += 3) {
    tris += `<triangle v1="${CUBE_INDEX[i]}" v2="${CUBE_INDEX[i + 1]}" v3="${CUBE_INDEX[i + 2]}" />\n`
  }
  const t = transform ? ` transform="${transform}"` : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
 <resources>
  <object id="1" type="model">
   <mesh>
    <vertices>${verts}</vertices>
    <triangles>${tris}</triangles>
   </mesh>
  </object>
 </resources>
 <build><item objectid="1"${t} /></build>
</model>`
}

async function make3mf(xml) {
  const zip = new JSZip()
  zip.file('3D/3dmodel.model', xml)
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
  )
  return zip.generateAsync({ type: 'uint8array' })
}

describe('3MF parser', () => {
  it('parses a 10mm cube from the model part (1000 mm³)', async () => {
    const bytes = await make3mf(cube3mfXml(10))
    const positions = await parse3mfToPositions(bytes)
    expect(positions.length).toBe(12 * 9)
    expect(meshVolume(positions)).toBeCloseTo(1000, 2)
  })

  it('applies build-item transforms (uniform 2x scale -> 8x volume)', async () => {
    const bytes = await make3mf(cube3mfXml(10, { transform: '2 0 0 0 2 0 0 0 2 0 0 0' }))
    const positions = await parse3mfToPositions(bytes)
    expect(meshVolume(positions)).toBeCloseTo(8000, 1)
  })

  it('returns null for a zip without a model part', async () => {
    const zip = new JSZip()
    zip.file('hello.txt', 'not a model')
    const bytes = await zip.generateAsync({ type: 'uint8array' })
    expect(await parse3mfToPositions(bytes)).toBeNull()
  })

  it('returns null for non-zip input', async () => {
    expect(await parse3mfToPositions(enc('not a zip'))).toBeNull()
  })

  it('caps total emitted positions against <component> fan-out (does not hang)', async () => {
    // Chain of objects, each with `fanFactor` <component> refs to the
    // previous level -> exponential blow-up if unbounded, but shallow enough
    // (well under the depth-32 cap) that only a total-emission cap stops it.
    const verts = cubeCorners(10)
      .map(([x, y, z]) => `<vertex x="${x}" y="${y}" z="${z}" />`)
      .join('\n')
    let tris = ''
    for (let i = 0; i < CUBE_INDEX.length; i += 3) {
      tris += `<triangle v1="${CUBE_INDEX[i]}" v2="${CUBE_INDEX[i + 1]}" v3="${CUBE_INDEX[i + 2]}" />\n`
    }
    let objects = `<object id="0" type="model"><mesh><vertices>${verts}</vertices><triangles>${tris}</triangles></mesh></object>`
    let current = '0'
    for (let level = 1; level <= 5; level++) {
      const id = String(level)
      const components = Array.from({ length: 50 }, () => `<component objectid="${current}" />`).join('')
      objects += `<object id="${id}" type="model"><components>${components}</components></object>`
      current = id
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
 <resources>
  ${objects}
 </resources>
 <build><item objectid="${current}" /></build>
</model>`
    const bytes = await make3mf(xml)

    const start = Date.now()
    const result = await parse3mfToPositions(bytes)
    expect(Date.now() - start).toBeLessThan(2000)
    expect(result).toBeNull() // capped parse degrades like any unsupported/failed recompute
  })
})

describe('recomputeMetricsFromModel (multi-format)', () => {
  it('recomputes an OBJ cube in mm (10mm -> 1 cm³)', async () => {
    const obj = cubeCorners(10).map(([x, y, z]) => `v ${x} ${y} ${z}`)
    for (let i = 0; i < CUBE_INDEX.length; i += 3) {
      obj.push(`f ${CUBE_INDEX[i] + 1} ${CUBE_INDEX[i + 1] + 1} ${CUBE_INDEX[i + 2] + 1}`)
    }
    const m = await recomputeMetricsFromModel(enc(obj.join('\n')), 'part.obj')
    expect(m.volumeCm3).toBeCloseTo(1, 3)
    expect(m.watertight).toBe(true)
  })

  it('recomputes a GLB cube in metres (0.01m -> 1 cm³)', async () => {
    const { json, bin } = cubeGltfJson(0.01)
    const m = await recomputeMetricsFromModel(toGlb(json, bin), 'part.glb')
    expect(m.volumeCm3).toBeCloseTo(1, 3)
    expect(m.watertight).toBe(true)
  })

  it('recomputes a 3MF cube in mm (10mm -> 1 cm³)', async () => {
    const bytes = await make3mf(cube3mfXml(10))
    const m = await recomputeMetricsFromModel(bytes, 'part.3mf')
    expect(m.volumeCm3).toBeCloseTo(1, 3)
    expect(m.watertight).toBe(true)
  })

  it('adds a shape-aware print-time estimate only when settings are passed', async () => {
    const obj = cubeCorners(20).map(([x, y, z]) => `v ${x} ${y} ${z}`)
    for (let i = 0; i < CUBE_INDEX.length; i += 3) {
      obj.push(`f ${CUBE_INDEX[i] + 1} ${CUBE_INDEX[i + 1] + 1} ${CUBE_INDEX[i + 2] + 1}`)
    }
    const bytes = enc(obj.join('\n'))
    expect((await recomputeMetricsFromModel(bytes, 'part.obj')).printHoursShapeAware).toBeUndefined()
    const withTime = await recomputeMetricsFromModel(bytes, 'part.obj', {
      infillPercent: 20,
      layerHeightMm: 0.2,
    })
    expect(withTime.printHoursShapeAware).toBeGreaterThan(0)
  })

  it('returns null for unsupported formats', async () => {
    expect(await recomputeMetricsFromModel(enc('blah'), 'part.fbx')).toBeNull()
    expect(await recomputeMetricsFromModel(enc('blah'), 'part.blend')).toBeNull()
  })

  it('reports which formats support server recompute', () => {
    for (const name of ['a.stl', 'a.obj', 'a.glb', 'a.gltf', 'a.3mf', 'A.STL']) {
      expect(supportsServerRecompute(name)).toBe(true)
    }
    for (const name of ['a.fbx', 'a.blend', 'a.zip', '', null]) {
      expect(supportsServerRecompute(name)).toBe(false)
    }
  })
})
