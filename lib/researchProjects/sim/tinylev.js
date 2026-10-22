import { mulberry32, gaussian, mean, sampleSd } from './prng.js'
import { normaliseParams, out, trace, chart } from './spec.js'

export const params = [
  { id: 'frequencyKHz', label: 'Drive frequency', unit: 'kHz', min: 38, max: 42, step: 0.1, default: 40 },
  { id: 'tempC', label: 'Air temperature', unit: '°C', min: 10, max: 35, step: 1, default: 20 },
  { id: 'capRadiusMm', label: 'Distance from centre to each emitter, R', unit: 'mm', min: 30, max: 90, step: 0.5, default: 52 },
  { id: 'capHalfAngleDeg', label: 'Cap half-angle', unit: '°', min: 20, max: 70, step: 1, default: 50 },
  { id: 'emittersPerCap', label: 'Emitters per cap', unit: '', min: 6, max: 60, step: 1, default: 36, integer: true },
  { id: 'phaseOffsetDeg', label: 'Phase offset between the two caps', unit: '°', min: 0, max: 360, step: 5, default: 180 },
  { id: 'phaseErrorDeg', label: 'Random phase error per emitter (1 s.d.)', unit: '°', min: 0, max: 90, step: 1, default: 15 },
  { id: 'posErrorMm', label: 'Emitter position error (1 s.d., radial)', unit: 'mm', min: 0, max: 3, step: 0.05, default: 0.3 },
]

export const assumptions = [
  'Point emitters of equal amplitude on two opposed spherical caps that share the same centre; each emitter is omnidirectional and its field falls as 1/r.',
  'Pressure is evaluated only on the common axis of the caps. Radial trapping and the force on a bead are not computed.',
  'Phase and position errors are independent Gaussian draws; 40 repeat builds with fixed seeds give the mean and spread.',
  'Speed of sound in air c = 331.3 + 0.606 T (T in °C); reflections from the structure and nonlinear acoustics are ignored.',
]

export const caveats = [
  'Pressure nodes are where small, dense beads collect. This model shows where nodes sit and how robust they are to errors, not whether a particular bead levitates.',
  'Small-particle radiation-force theory needs a bead much smaller than the wavelength; millimetre beads are comparable to half a wavelength here, so measure rather than trust a formula.',
  'No safe ultrasound exposure level is inferred. Operation, enclosure and hearing/skin exposure are decided by your teacher under the school electrical and acoustic safety review.',
]

const SAMPLES = 601
const TRIALS = 40

function emitterGeometry(R, halfAngle, n) {
  // Rings at equal spacing in cos(theta) so emitters spread roughly evenly over the cap area.
  const list = []
  const ringCount = Math.max(1, Math.round(Math.sqrt(n / 3)))
  const weights = []
  for (let j = 0; j < ringCount; j++) {
    const theta = halfAngle * (j + 1) / ringCount
    weights.push(Math.sin(theta))
  }
  const total = weights.reduce((s, w) => s + w, 0)
  let placed = 0
  for (let j = 0; j < ringCount; j++) {
    const theta = halfAngle * (j + 1) / ringCount
    const count = j === ringCount - 1 ? n - placed : Math.max(1, Math.round((n * weights[j]) / total))
    placed += count
    for (let m = 0; m < count; m++) list.push({ theta, azimuth: (2 * Math.PI * m) / count, R })
  }
  return list.slice(0, n)
}

function axialIntensity(emitters, zs, k, errors) {
  const I = new Float64Array(zs.length)
  for (let i = 0; i < zs.length; i++) {
    const z = zs[i]
    let re = 0
    let im = 0
    for (let e = 0; e < emitters.length; e++) {
      const em = emitters[e]
      const R = em.R + (errors ? errors.pos[e] : 0)
      const s = Math.sin(em.theta)
      const c = Math.cos(em.theta)
      const sign = em.cap
      const dz = z - sign * R * c
      const r = Math.sqrt(R * R * s * s + dz * dz)
      const phase = k * r + em.phase + (errors ? errors.phase[e] : 0)
      const a = em.R / r
      re += a * Math.cos(phase)
      im += a * Math.sin(phase)
    }
    I[i] = re * re + im * im
  }
  return I
}

function nearestMinimum(I, zs) {
  let best = -1
  for (let i = 1; i < I.length - 1; i++) {
    if (I[i] < I[i - 1] && I[i] <= I[i + 1]) {
      if (best < 0 || Math.abs(zs[i]) < Math.abs(zs[best])) best = i
    }
  }
  return best
}

function curvature(I, i, h) {
  return (I[i + 1] - 2 * I[i] + I[i - 1]) / (h * h)
}

export function run(input) {
  const p = normaliseParams(params, input)
  const c = 331.3 + 0.606 * p.tempC
  const lambdaMm = (c / (p.frequencyKHz * 1000)) * 1000
  const k = (2 * Math.PI) / lambdaMm
  const half = (p.capHalfAngleDeg * Math.PI) / 180
  const base = emitterGeometry(p.capRadiusMm, half, p.emittersPerCap)
  const emitters = [
    ...base.map(e => ({ ...e, cap: 1, phase: 0 })),
    ...base.map(e => ({ ...e, cap: -1, phase: (p.phaseOffsetDeg * Math.PI) / 180 })),
  ]
  const span = 1.5 * lambdaMm
  const zs = Float64Array.from({ length: SAMPLES }, (_, i) => -span + (2 * span * i) / (SAMPLES - 1))
  const h = zs[1] - zs[0]

  const nominal = axialIntensity(emitters, zs, k, null)
  const iNode = nearestMinimum(nominal, zs)
  const nominalNode = iNode >= 0 ? zs[iNode] : null
  const nominalCurv = iNode >= 0 ? curvature(nominal, iNode, h) : null
  const peak = Math.max(...nominal)

  const rand = mulberry32(20261022)
  const shifts = []
  const ratios = []
  let lost = 0
  let firstTrial = null
  for (let t = 0; t < TRIALS; t++) {
    const errors = {
      phase: emitters.map(() => (gaussian(rand) * p.phaseErrorDeg * Math.PI) / 180),
      pos: emitters.map(() => gaussian(rand) * p.posErrorMm),
    }
    const I = axialIntensity(emitters, zs, k, errors)
    if (t === 0) firstTrial = I
    const i = nearestMinimum(I, zs)
    if (i < 0 || nominalNode === null || Math.abs(zs[i] - nominalNode) > lambdaMm / 4) {
      lost++
      continue
    }
    shifts.push(Math.abs(zs[i] - nominalNode))
    ratios.push(nominalCurv > 0 ? curvature(I, i, h) / nominalCurv : NaN)
  }
  const goodRatios = ratios.filter(Number.isFinite)
  // Node spacing from consecutive minima of the nominal profile.
  const minima = []
  for (let i = 1; i < nominal.length - 1; i++) if (nominal[i] < nominal[i - 1] && nominal[i] <= nominal[i + 1]) minima.push(zs[i])
  const spacing = minima.length > 1 ? (minima[minima.length - 1] - minima[0]) / (minima.length - 1) : NaN

  const step = Math.ceil(SAMPLES / 300)
  const pick = arr => Array.from(arr).filter((_, i) => i % step === 0)
  return {
    params: p,
    outputs: [
      out('soundSpeed', 'Speed of sound c', c, 'm/s', 4),
      out('wavelengthMm', 'Wavelength λ', lambdaMm, 'mm'),
      out('nodeSpacingMm', 'Measured node spacing (nominal)', spacing, 'mm'),
      out('nodePositionMm', 'Nominal node nearest centre', nominalNode === null ? NaN : nominalNode, 'mm'),
      out('nodeShiftMm', 'Node shift with errors (mean)', shifts.length ? mean(shifts) : NaN, 'mm'),
      out('nodeShiftSdMm', 'Node shift with errors (s.d.)', shifts.length ? sampleSd(shifts) : NaN, 'mm'),
      out('stiffnessRatio', 'Restoring curvature vs nominal (mean)', goodRatios.length ? mean(goodRatios) : NaN, ''),
      out('stiffnessRatioSd', 'Restoring curvature vs nominal (s.d.)', goodRatios.length ? sampleSd(goodRatios) : NaN, ''),
      out('lostFraction', 'Builds where the central node is lost', lost / TRIALS, ''),
    ],
    series: [
      chart('axial', 'Axial pressure squared on the common axis', 'z (mm)', '|p|² (relative)', [
        trace('no errors', pick(zs), pick(nominal).map(v => v / peak)),
        trace('one build with errors', pick(zs), pick(firstTrial).map(v => v / peak)),
      ]),
    ],
    warnings: [
      ...(nominalNode === null ? ['No pressure node was found on the axis for this geometry.'] : []),
      ...(lost > 0 ? [`The central node was lost in ${lost} of ${TRIALS} simulated builds.`] : []),
    ],
  }
}

export function toRow(p, result) {
  const o = Object.fromEntries(result.outputs.map(x => [x.id, x.value]))
  return {
    capRadiusMm: p.capRadiusMm,
    emittersPerCap: p.emittersPerCap,
    phaseErrorDeg: p.phaseErrorDeg,
    posErrorMm: p.posErrorMm,
    nodeSpacingMm: o.nodeSpacingMm,
    nodeShiftMm: o.nodeShiftMm,
    stiffnessRatio: o.stiffnessRatio,
  }
}
