/**
 * Minimal 3MF parser → flat positions array (mm). Used for server-side geometry
 * verification (recompute volume from the stored model rather than trusting
 * client-sent metrics).
 *
 * 3MF is an OPC zip containing a 3D model part (XML). The geometry schema is
 * narrow and machine-written (<vertex x y z/>, <triangle v1 v2 v3/>), so the
 * part is parsed with targeted regexes instead of pulling in a DOM/XML
 * dependency. Supports multiple objects, <component> composition, <build> item
 * transforms (row-major 4x3 affine per the spec), and the model `unit`
 * attribute (scaled to mm). Returns null on anything unrecognisable so the
 * caller falls back to client metrics.
 */
import JSZip from 'jszip'

// 3MF model units → millimetres (spec section 3.4.1; default is millimeter)
const UNIT_TO_MM = {
  micron: 0.001,
  millimeter: 1,
  centimeter: 10,
  inch: 25.4,
  foot: 304.8,
  meter: 1000,
}

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]

// Safety cap on total emitted position array elements across a whole parse.
// Depth alone doesn't bound cost: a shallow but heavily fanned-out
// <component> graph (an object referencing an already-large object many
// times) can still emit an unbounded amount of geometry. 2,000,000 elements
// (~222k triangles) is far beyond any real print-farm model, so hitting it
// means the file is adversarial/malformed, not a legitimate large model.
const MAX_POSITIONS = 2_000_000

class GeometryTooLarge extends Error {}

function attr(tag, name) {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag)
  return m ? m[1] : null
}

function parseTransform(value) {
  if (!value) return null
  const nums = value.trim().split(/\s+/).map(Number)
  if (nums.length !== 12 || nums.some((n) => !Number.isFinite(n))) return null
  return nums
}

/** Compose row-major 4x3 affine transforms: applying `a` then `b`. */
function composeTransform(a, b) {
  const out = new Array(12)
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] =
        a[r * 3] * b[c] +
        a[r * 3 + 1] * b[3 + c] +
        a[r * 3 + 2] * b[6 + c] +
        (r === 3 ? b[9 + c] : 0)
    }
  }
  return out
}

function transformPoint(m, x, y, z) {
  return [
    x * m[0] + y * m[3] + z * m[6] + m[9],
    x * m[1] + y * m[4] + z * m[7] + m[10],
    x * m[2] + y * m[5] + z * m[8] + m[11],
  ]
}

/** Parse the 3MF model-part XML into { unitToMm, objects, buildItems }. */
export function parseModelPart(xml) {
  const unitMatch = /<model\b[^>]*\bunit="([^"]*)"/.exec(xml)
  const unitToMm = UNIT_TO_MM[unitMatch?.[1] ?? 'millimeter'] ?? 1

  const objects = new Map()
  const objectRe = /<object\b([^>]*)>([\s\S]*?)<\/object>/g
  let om
  while ((om = objectRe.exec(xml))) {
    const id = attr(`<object${om[1]}>`, 'id')
    if (id == null) continue
    const inner = om[2]

    const vertices = []
    const vertexRe = /<vertex\b[^>]*\/?>/g
    let vm
    while ((vm = vertexRe.exec(inner))) {
      vertices.push([
        parseFloat(attr(vm[0], 'x')) || 0,
        parseFloat(attr(vm[0], 'y')) || 0,
        parseFloat(attr(vm[0], 'z')) || 0,
      ])
    }

    const triangles = []
    const triangleRe = /<triangle\b[^>]*\/?>/g
    let tm
    while ((tm = triangleRe.exec(inner))) {
      triangles.push([
        parseInt(attr(tm[0], 'v1'), 10),
        parseInt(attr(tm[0], 'v2'), 10),
        parseInt(attr(tm[0], 'v3'), 10),
      ])
    }

    const components = []
    const componentRe = /<component\b[^>]*\/?>/g
    let cm
    while ((cm = componentRe.exec(inner))) {
      const objectid = attr(cm[0], 'objectid')
      if (objectid != null) {
        components.push({ objectid, transform: parseTransform(attr(cm[0], 'transform')) })
      }
    }

    objects.set(id, { vertices, triangles, components })
  }

  const buildItems = []
  const buildMatch = /<build\b[^>]*>([\s\S]*?)<\/build>/.exec(xml)
  if (buildMatch) {
    const itemRe = /<item\b[^>]*\/?>/g
    let im
    while ((im = itemRe.exec(buildMatch[1]))) {
      const objectid = attr(im[0], 'objectid')
      if (objectid != null) {
        buildItems.push({ objectid, transform: parseTransform(attr(im[0], 'transform')) })
      }
    }
  }

  return { unitToMm, objects, buildItems }
}

function emitObject(objects, id, matrix, scale, positions, depth = 0) {
  if (depth > 32) return // guard against cyclic component references
  const obj = objects.get(id)
  if (!obj) return
  for (const [a, b, c] of obj.triangles) {
    for (const vi of [a, b, c]) {
      const v = obj.vertices[vi]
      if (!v) return // malformed triangle index: drop the object's remainder
      const [x, y, z] = transformPoint(matrix, v[0], v[1], v[2])
      positions.push(x * scale, y * scale, z * scale)
      if (positions.length > MAX_POSITIONS) throw new GeometryTooLarge()
    }
  }
  for (const comp of obj.components) {
    const local = comp.transform || IDENTITY
    emitObject(objects, comp.objectid, composeTransform(local, matrix), scale, positions, depth + 1)
  }
}

/** Locate the primary 3D model part inside the OPC package. */
async function findModelPart(zip) {
  // Preferred: the conventional path used by every mainstream exporter
  const conventional = zip.file('3D/3dmodel.model')
  if (conventional) return conventional.async('string')
  // Fallback: any *.model part
  const anyModel = zip.file(/\.model$/i)[0]
  return anyModel ? anyModel.async('string') : null
}

/**
 * Parse a 3MF package into a flat [x,y,z,...] positions array in millimetres.
 * @returns {Promise<number[]|null>} null if not a 3MF or no geometry found
 */
export async function parse3mfToPositions(buffer) {
  try {
    const zip = await JSZip.loadAsync(buffer)
    const xml = await findModelPart(zip)
    if (!xml) return null
    const { unitToMm, objects, buildItems } = parseModelPart(xml)

    const positions = []
    if (buildItems.length > 0) {
      for (const item of buildItems) {
        emitObject(objects, item.objectid, item.transform || IDENTITY, unitToMm, positions)
      }
    } else {
      // No <build> section: measure every mesh-bearing object as-placed
      for (const id of objects.keys()) emitObject(objects, id, IDENTITY, unitToMm, positions)
    }
    return positions.length >= 9 ? positions : null
  } catch {
    return null // not a zip / malformed package -> caller falls back
  }
}
