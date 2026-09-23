/**
 * Adapter between a THREE.Object3D/scene (the editor's loaded model) and the
 * pure geometry engine. This is the ONE place in lib/quoting that touches three.
 * It flattens all meshes into world-space positions so multi-part models are
 * measured as a whole.
 */
import * as THREE from 'three'
import { computeGeometryMetrics } from './geometryVolume'
import { positionsInPrintAxes } from './modelOrientation'

/** Infer the source unit from the file extension. STL/3MF/OBJ = mm, glTF = m. */
export function sourceUnitForFile(fileName) {
  const ext = String(fileName || '').split(/[?#]/)[0].toLowerCase().split('.').pop()
  if (ext === 'glb' || ext === 'gltf') return 'm'
  return 'mm'
}

/** Extract a flat world-space [x,y,z,...] positions array from an object/scene. */
export function extractPositions(object3D) {
  const positions = []
  if (!object3D) return positions
  object3D.updateWorldMatrix(true, true)
  const v = new THREE.Vector3()
  object3D.traverse((child) => {
    if (!child.isMesh || !child.geometry) return
    const geom = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry
    const pos = geom.attributes?.position
    if (!pos) return
    const m = child.matrixWorld
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m)
      positions.push(v.x, v.y, v.z)
    }
    if (geom !== child.geometry) geom.dispose?.()
  })
  return positions
}

/** Compute pricing-ready metrics directly from an editor scene + its filename. */
export function computeMetricsFromObject(object3D, fileName) {
  const positions = positionsInPrintAxes(extractPositions(object3D), fileName)
  return computeGeometryMetrics({
    positions,
    index: null, // positions are already de-indexed (sequential triangles)
    sourceUnit: sourceUnitForFile(fileName),
  })
}
