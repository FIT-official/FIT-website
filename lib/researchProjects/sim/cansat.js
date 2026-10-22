import { normaliseParams, out, trace, chart } from './spec.js'

const RHO = 1.225
const G = 9.81
const C = 299792458
const ANTENNA_HEIGHT_M = 1.5

export const params = [
  { id: 'dropAltitudeM', label: 'Hypothetical release altitude', unit: 'm', min: 20, max: 1000, step: 10, default: 300 },
  { id: 'massG', label: 'Can mass', unit: 'g', min: 100, max: 600, step: 10, default: 300 },
  { id: 'chuteDiameterCm', label: 'Parachute diameter', unit: 'cm', min: 20, max: 120, step: 5, default: 60 },
  { id: 'cdChute', label: 'Parachute drag coefficient (assumed)', unit: '', min: 0.5, max: 1.8, step: 0.05, default: 0.8 },
  { id: 'crosswindMs', label: 'Steady crosswind', unit: 'm/s', min: 0, max: 12, step: 0.5, default: 3 },
  { id: 'stationDistanceM', label: 'Horizontal distance station → drop point', unit: 'm', min: 20, max: 3000, step: 10, default: 400 },
  { id: 'frequencyMHz', label: 'Link frequency (example value)', unit: 'MHz', min: 100, max: 2500, step: 1, default: 433 },
  { id: 'txPowerMw', label: 'Transmit power', unit: 'mW', min: 1, max: 100, step: 1, default: 10 },
  { id: 'txGainDbi', label: 'Can antenna gain', unit: 'dBi', min: -3, max: 5, step: 0.5, default: 1 },
  { id: 'rxGainDbi', label: 'Tracking antenna gain', unit: 'dBi', min: 0, max: 20, step: 0.5, default: 9 },
  { id: 'beamwidthDeg', label: 'Tracking antenna half-power beamwidth', unit: '°', min: 8, max: 120, step: 1, default: 55 },
  { id: 'pointingErrDeg', label: 'Mean tracker pointing error', unit: '°', min: 0, max: 40, step: 1, default: 5 },
  { id: 'sensitivityDbm', label: 'Receiver sensitivity (from datasheet)', unit: 'dBm', min: -140, max: -80, step: 1, default: -110 },
]

export const assumptions = [
  'The can descends at its terminal speed v = √(2mg / ρ C_d A) from release, carried sideways by a steady crosswind; no swing, spin or opening shock.',
  'The tracking station is on the ground, 1.5 m above the surface, at the stated horizontal distance from the drop point, and points exactly at the can apart from the stated mean pointing error.',
  'Received power uses free-space path loss. Pointing loss uses the Gaussian main-lobe approximation 12 (error ÷ beamwidth)² dB.',
  'Ground reflections, obstructions, polarisation mismatch and cable or connector losses are ignored.',
]

export const caveats = [
  'Free-space loss is optimistic near the ground, where reflection and Fresnel-zone blockage can make signal strength vary by many dB. Measure it with a surveyed ground test.',
  'This is a ground-test planning model. It does not authorise a launch, a particular frequency, or a particular transmit power; frequency and power need approval from your teacher and the competition or local authority.',
]

export function fspl(distanceM, frequencyMHz) {
  return 20 * Math.log10((4 * Math.PI * distanceM * frequencyMHz * 1e6) / C)
}

// Least-squares fit of RSSI = P1m - 10 n log10(d) with standard errors.
export function fitPathLoss(points) {
  const pts = points.filter(p => Number.isFinite(p.dM) && p.dM > 0 && Number.isFinite(p.rssiDbm))
  const k = pts.length
  if (k < 3) return null
  const x = pts.map(p => 10 * Math.log10(p.dM))
  const y = pts.map(p => p.rssiDbm)
  const mx = x.reduce((s, v) => s + v, 0) / k
  const my = y.reduce((s, v) => s + v, 0) / k
  const sxx = x.reduce((s, v) => s + (v - mx) ** 2, 0)
  if (sxx === 0) return null
  const sxy = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0)
  const slope = sxy / sxx
  const intercept = my - slope * mx
  const sse = y.reduce((s, v, i) => s + (v - (intercept + slope * x[i])) ** 2, 0)
  const s2 = sse / (k - 2)
  return {
    count: k,
    exponent: -slope,
    exponentSe: Math.sqrt(s2 / sxx),
    rssiAt1m: intercept,
    rssiAt1mSe: Math.sqrt(s2 * (1 / k + (mx * mx) / sxx)),
    residualSd: Math.sqrt(s2),
  }
}

export function run(input) {
  const p = normaliseParams(params, input)
  const mass = p.massG / 1000
  const area = (Math.PI * (p.chuteDiameterCm / 100) ** 2) / 4
  const vt = Math.sqrt((2 * mass * G) / (RHO * p.cdChute * area))
  const tDescent = p.dropAltitudeM / vt
  const pTxDbm = 10 * Math.log10(p.txPowerMw)
  const pointingLoss = 12 * (p.pointingErrDeg / p.beamwidthDeg) ** 2
  const steps = 200
  const ts = []
  const range = []
  const margin = []
  const elev = []
  const az = []
  for (let i = 0; i <= steps; i++) {
    const t = (tDescent * i) / steps
    const h = Math.max(0, p.dropAltitudeM - vt * t) - ANTENNA_HEIGHT_M
    const lateral = p.crosswindMs * t
    const horiz = Math.hypot(p.stationDistanceM, lateral)
    const d = Math.max(1, Math.hypot(horiz, h))
    const pr = pTxDbm + p.txGainDbi + p.rxGainDbi - fspl(d, p.frequencyMHz) - pointingLoss
    ts.push(t)
    range.push(d)
    margin.push(pr - p.sensitivityDbm)
    elev.push((Math.atan2(h, horiz) * 180) / Math.PI)
    az.push((Math.atan2(lateral, p.stationDistanceM) * 180) / Math.PI)
  }
  const dt = tDescent / steps
  let maxEl = 0
  let maxAz = 0
  for (let i = 1; i <= steps; i++) {
    maxEl = Math.max(maxEl, Math.abs(elev[i] - elev[i - 1]) / dt)
    maxAz = Math.max(maxAz, Math.abs(az[i] - az[i - 1]) / dt)
  }
  const minMargin = Math.min(...margin)
  return {
    params: p,
    outputs: [
      out('terminalSpeedMs', 'Terminal descent speed', vt, 'm/s'),
      out('descentTimeS', 'Descent time', tDescent, 's', 4),
      out('maxRangeM', 'Largest slant range', Math.max(...range), 'm', 4),
      out('pointingLossDb', 'Mean pointing loss', pointingLoss, 'dB'),
      out('minMarginDb', 'Smallest link margin', minMargin, 'dB'),
      out('maxAzRateDegS', 'Peak azimuth rate needed', maxAz, '°/s'),
      out('maxElRateDegS', 'Peak elevation rate needed', maxEl, '°/s'),
      out('startElevationDeg', 'Elevation at release', elev[0], '°'),
    ],
    series: [
      chart('margin', 'Link margin against time', 't (s)', 'margin (dB)', [trace('margin', ts, margin)]),
      chart('range', 'Slant range against time', 't (s)', 'range (m)', [trace('range', ts, range)]),
    ],
    warnings: [
      ...(minMargin < 10 ? ['Smallest margin is under 10 dB, which leaves little allowance for fading, reflections and cable losses.'] : []),
      ...(minMargin < 0 ? ['Predicted link is lost at some point in the descent.'] : []),
    ],
  }
}

export function toRow(p, result) {
  const o = Object.fromEntries(result.outputs.map(x => [x.id, x.value]))
  return {
    stationDistanceM: p.stationDistanceM,
    dropAltitudeM: p.dropAltitudeM,
    beamwidthDeg: p.beamwidthDeg,
    pointingErrDeg: p.pointingErrDeg,
    terminalSpeedMs: o.terminalSpeedMs,
    minMarginDb: o.minMarginDb,
    maxAzRateDegS: o.maxAzRateDegS,
  }
}
