import { mulberry32, gaussian, mean, sampleSd } from './prng.js'
import { normaliseParams, out, trace, chart } from './spec.js'

export const params = [
  { id: 'speedMs', label: 'Speed', unit: 'm/s', min: 0.3, max: 2, step: 0.1, default: 1 },
  { id: 'radiusM', label: 'Path radius (circular lap)', unit: 'm', min: 1, max: 10, step: 0.5, default: 3 },
  { id: 'durationS', label: 'Run length', unit: 's', min: 10, max: 120, step: 5, default: 60 },
  { id: 'wheelScaleErrPct', label: 'Wheel-size (scale) error', unit: '%', min: -5, max: 5, step: 0.1, default: 1.5 },
  { id: 'slipEventsPerMin', label: 'Wheel-slip events', unit: 'per min', min: 0, max: 30, step: 1, default: 6 },
  { id: 'slipExcessPct', label: 'Extra apparent speed during slip', unit: '%', min: 0, max: 50, step: 1, default: 20 },
  { id: 'gyroBiasDegS', label: 'Heading-rate bias', unit: '°/s', min: 0, max: 2, step: 0.05, default: 0.4 },
  { id: 'lidarRateHz', label: 'LiDAR/map fix rate', unit: 'Hz', min: 1, max: 30, step: 1, default: 10 },
  { id: 'lidarSigmaCm', label: 'LiDAR/map fix noise (1 s.d.)', unit: 'cm', min: 0.5, max: 20, step: 0.5, default: 3 },
  { id: 'dropoutPct', label: 'Random fix dropout', unit: '%', min: 0, max: 100, step: 5, default: 30 },
  { id: 'outageS', label: 'Continuous LiDAR outage mid-run', unit: 's', min: 0, max: 40, step: 1, default: 10 },
  { id: 'gain', label: 'Correction gain K', unit: '', min: 0, max: 1, step: 0.05, default: 0.2 },
]

export const assumptions = [
  'Planar robot driving a constant-speed circle at low speed; the true path is known exactly, as it would be on a surveyed floor mark.',
  'Dead reckoning integrates measured wheel speed and a biased heading rate. Slip events are random 0.5 s intervals in which the wheels read faster than the robot moves.',
  'LiDAR/map matching is represented only by its result: a noisy absolute position fix. Scan matching itself is not simulated.',
  'Fusion is a fixed-gain pull towards each accepted fix. It does not estimate heading, unlike a real extended Kalman or particle filter.',
  'Twenty repeat runs with fixed seeds provide the mean and spread of each error.',
]

export const caveats = [
  'The numbers describe this toy model only. Your own robot must be compared with measured ground-truth marks on the floor.',
  'A map-based fix can be wrong in a long featureless corridor even when it reports small noise; the model assumes the map is always informative.',
  'Indoor, low-speed, supervised use only. Nothing here supports autonomous operation on roads or around people.',
]

const DT = 0.02
const RUNS = 20

function simulate(p, seed, keepTrace) {
  const rand = mulberry32(seed)
  const omega = p.speedMs / p.radiusM
  const steps = Math.round(p.durationS / DT)
  const scale = 1 + p.wheelScaleErrPct / 100
  const bias = (p.gyroBiasDegS * Math.PI) / 180
  const sigma = p.lidarSigmaCm / 100
  const fixEvery = Math.max(1, Math.round(1 / (p.lidarRateHz * DT)))
  const outageStart = (p.durationS - p.outageS) / 2
  const outageEnd = outageStart + p.outageS
  const slipProb = (p.slipEventsPerMin / 60) * DT
  let slipLeft = 0
  let ox = 0
  let oy = 0
  let oth = 0
  let fx = 0
  let fy = 0
  let fth = 0
  let sumO = 0
  let sumF = 0
  let maxF = 0
  let fixes = 0
  let lost = 0
  const t = []
  const eo = []
  const ef = []
  const pathT = { x: [], y: [] }
  const pathO = { x: [], y: [] }
  const pathF = { x: [], y: [] }
  for (let i = 1; i <= steps; i++) {
    const time = i * DT
    const th = omega * time
    const tx = p.radiusM * Math.sin(th)
    const ty = p.radiusM * (1 - Math.cos(th))
    if (slipLeft <= 0 && rand() < slipProb) slipLeft = 0.5
    const slip = slipLeft > 0 ? 1 + p.slipExcessPct / 100 : 1
    if (slipLeft > 0) slipLeft -= DT
    const vm = p.speedMs * scale * slip
    const wm = omega + bias
    oth += wm * DT
    ox += vm * Math.cos(oth - wm * DT / 2) * DT
    oy += vm * Math.sin(oth - wm * DT / 2) * DT
    fth += wm * DT
    fx += vm * Math.cos(fth - wm * DT / 2) * DT
    fy += vm * Math.sin(fth - wm * DT / 2) * DT
    if (i % fixEvery === 0) {
      fixes++
      const inOutage = time >= outageStart && time < outageEnd
      if (inOutage || rand() < p.dropoutPct / 100) lost++
      else {
        fx += p.gain * (tx + gaussian(rand) * sigma - fx)
        fy += p.gain * (ty + gaussian(rand) * sigma - fy)
      }
    }
    const dO = Math.hypot(ox - tx, oy - ty)
    const dF = Math.hypot(fx - tx, fy - ty)
    sumO += dO * dO
    sumF += dF * dF
    if (dF > maxF) maxF = dF
    if (keepTrace && i % 5 === 0) {
      t.push(time)
      eo.push(dO)
      ef.push(dF)
      pathT.x.push(tx)
      pathT.y.push(ty)
      pathO.x.push(ox)
      pathO.y.push(oy)
      pathF.x.push(fx)
      pathF.y.push(fy)
    }
  }
  return {
    rmseO: Math.sqrt(sumO / steps),
    rmseF: Math.sqrt(sumF / steps),
    maxF,
    lostFraction: fixes ? lost / fixes : 0,
    t, eo, ef, pathT, pathO, pathF,
  }
}

export function run(input) {
  const p = normaliseParams(params, input)
  const runs = Array.from({ length: RUNS }, (_, i) => simulate(p, 777 + i, i === 0))
  const rmseO = runs.map(r => r.rmseO)
  const rmseF = runs.map(r => r.rmseF)
  const first = runs[0]
  const distance = p.speedMs * p.durationS
  return {
    params: p,
    outputs: [
      out('distanceM', 'Distance travelled', distance, 'm'),
      out('rmseOdomM', 'Dead-reckoning RMS error (mean of runs)', mean(rmseO), 'm'),
      out('rmseOdomSdM', 'Dead-reckoning RMS error (s.d. of runs)', sampleSd(rmseO), 'm'),
      out('rmseFusedM', 'Fused RMS error (mean of runs)', mean(rmseF), 'm'),
      out('rmseFusedSdM', 'Fused RMS error (s.d. of runs)', sampleSd(rmseF), 'm'),
      out('maxFusedM', 'Worst fused error (mean of runs)', mean(runs.map(r => r.maxF)), 'm'),
      out('improvement', 'Error reduction factor (dead reckoning ÷ fused)', mean(rmseO) / mean(rmseF), ''),
      out('lostFraction', 'Fixes lost (realised)', mean(runs.map(r => r.lostFraction)), ''),
    ],
    series: [
      chart('error', 'Position error against time (first run)', 't (s)', 'error (m)', [trace('dead reckoning', first.t, first.eo), trace('fused', first.t, first.ef)]),
      chart('path', 'Path in the floor plane (first run)', 'x (m)', 'y (m)', [trace('true', first.pathT.x, first.pathT.y), trace('dead reckoning', first.pathO.x, first.pathO.y), trace('fused', first.pathF.x, first.pathF.y)]),
    ],
    warnings: p.gain === 0 ? ['Gain is zero, so fixes are ignored and fused equals dead reckoning.'] : [],
  }
}

export function toRow(p, result) {
  const o = Object.fromEntries(result.outputs.map(x => [x.id, x.value]))
  return {
    speedMs: p.speedMs,
    wheelScaleErrPct: p.wheelScaleErrPct,
    dropoutPct: p.dropoutPct,
    outageS: p.outageS,
    gain: p.gain,
    rmseOdomM: o.rmseOdomM,
    rmseFusedM: o.rmseFusedM,
  }
}
