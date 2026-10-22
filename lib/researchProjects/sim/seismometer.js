import { mulberry32, gaussian, mean, sampleSd } from './prng.js'
import { normaliseParams, out, trace, chart } from './spec.js'

// Spring-mass sensor with viscous damping, after the transparent model in the supplied project 08
// teaching data generator: z'' + 2 zeta w0 z' + w0^2 z = 0, z(0) = A, z'(0) = 0. SYNTHETIC only.

const COIL_G = 0.2 // V s / m, the teaching value used for the ideal coil column
const DT = 0.02 // 50 Hz sampling, 10 s record, as in the supplied data

export const params = [
  { id: 'massKg', label: 'Mass m', unit: 'kg', min: 0.05, max: 0.5, step: 0.01, default: 0.1 },
  { id: 'f0Hz', label: 'Natural frequency f₀', unit: 'Hz', min: 0.5, max: 3, step: 0.05, default: 1 },
  { id: 'dampingRatio', label: 'Damping ratio ζ', unit: '', min: 0.02, max: 1.5, step: 0.01, default: 0.2 },
  { id: 'startMm', label: 'Starting displacement', unit: 'mm', min: 1, max: 10, step: 0.5, default: 5 },
  { id: 'noiseUm', label: 'Displacement noise (1 s.d.)', unit: 'µm', min: 0, max: 200, step: 5, default: 50 },
  { id: 'thresholdMm', label: 'Usable-peak threshold', unit: 'mm', min: 0.1, max: 2, step: 0.1, default: 0.5 },
  { id: 'baseFreqHz', label: 'Base-shaking test frequency', unit: 'Hz', min: 0.1, max: 5, step: 0.05, default: 1 },
]

export const assumptions = [
  'SYNTHETIC model only: a linear spring, constant viscous damping, a rigid base and small motion. Real friction, lateral swing and enclosure drafts break these assumptions.',
  'Ring-down is the free response from rest after an initial relative displacement. Noise is independent Gaussian displacement noise on a 50 Hz record of 10 s, as in the supplied teaching data.',
  'Frequency response is the steady-state ratio |Z/Y| of relative to base motion, r²/√[(1−r²)² + (2ζr)²] with r = f/f₀.',
  'The ideal coil emf is G·ż with G = 0.2 V·s/m and no electronic noise: it senses velocity, not displacement.',
]

export const caveats = [
  'A good fit to a synthetic trace does not show that a real sensor measures ground motion accurately. Calibrate with a measured base input before claiming a sensitivity.',
  'No earthquake prediction, early-warning or building-safety claim is made or implied.',
  'No damping ratio is best for every task: the choice depends on the task, the metric and the uncertainty.',
]

export function relative(zeta, w0, A, t) {
  const a = zeta * w0
  if (Math.abs(zeta - 1) < 1e-9) return A * Math.exp(-w0 * t) * (1 + w0 * t)
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta)
    return A * Math.exp(-a * t) * (Math.cos(wd * t) + (a / wd) * Math.sin(wd * t))
  }
  const wh = w0 * Math.sqrt(zeta * zeta - 1)
  return A * Math.exp(-a * t) * (Math.cosh(wh * t) + (a / wh) * Math.sinh(wh * t))
}

function velocity(zeta, w0, A, t) {
  const h = 1e-5
  return (relative(zeta, w0, A, t + h) - relative(zeta, w0, A, t - h)) / (2 * h)
}

export const gain = (r, zeta) => (r * r) / Math.sqrt((1 - r * r) ** 2 + (2 * zeta * r) ** 2)

export function run(input) {
  const p = normaliseParams(params, input)
  const w0 = 2 * Math.PI * p.f0Hz
  const k = p.massKg * w0 * w0
  const c = 2 * p.dampingRatio * Math.sqrt(k * p.massKg)
  const A = p.startMm / 1000
  const z = p.dampingRatio
  const under = z < 1
  const wd = under ? w0 * Math.sqrt(1 - z * z) : NaN
  const Td = under ? (2 * Math.PI) / wd : NaN
  const delta = under ? (2 * Math.PI * z) / Math.sqrt(1 - z * z) : NaN

  const n = Math.round(10 / DT) + 1
  const t = Array.from({ length: n }, (_, i) => i * DT)
  const truth = t.map(x => relative(z, w0, A, x) * 1000)
  const rand = mulberry32(8102026)
  const observed = truth.map(v => v + (p.noiseUm / 1000) * gaussian(rand))

  // Estimate damping from consecutive same-sign peaks of the noisy record.
  const floor = Math.max(5 * (p.noiseUm / 1000), 0.05 * p.startMm)
  // A peak must be the maximum of its neighbourhood (a window of 0.4 periods each side), as a person
  // reading peaks by eye would pick them, so noise during the decay is not counted as ringing.
  const half = Math.max(1, Math.round(0.4 / (p.f0Hz * DT)))
  const peaks = []
  for (let i = 0; i < n; i++) {
    if (observed[i] <= floor) continue
    let isMax = true
    for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half) && isMax; j++) if (observed[j] > observed[i]) isMax = false
    if (isMax) peaks.push(observed[i])
  }
  const estimates = []
  for (let i = 0; i + 1 < peaks.length; i++) {
    const d = Math.log(peaks[i] / peaks[i + 1])
    if (under && d > 0) estimates.push(d / Math.sqrt(4 * Math.PI * Math.PI + d * d))
  }

  // Usable peaks of the true response above the threshold (same-sign peaks are one damped period apart).
  let usable = 0
  if (under) {
    for (let j = 0; j < 200; j++) {
      const amp = (A * 1000) * Math.exp(-z * w0 * j * Td)
      if (amp > p.thresholdMm) usable++
      else break
    }
  } else usable = truth[0] > p.thresholdMm ? 1 : 0

  let settle = 0
  for (let i = 0; i < 6000; i++) {
    const tt = i * 0.01
    if (Math.abs(relative(z, w0, A, tt)) > 0.05 * A) settle = tt
  }

  let maxV = 0
  for (const x of t) maxV = Math.max(maxV, Math.abs(velocity(z, w0, A, x)))

  const freqs = Array.from({ length: 160 }, (_, i) => 0.05 + (i * 4.95) / 159)
  const refs = [0.05, 0.2, 0.6]
  return {
    params: p,
    outputs: [
      out('springNPerM', 'Spring constant k = m·ω₀²', k, 'N/m'),
      out('dampingNsPerM', 'Damping coefficient c = 2ζ√(km)', c, 'N·s/m'),
      out('dampedPeriodS', 'Damped period T_d', Td, 's'),
      out('logDecrement', 'Log decrement δ = 2πζ/√(1−ζ²)', delta, ''),
      out('usablePeaks', 'Peaks above the threshold (true response)', usable, ''),
      out('settlingTimeS', 'Time to stay within 5% of the start', settle, 's'),
      out('zetaFromPeaks', 'ζ estimated from noisy peaks (mean)', estimates.length ? mean(estimates) : NaN, ''),
      out('zetaFromPeaksSd', 'ζ estimated from noisy peaks (s.d.)', estimates.length > 1 ? sampleSd(estimates) : NaN, ''),
      out('resonanceGain', 'Gain at resonance, 1/(2ζ)', 1 / (2 * z), ''),
      out('gainAtBase', 'Gain |Z/Y| at the test frequency', gain(p.baseFreqHz / p.f0Hz, z), ''),
      out('coilPeakMv', 'Peak ideal coil emf', COIL_G * maxV * 1000, 'mV'),
    ],
    series: [
      chart('ringdown', 'SYNTHETIC ring-down of the relative displacement', 't (s)', 'z (mm)', [
        trace('model (true)', t.filter((_, i) => i % 2 === 0), truth.filter((_, i) => i % 2 === 0)),
        trace('observed (with noise)', t.filter((_, i) => i % 2 === 0), observed.filter((_, i) => i % 2 === 0)),
      ]),
      chart('response', 'SYNTHETIC frequency response |Z/Y|', 'f / f₀', '|Z/Y|', [
        trace('your ζ', freqs.map(f => f / p.f0Hz), freqs.map(f => gain(f / p.f0Hz, z))),
        ...refs.map(r => trace(`ζ = ${r}`, freqs.map(f => f / p.f0Hz), freqs.map(f => gain(f / p.f0Hz, r)))),
      ]),
    ],
    warnings: [
      ...(!under ? ['At or above critical damping there are no repeated peaks, so ζ cannot be estimated from peak ratios.'] : []),
      ...(estimates.length === 0 && under ? ['Too few peaks clear the noise floor to estimate ζ from the record.'] : []),
    ],
  }
}

export function toRow(p, result) {
  const o = Object.fromEntries(result.outputs.map(x => [x.id, x.value]))
  return {
    massKg: p.massKg,
    springNPerM: o.springNPerM,
    dampingRatio: p.dampingRatio,
    f0Hz: p.f0Hz,
    zetaFromPeaks: o.zetaFromPeaks,
    usablePeaks: o.usablePeaks,
    settlingTimeS: o.settlingTimeS,
    resonanceGain: o.resonanceGain,
  }
}
