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
 * attribute (scaled to mm). Returns null on unsupported or malformed geometry
 * so a stored request needs manual review, never a partially measured price.
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
class UnsupportedGeometry extends Error {}
const invalid = () => { throw new UnsupportedGeometry() }
const decimal = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/

function attr(tag, name) {
  const matches = [...tag.matchAll(new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, 'g'))]
  if (matches.length > 1) invalid()
  return matches[0]?.[2] ?? null
}

function numberAttr(tag, name, integer = false) {
  const text = attr(tag, name)
  if (text == null || !(integer ? /^\d+$/ : decimal).test(text)) invalid()
  const value = Number(text)
  if (!Number.isFinite(value) || (integer && !Number.isSafeInteger(value))) invalid()
  return value
}

function reference(tag) {
  // Production-extension cross-file paths require a fuller 3MF implementation.
  if (/\s(?:[\w-]+:)?path\s*=/.test(tag)) invalid()
  return String(numberAttr(tag, 'objectid', true))
}

function parseTransform(value) {
  if (value == null) return null
  const values = value.trim().split(/\s+/)
  if (values.some(value => !decimal.test(value))) invalid()
  const nums = values.map(Number)
  if (nums.length !== 12 || nums.some((n) => !Number.isFinite(n))) invalid()
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
  xml = xml.replace(/<!--[\s\S]*?-->/g, '')
  if (/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(xml) ||
      /<\/?[\w-]+:(?:model|object|mesh|vertices|vertex|triangles|triangle|components|component|build|item)\b/.test(xml)) invalid()
  const modelTags = [...xml.matchAll(/<model\b[^>]*>/g)]
  if (modelTags.length !== 1 || !/<\/model\s*>/.test(xml)) invalid()
  const modelTag = modelTags[0][0]
  if (attr(modelTag, 'requiredextensions')) invalid()
  const unit = attr(modelTag, 'unit') ?? 'millimeter'
  if (!Object.hasOwn(UNIT_TO_MM, unit)) invalid()
  const unitToMm = UNIT_TO_MM[unit]

  const objects = new Map()
  const objectRe = /<object\b([^>]*)>([\s\S]*?)<\/object>/g
  let om
  while ((om = objectRe.exec(xml))) {
    const id = String(numberAttr(`<object${om[1]}>`, 'id', true))
    if (objects.has(id)) invalid()
    const inner = om[2]

    const vertices = []
    const vertexRe = /<vertex\b[^>]*\/?>/g
    let vm
    while ((vm = vertexRe.exec(inner))) {
      vertices.push(['x', 'y', 'z'].map(axis => numberAttr(vm[0], axis)))
      if (vertices.length * 3 > MAX_POSITIONS) throw new GeometryTooLarge()
    }

    const triangles = []
    const triangleRe = /<triangle\b[^>]*\/?>/g
    let tm
    while ((tm = triangleRe.exec(inner))) {
      const indices = ['v1', 'v2', 'v3'].map(axis => numberAttr(tm[0], axis, true))
      if (indices.some(index => index >= vertices.length)) invalid()
      triangles.push(indices)
      if (triangles.length * 9 > MAX_POSITIONS) throw new GeometryTooLarge()
    }

    const components = []
    const componentRe = /<component\b[^>]*\/?>/g
    let cm
    while ((cm = componentRe.exec(inner))) {
      components.push({ objectid: reference(cm[0]), transform: parseTransform(attr(cm[0], 'transform')) })
    }

    if ((!triangles.length && !components.length) || (triangles.length && components.length) ||
        (vertices.length && !triangles.length)) invalid()
    if (triangles.length && (!/<mesh\b[^>]*>[\s\S]*<\/mesh>/.test(inner) ||
        (inner.match(/<mesh\b/g) || []).length !== 1 ||
        (inner.match(/<vertices\b/g) || []).length !== 1 || (inner.match(/<triangles\b/g) || []).length !== 1)) invalid()
    if (components.length && (!/<components\b[^>]*>[\s\S]*<\/components>/.test(inner) ||
        (inner.match(/<components\b/g) || []).length !== 1)) invalid()
    objects.set(id, { vertices, triangles, components })
  }
  if (!objects.size || objects.size !== (xml.match(/<object\b/g) || []).length) invalid()

  const buildItems = []
  const buildMatch = /<build\b[^>]*>([\s\S]*?)<\/build>/.exec(xml)
  if (buildMatch && (xml.match(/<build\b/g) || []).length === 1) {
    const itemRe = /<item\b[^>]*\/?>/g
    let im
    while ((im = itemRe.exec(buildMatch[1]))) {
      const printable = attr(im[0], 'printable')
      if (printable != null && !['true', '1'].includes(printable)) invalid()
      buildItems.push({ objectid: reference(im[0]), transform: parseTransform(attr(im[0], 'transform')) })
    }
  } else invalid()
  if (!buildItems.length) invalid()

  return { unitToMm, objects, buildItems }
}

function emitObject(objects, id, matrix, scale, positions, ancestors = new Set()) {
  if (ancestors.size > 32 || ancestors.has(id)) invalid()
  const obj = objects.get(id)
  if (!obj || matrix.some(value => !Number.isFinite(value))) invalid()
  ancestors.add(id)
  for (const [a, b, c] of obj.triangles) {
    for (const vi of [a, b, c]) {
      const v = obj.vertices[vi]
      if (!v) invalid()
      const [x, y, z] = transformPoint(matrix, v[0], v[1], v[2])
      if (![x * scale, y * scale, z * scale].every(Number.isFinite)) invalid()
      positions.push(x * scale, y * scale, z * scale)
      if (positions.length > MAX_POSITIONS) throw new GeometryTooLarge()
    }
  }
  for (const comp of obj.components) {
    const local = comp.transform || IDENTITY
    emitObject(objects, comp.objectid, composeTransform(local, matrix), scale, positions, ancestors)
  }
  ancestors.delete(id)
}

/** Locate the primary 3D model part inside the OPC package. */
async function findModelPart(zip) {
  const parts = zip.file(/\.model$/i)
  // Never silently price just one mesh from a multi-part production-extension assembly.
  if (parts.length !== 1) return null
  // Preferred: the conventional path used by every mainstream exporter
  const conventional = zip.file('3D/3dmodel.model')
  if (conventional) return conventional.async('string')
  // Fallback: any *.model part
  const anyModel = parts[0]
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
    for (const item of buildItems) {
      emitObject(objects, item.objectid, item.transform || IDENTITY, unitToMm, positions)
    }
    return positions.length >= 9 ? positions : null
  } catch {
    return null // unsupported or incomplete geometry -> manual review
  }
}
