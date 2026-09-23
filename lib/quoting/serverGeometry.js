/**
 * Server-side geometry recomputation for tamper-resistant quotes. Given a stored
 * model's bytes + filename, recompute the pricing metrics on the server instead
 * of trusting client-sent values. Supports STL, OBJ, glTF/GLB, and 3MF; other
 * formats (and unparseable files) return null so the caller falls back to
 * client metrics (see openspec change `add-server-side-geometry-verification`).
 *
 * Source units mirror the client adapter (lib/quoting/threeGeometryAdapter.js):
 * STL/OBJ/3MF are millimetres, glTF/GLB are metres — so a client and server
 * recompute of the same file agree and deviation logging stays meaningful.
 */
import { parseStlToPositions } from './stl.js'
import { parseObjToPositions } from './obj.js'
import { parseGltfToPositions } from './gltf.js'
import { parse3mfToPositions } from './threeMf.js'
import { computeGeometryMetrics } from './geometryVolume.js'
import { positionsInPrintAxes } from './modelOrientation.js'
import { estimatePrintHoursLayerStack, resolveLayerStackModel } from './printTime/layerStack.js'

const PARSERS = {
  stl: { parse: parseStlToPositions, sourceUnit: 'mm' },
  obj: { parse: parseObjToPositions, sourceUnit: 'mm' },
  glb: { parse: parseGltfToPositions, sourceUnit: 'm' },
  gltf: { parse: parseGltfToPositions, sourceUnit: 'm' },
  '3mf': { parse: parse3mfToPositions, sourceUnit: 'mm' },
}

function extensionOf(fileName) {
  return String(fileName || '').split(/[?#]/)[0].toLowerCase().split('.').pop()
}

/** Whether the file format can be recomputed server-side (worth an S3 fetch). */
export function supportsServerRecompute(fileName) {
  return Object.prototype.hasOwnProperty.call(PARSERS, extensionOf(fileName))
}

/**
 * Parse a model file to Z-up print triangle positions + their source unit — the
 * shared front half of recomputeMetricsFromModel, exposed for tooling that
 * needs the positions themselves (e.g. scripts/validate-print-times.mjs).
 * @returns {Promise<{positions: Float32Array|number[], sourceUnit: string}|null>}
 */
export async function parseModelToPositions(buffer, fileName) {
  const entry = PARSERS[extensionOf(fileName)]
  if (!entry) return null
  const positions = await entry.parse(buffer)
  if (!positions || positions.length < 9) return null
  return { positions: positionsInPrintAxes(positions, fileName), sourceUnit: entry.sourceUnit }
}

/**
 * Recompute geometry metrics from a stored model's bytes.
 *
 * When `settings` (print config) is supplied, the parsed positions are also fed
 * through the shape-aware layer-stack estimator and returned as
 * `printHoursShapeAware`. This is recorded for print-farm validation only — it
 * does NOT feed the priced quote, which stays on the volume-only heuristic until
 * the layer-stack time constants are validated against real prints (openspec
 * change `add-lightweight-print-time-estimator`, tasks 3.2/3.3).
 *
 * @param {object} [layerStackModel] - admin-fitted constants
 *   (AppSettings.quotingConfig.layerStackModel); merged over the defaults
 * @returns {Promise<object|null>} metrics from computeGeometryMetrics (plus
 *   `printHoursShapeAware` when settings are given), or null when the format is
 *   unsupported or the file cannot be parsed
 */
export async function recomputeMetricsFromModel(buffer, fileName, settings, layerStackModel) {
  const parsed = await parseModelToPositions(buffer, fileName)
  if (!parsed) return null
  const { positions, sourceUnit } = parsed
  const metrics = computeGeometryMetrics({ positions, index: null, sourceUnit })
  if (settings) {
    metrics.printHoursShapeAware = estimatePrintHoursLayerStack(
      { positions, sourceUnit, settings },
      resolveLayerStackModel(layerStackModel),
    )
  }
  return metrics
}
