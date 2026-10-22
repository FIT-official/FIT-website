import { mulberry32, gaussian } from './prng.js'
import { normaliseParams, out, trace, chart } from './spec.js'

// 3x3 resistor-network localisation, after the transparent model in the supplied project 10 generator.
// SYNTHETIC. Nodes 0..8 on a grid, twelve 1000 ohm edges, node 8 is the 0 V reference. One edge is changed
// by the person running the simulation; all twelve one-change candidates are scored against noisy readings.
// This sim creates its OWN hidden case and never contains the supplied dataset's hidden edge.

export const EDGES = (() => {
  const e = []
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const n = 3 * r + c
      if (c < 2) e.push([n, n + 1])
      if (r < 2) e.push([n, n + 3])
    }
  }
  return e
})()

const BOUNDARY = [0, 1, 2, 3, 5, 6, 7]
const PATTERNS = [[3, 5], [1, 7], [0, 8], [2, 6]]
const CURRENT = 0.001
const BASE_OHM = 1000

export const params = [
  { id: 'hiddenEdge', label: 'Hidden changed edge (your blinded case)', unit: 'edge id', min: 0, max: 11, step: 1, default: 3, integer: true },
  { id: 'changedOhm', label: 'Changed resistance', unit: 'Ω', min: 1100, max: 3000, step: 50, default: 1500 },
  { id: 'noiseOhm', label: 'Noise on each transfer resistance (1 s.d.)', unit: 'Ω', min: 0, max: 20, step: 0.5, default: 0.5 },
  { id: 'patterns', label: 'Source patterns used', unit: '', min: 1, max: 4, step: 1, default: 4, integer: true },
  { id: 'seed', label: 'Noise seed', unit: '', min: 1, max: 999, step: 1, default: 17, integer: true },
  { id: 'showTruth', label: 'Reveal the hidden edge in the results (1 = yes)', unit: '', min: 0, max: 1, step: 1, default: 0, integer: true },
]

export const assumptions = [
  'SYNTHETIC model only: ideal DC resistors, a known topology, exactly one resistor changed, four ideal 1 mA source patterns (3→5, 1→7, 0→8, 2→6) and seven boundary-node voltages per pattern relative to node 8.',
  'Gaussian noise is added directly to the transfer-resistance differences; baseline values are noiseless. Real data have tolerances, drift and correlated errors.',
  'The winner is the best candidate within the twelve one-change hypotheses. That is not proof that the true change is in the set.',
  'Nodes are solved with Kirchhoff’s current law: L·V = I with V₈ = 0 V.',
]

export const caveats = [
  'This is a discrete resistor-network exercise inspired by electrical tomography. It is not an EIT scanner, reconstructs no tissue and is never connected to a person or animal.',
  'A margin between the best and second-best candidate in this toy example does not establish general uniqueness.',
  'Keep the hidden edge blinded from the person who analyses the data. Do not reveal it before they rank their own hypotheses.',
]

function solve(A, b) {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let i = 0; i < n; i++) {
    let piv = i
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[piv][i])) piv = r
    ;[M[i], M[piv]] = [M[piv], M[i]]
    for (let r = i + 1; r < n; r++) {
      const f = M[r][i] / M[i][i]
      for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c]
    }
  }
  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n]
    for (let c = i + 1; c < n; c++) s -= M[i][c] * x[c]
    x[i] = s / M[i][i]
  }
  return x
}

// Transfer resistances (V / I) at the boundary nodes for all four source patterns.
export function forward(resistances, patternCount = 4) {
  const L = Array.from({ length: 9 }, () => new Array(9).fill(0))
  EDGES.forEach(([a, b], i) => {
    const g = 1 / resistances[i]
    L[a][a] += g
    L[b][b] += g
    L[a][b] -= g
    L[b][a] -= g
  })
  const reduced = L.slice(0, 8).map(row => row.slice(0, 8))
  const result = []
  for (const [a, b] of PATTERNS.slice(0, patternCount)) {
    const q = new Array(8).fill(0)
    if (a < 8) q[a] += CURRENT
    if (b < 8) q[b] -= CURRENT
    const v = [...solve(reduced, q), 0]
    for (const node of BOUNDARY) result.push(v[node] / CURRENT)
  }
  return result
}

export function run(input) {
  const p = normaliseParams(params, input)
  const base = forward(new Array(12).fill(BASE_OHM), p.patterns)
  const changed = new Array(12).fill(BASE_OHM)
  changed[p.hiddenEdge] = p.changedOhm
  const truth = forward(changed, p.patterns).map((v, i) => v - base[i])
  const rand = mulberry32(10102026 + p.seed)
  const observed = truth.map(v => v + p.noiseOhm * gaussian(rand))

  const sse = EDGES.map((_, edge) => {
    const r = new Array(12).fill(BASE_OHM)
    r[edge] = p.changedOhm
    const prediction = forward(r, p.patterns).map((v, i) => v - base[i])
    return prediction.reduce((s, v, i) => s + (observed[i] - v) ** 2, 0)
  })
  const ranked = sse.map((v, edge) => ({ edge, v })).sort((a, b) => a.v - b.v)
  const [best, second] = ranked
  const reveal = p.showTruth === 1
  const nReadings = observed.length

  return {
    params: p,
    outputs: [
      out('bestEdge', 'Best-fitting candidate edge', best.edge, 'edge id'),
      out('bestNodes', 'Best candidate connects nodes', EDGES[best.edge][0] * 10 + EDGES[best.edge][1], 'nodes (a·10 + b)'),
      out('bestSse', 'SSE of the best candidate', best.v, 'Ω²', 4),
      out('secondSse', 'SSE of the second-best candidate', second.v, 'Ω²', 4),
      out('marginRatio', 'Second-best SSE ÷ best SSE', best.v > 0 ? second.v / best.v : NaN, ''),
      out('expectedNoiseSse', 'Expected SSE from noise alone, n·σ²', nReadings * p.noiseOhm * p.noiseOhm, 'Ω²'),
      out('readings', 'Number of readings used', nReadings, ''),
      out('identified', reveal ? 'Best candidate equals the hidden edge (1 = yes)' : 'Hidden edge hidden (reveal to score)', reveal ? (best.edge === p.hiddenEdge ? 1 : 0) : NaN, ''),
    ],
    series: [
      chart('sse', 'SYNTHETIC residual of each one-change candidate', 'candidate edge id', 'log₁₀ SSE (Ω²)', [
        trace('candidates', EDGES.map((_, i) => i), sse.map(v => Math.log10(Math.max(v, 1e-6)))),
      ]),
    ],
    warnings: [
      ...(best.edge !== p.hiddenEdge && reveal ? ['The best candidate is not the hidden edge: noise or too few patterns left the answer ambiguous.'] : []),
      ...(second.v < 3 * best.v ? ['The margin to the second-best candidate is small, so this winner is not stable.'] : []),
    ],
  }
}

export function toRow(p, result) {
  const o = Object.fromEntries(result.outputs.map(x => [x.id, x.value]))
  return {
    patternsUsed: p.patterns,
    noiseOhm: p.noiseOhm,
    changedOhm: p.changedOhm,
    bestEdge: o.bestEdge,
    bestSse: o.bestSse,
    marginRatio: o.marginRatio,
    identified: o.identified,
  }
}
