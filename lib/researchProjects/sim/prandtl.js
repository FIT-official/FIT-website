import { normaliseParams, out, trace, chart } from './spec.js'

const RHO = 1.225
const NU = 1.46e-5
const G = 9.81
const NT = 20

export const params = [
  { id: 'spanM', label: 'Wing span b', unit: 'm', min: 0.3, max: 3, step: 0.05, default: 0.8 },
  { id: 'rootChordMm', label: 'Root chord', unit: 'mm', min: 50, max: 400, step: 5, default: 160 },
  { id: 'taper', label: 'Taper ratio (tip chord ÷ root chord)', unit: '', min: 0.2, max: 1, step: 0.05, default: 0.5 },
  { id: 'twistDeg', label: 'Tip twist relative to root (negative = washout)', unit: '°', min: -8, max: 4, step: 0.5, default: -3 },
  { id: 'alphaRootDeg', label: 'Root angle of attack', unit: '°', min: -2, max: 12, step: 0.5, default: 5 },
  { id: 'alphaL0Deg', label: 'Zero-lift angle of the section', unit: '°', min: -8, max: 0, step: 0.5, default: -2 },
  { id: 'slopeFactor', label: 'Section lift-slope as a fraction of 2π', unit: '', min: 0.5, max: 1, step: 0.05, default: 0.9 },
  { id: 'massG', label: 'Glider mass', unit: 'g', min: 30, max: 1500, step: 10, default: 250 },
  { id: 'cd0', label: 'Section profile drag coefficient', unit: '', min: 0.008, max: 0.12, step: 0.002, default: 0.035 },
]

export const assumptions = [
  'Prandtl lifting-line theory for a straight, symmetric wing, solved with the Glauert Fourier series (20 collocation points, odd terms only).',
  'Chord tapers linearly from root to tip and geometric twist varies linearly with distance from the centreline.',
  'Section lift slope is a fraction of the thin-aerofoil value 2π per radian, chosen by the user; there is no stall, separation or sweep.',
  'Profile drag is a single user-chosen constant. Air is at sea-level standard density 1.225 kg/m³ and kinematic viscosity 1.46×10⁻⁵ m²/s.',
  'Flight speed is not free: it is the speed at which lift balances the glider’s weight for the chosen angle of attack.',
]

export const caveats = [
  'Performance claimed for a full-size flying wing does not transfer to a small student glider; the Reynolds number is far lower, so lift slope, drag and stall behaviour all change.',
  'Lifting-line theory is unreliable for low aspect ratio and for swept wings. Treat the span-efficiency output as a trend, then check it against repeated flights.',
  'Fly only in an area approved by your teacher, with a soft airframe, away from people and roads.',
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

// Returns Glauert coefficients and wing geometry for a single configuration.
export function liftingLine({ span, rootChord, taper, twistRad, alphaRootRad, alphaL0Rad, a0 }) {
  const S = (span * rootChord * (1 + taper)) / 2
  const AR = (span * span) / S
  const A = []
  const rhs = []
  const odd = Array.from({ length: NT }, (_, i) => 2 * i + 1)
  for (let j = 1; j <= NT; j++) {
    const th = (j * Math.PI) / (2 * NT)
    const c = rootChord * (1 - (1 - taper) * Math.abs(Math.cos(th)))
    const mu = (a0 * c) / (4 * span)
    const alpha = alphaRootRad + twistRad * Math.abs(Math.cos(th)) - alphaL0Rad
    A.push(odd.map(n => Math.sin(n * th) * (n * mu + Math.sin(th))))
    rhs.push(mu * alpha * Math.sin(th))
  }
  const coef = solve(A, rhs)
  const CL = coef[0] * Math.PI * AR
  let sum = 0
  odd.forEach((n, i) => { sum += n * coef[i] * coef[i] })
  const CDi = Math.PI * AR * sum
  const e = CL === 0 ? NaN : (coef[0] * coef[0]) / sum
  return { S, AR, CL, CDi, e, coef, odd }
}

function circulation(coef, odd, theta) {
  let g = 0
  odd.forEach((n, i) => { g += coef[i] * Math.sin(n * theta) })
  return g
}

export function run(input) {
  const p = normaliseParams(params, input)
  const rootChord = p.rootChordMm / 1000
  const a0 = 2 * Math.PI * p.slopeFactor
  const d2r = Math.PI / 180
  const ll = liftingLine({
    span: p.spanM, rootChord, taper: p.taper, twistRad: p.twistDeg * d2r,
    alphaRootRad: p.alphaRootDeg * d2r, alphaL0Rad: p.alphaL0Deg * d2r, a0,
  })
  const weight = (p.massG / 1000) * G
  const veq = ll.CL > 0 ? Math.sqrt((2 * weight) / (RHO * ll.S * ll.CL)) : NaN
  const meanChord = ll.S / p.spanM
  const re = veq * meanChord / NU
  const cd = p.cd0 + ll.CDi
  const ld = ll.CL / cd

  // Circulation normalised to its peak, against ellipse for comparison.
  const ys = []
  const gs = []
  const el = []
  let peak = 0
  const pts = 61
  for (let i = 0; i < pts; i++) {
    const th = (i * Math.PI) / (pts - 1)
    const g = circulation(ll.coef, ll.odd, th)
    peak = Math.max(peak, Math.abs(g))
    ys.push(-Math.cos(th))
    gs.push(g)
    el.push(Math.sin(th))
  }
  const norm = peak > 0 ? gs.map(g => g / peak) : gs
  // Spanwise centroid of lift on one semi-span, as a fraction of the semi-span.
  let num = 0
  let den = 0
  for (let i = 0; i < pts; i++) {
    if (ys[i] >= 0) { num += gs[i] * ys[i]; den += gs[i] }
  }

  return {
    params: p,
    outputs: [
      out('area', 'Wing area S', ll.S, 'm²', 4),
      out('aspectRatio', 'Aspect ratio b²/S', ll.AR, ''),
      out('cl', 'Lift coefficient C_L', ll.CL, ''),
      out('cdi', 'Induced drag coefficient C_Di', ll.CDi, '', 4),
      out('spanEfficiency', 'Span efficiency e', ll.e, ''),
      out('veq', 'Equilibrium glide speed', veq, 'm/s'),
      out('reynolds', 'Reynolds number at mean chord', re, '', 3),
      out('glideRatio', 'Glide ratio L/D', ld, ''),
      out('sinkRate', 'Sink rate', veq / ld, 'm/s'),
      out('liftCentroid', 'Lift centroid (fraction of semi-span)', den ? num / den : NaN, ''),
    ],
    series: [
      chart('circulation', 'Spanwise circulation (normalised)', 'y ÷ (b/2)', 'Γ ÷ Γ_max', [trace('this wing', ys, norm), trace('ellipse', ys, el)]),
    ],
    warnings: [
      ...(ll.CL <= 0 ? ['No positive lift at this angle of attack, so no equilibrium speed exists.'] : []),
      ...(re < 1e5 ? ['Reynolds number is below about 10⁵: lift slope and profile drag are much less certain than this model assumes.'] : []),
      ...(ll.AR < 4 ? ['Aspect ratio is low; lifting-line theory is least reliable here.'] : []),
    ],
  }
}

export function toRow(p, result) {
  const o = Object.fromEntries(result.outputs.map(x => [x.id, x.value]))
  return {
    spanM: p.spanM,
    twistDeg: p.twistDeg,
    alphaRootDeg: p.alphaRootDeg,
    massG: p.massG,
    cl: o.cl,
    spanEfficiency: o.spanEfficiency,
    reynolds: o.reynolds,
    glideRatio: o.glideRatio,
  }
}
