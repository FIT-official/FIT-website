// @vitest-environment node
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { positionsInPrintAxes, sourceUpAxis } from '@/lib/quoting/modelOrientation'
import { boundingBox, meshVolume } from '@/lib/quoting/geometryVolume'
import { computeMetricsFromObject, extractPositions } from '@/lib/quoting/threeGeometryAdapter'
import { parseModelToPositions, recomputeMetricsFromModel } from '@/lib/quoting/serverGeometry'
import { layerStackComponents } from '@/lib/quoting/printTime/layerStack'

function tallBox(scale = 1) {
  return new THREE.Mesh(new THREE.BoxGeometry(10 * scale, 200 * scale, 30 * scale))
}

function objBytes(positions) {
  let text = ''
  for (let i = 0; i < positions.length; i += 3) text += `v ${positions[i]} ${positions[i + 1]} ${positions[i + 2]}\n`
  for (let i = 0; i < positions.length / 3; i += 3) text += `f ${i + 1} ${i + 2} ${i + 3}\n`
  return Buffer.from(text)
}

function gltfBytes(positions) {
  const floats = new Float32Array(positions)
  const bytes = Buffer.from(floats.buffer)
  return Buffer.from(JSON.stringify({
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    buffers: [{ byteLength: bytes.length, uri: `data:application/octet-stream;base64,${bytes.toString('base64')}` }],
    bufferViews: [{ buffer: 0, byteLength: bytes.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 4 }] }],
  }))
}

describe('print height coordinate convention', () => {
  it('uses source conventions consistently, with OBJ explicitly assumed Y-up', () => {
    for (const name of ['part.obj', 'part.glb', 'part.GLTF']) expect(sourceUpAxis(name)).toBe('y')
    for (const name of ['part.stl', 'part.3mf']) expect(sourceUpAxis(name)).toBe('z')
  })
  it('rotates Y-up into Z-up without changing volume, dimensions magnitude or source data', () => {
    const positions = extractPositions(tallBox())
    const original = positions.slice()
    const rotated = positionsInPrintAxes(positions, 'tall.obj')
    expect(positions).toEqual(original)
    expect(rotated).not.toBe(positions)
    expect(boundingBox(rotated).size).toEqual([10, 30, 200])
    expect(meshVolume(rotated)).toBeCloseTo(meshVolume(positions), 8)
    expect(positionsInPrintAxes(positions, 'part.stl')).toBe(positions)
    expect(positionsInPrintAxes(positions, 'part.3mf')).toBe(positions)
  })
  it('client metrics report actual print height for OBJ while retaining STL Z-up height', () => {
    const source = tallBox()
    const obj = computeMetricsFromObject(source, 'part.obj')
    const stl = computeMetricsFromObject(source, 'part.stl')
    expect(obj.dimensionsCm).toEqual({ length: 1, width: 3, height: 20 })
    expect(stl.dimensionsCm).toEqual({ length: 1, width: 20, height: 3 })
    expect(obj.volumeCm3).toBeCloseTo(60, 8)
    expect(stl.volumeCm3).toBeCloseTo(60, 8)
    expect(source.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0])
  })
  it('server OBJ metrics agree with the client and slicing uses the same 200mm height', async () => {
    const source = tallBox()
    const bytes = objBytes(extractPositions(source))
    const parsed = await parseModelToPositions(bytes, 'part.obj')
    expect(parsed.sourceUnit).toBe('mm')
    expect(boundingBox(parsed.positions).size).toEqual([10, 30, 200])
    expect(await recomputeMetricsFromModel(bytes, 'part.obj')).toEqual(computeMetricsFromObject(source, 'part.obj'))
    const stack = layerStackComponents({ ...parsed, settings: { layerHeightMm: 0.2 } })
    expect(stack.totalLayers).toBe(1000)
  })
  it('server and client glTF retain metres and agree on Y-up height after rotation', async () => {
    const source = tallBox(0.001)
    const bytes = gltfBytes(extractPositions(source))
    const server = await recomputeMetricsFromModel(bytes, 'part.gltf')
    const client = computeMetricsFromObject(source, 'part.gltf')
    expect(server).toEqual(client)
    expect(server.volumeCm3).toBeCloseTo(60, 4)
    expect(server.dimensionsCm.height).toBeCloseTo(20, 5)
    expect(server.dimensionsCm.width).toBeCloseTo(3, 5)
    expect((await parseModelToPositions(bytes, 'part.gltf')).sourceUnit).toBe('m')
  })
})
