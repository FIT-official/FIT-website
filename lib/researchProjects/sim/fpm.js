import { fft } from './fft.js'
import { mulberry32, gaussian } from './prng.js'
import { normaliseParams, out, trace, chart } from './spec.js'

const N = 256
const R = 16
const ZONE_BINS = [6, 14, 22, 30]
const ZONE_LEN = N / ZONE_BINS.length

export const params = [
  { id: 'wavelengthNm', label: 'Wavelength', unit: 'nm', min: 400, max: 700, step: 5, default: 530 },
  { id: 'naObjective', label: 'Objective numerical aperture', unit: '', min: 0.04, max: 0.3, step: 0.01, default: 0.1 },
  { id: 'ledPitchMm', label: 'LED pitch', unit: 'mm', min: 1, max: 12, step: 0.5, default: 4 },
  { id: 'ledHeightMm', label: 'LED array to sample distance', unit: 'mm', min: 20, max: 120, step: 1, default: 60 },
  { id: 'ledsPerSide', label: 'LEDs each side of centre (1D row)', unit: '', min: 0, max: 12, step: 1, default: 6, integer: true },
  { id: 'iterations', label: 'Reconstruction iterations', unit: '', min: 1, max: 40, step: 1, default: 10, integer: true },
  { id: 'noisePct', label: 'Image noise (of mean intensity)', unit: '%', min: 0, max: 10, step: 0.5, default: 1 },
]

export const assumptions = [
  'One-dimensional coherent amplitude model on 256 samples; a 2D microscope is analogous but not identical.',
  'The sample is an inert amplitude target made of four zones of sinusoidal line pairs at 6, 14, 22 and 30 cycles per field. The pupil radius is 16 bins, so only the first two zones are visible in a single bright-field image.',
  'Each LED tilts the illumination and shifts the sample spectrum behind a fixed circular (here 1D) pupil by round(16 · sinθ / NA) bins.',
  'Reconstruction is a basic alternating-projection (Gerchberg–Saxton style) update; real systems add pupil recovery, intensity-noise models and background subtraction.',
  'The camera is assumed to resolve every sample of the field (no pixel-size aliasing) and illumination is perfectly coherent.',
]

export const caveats = [
  'This is a forward-model teaching simulation, not a reproduction of the published instrument or of its reported results. The repository README cites a bioRxiv preprint that has not been peer reviewed.',
  'Use inert targets such as a printed or etched resolution chart. No biological or clinical claim is made or implied.',
  'Hardware designs derived from OpenFlexure keep their own licence terms (CERN-OHL-S); the MIT licence in the Open FPM repository does not relicense upstream designs.',
]

function wrap(k) {
  return ((k % N) + N) % N
}

function inPupil(k) {
  const kk = k > N / 2 ? k - N : k
  return Math.abs(kk) <= R
}

function makeObject() {
  const o = new Float64Array(N).fill(0.5)
  ZONE_BINS.forEach((bins, z) => {
    for (let i = 0; i < ZONE_LEN; i++) {
      const x = z * ZONE_LEN + i
      o[x] = 0.5 + 0.5 * Math.cos((2 * Math.PI * bins * x) / N)
    }
  })
  return o
}

function lowRes(Ore, Oim, shift) {
  const re = new Float64Array(N)
  const im = new Float64Array(N)
  for (let k = 0; k < N; k++) {
    if (!inPupil(k)) continue
    re[k] = Ore[wrap(k - shift)]
    im[k] = Oim[wrap(k - shift)]
  }
  return { re, im }
}

function zoneScores(truth, recon) {
  return ZONE_BINS.map((_, z) => {
    const lo = z * ZONE_LEN + 8
    const hi = (z + 1) * ZONE_LEN - 8
    let mt = 0
    let mr = 0
    for (let i = lo; i < hi; i++) { mt += truth[i]; mr += recon[i] }
    mt /= hi - lo
    mr /= hi - lo
    let stt = 0
    let srr = 0
    let str = 0
    for (let i = lo; i < hi; i++) {
      stt += (truth[i] - mt) ** 2
      srr += (recon[i] - mr) ** 2
      str += (truth[i] - mt) * (recon[i] - mr)
    }
    const corr = stt > 0 && srr > 1e-12 ? str / Math.sqrt(stt * srr) : 0
    const contrast = Math.sqrt(srr / stt)
    return { corr, contrast, resolved: corr > 0.8 && contrast > 0.5 }
  })
}

export function overlap2D(separation, radius) {
  const q = separation / (2 * radius)
  if (q >= 1) return 0
  if (q <= 0) return 1
  return (2 / Math.PI) * (Math.acos(q) - q * Math.sqrt(1 - q * q))
}

export function run(input) {
  const p = normaliseParams(params, input)
  const m = p.ledsPerSide
  const sinTheta = []
  for (let j = -m; j <= m; j++) {
    const x = j * p.ledPitchMm
    sinTheta.push(x / Math.hypot(x, p.ledHeightMm))
  }
  const maxShiftAllowed = N / 2 - R - 1
  let clipped = false
  const shifts = sinTheta.map(s => {
    let v = Math.round((R * s) / p.naObjective)
    if (Math.abs(v) > maxShiftAllowed) { v = Math.sign(v) * maxShiftAllowed; clipped = true }
    return v
  })
  const sinMax = Math.max(...sinTheta.map(Math.abs))
  const naSynth = p.naObjective + sinMax
  const period = (p.wavelengthNm / 1000) / naSynth
  const periodBF = (p.wavelengthNm / 1000) / p.naObjective
  const sepBins = m > 0 ? Math.abs(shifts[m + 1] - shifts[m]) : NaN
  const ov1 = m > 0 ? Math.max(0, 1 - sepBins / (2 * R)) : NaN
  const ov2 = m > 0 ? overlap2D(sepBins, R) : NaN

  const truth = makeObject()
  const Ore = Float64Array.from(truth)
  const Oim = new Float64Array(N)
  fft(Ore, Oim)
  const rand = mulberry32(99)
  const meanI = truth.reduce((s, v) => s + v * v, 0) / N
  const images = shifts.map(s => {
    const f = lowRes(Ore, Oim, s)
    fft(f.re, f.im, true)
    return Array.from({ length: N }, (_, i) => Math.max(0, f.re[i] ** 2 + f.im[i] ** 2 + (p.noisePct / 100) * meanI * gaussian(rand)))
  })

  // Start from the bright-field image (zero shift) with zero phase.
  const centreIdx = shifts.indexOf(0)
  const bf = images[centreIdx]
  const Ere = new Float64Array(N)
  const Eim = new Float64Array(N)
  for (let i = 0; i < N; i++) Ere[i] = Math.sqrt(bf[i])
  fft(Ere, Eim)
  for (let k = 0; k < N; k++) if (!inPupil(k)) { Ere[k] = 0; Eim[k] = 0 }
  const bfAmp = Float64Array.from(Ere)
  const bfAim = Float64Array.from(Eim)
  fft(bfAmp, bfAim, true)
  const bfRecon = Array.from({ length: N }, (_, i) => Math.hypot(bfAmp[i], bfAim[i]))

  const order = shifts.map((s, i) => i).sort((a, b) => Math.abs(shifts[a]) - Math.abs(shifts[b]))
  for (let it = 0; it < p.iterations; it++) {
    for (const idx of order) {
      const s = shifts[idx]
      const cur = lowRes(Ere, Eim, s)
      const ore = Float64Array.from(cur.re)
      const oim = Float64Array.from(cur.im)
      fft(ore, oim, true)
      for (let i = 0; i < N; i++) {
        const a = Math.hypot(ore[i], oim[i])
        const target = Math.sqrt(images[idx][i])
        const scale = a > 1e-9 ? target / a : 0
        ore[i] = a > 1e-9 ? ore[i] * scale : target
        oim[i] = a > 1e-9 ? oim[i] * scale : 0
      }
      fft(ore, oim)
      for (let k = 0; k < N; k++) {
        if (!inPupil(k)) continue
        Ere[wrap(k - s)] += ore[k] - cur.re[k]
        Eim[wrap(k - s)] += oim[k] - cur.im[k]
      }
    }
  }
  const rre = Float64Array.from(Ere)
  const rim = Float64Array.from(Eim)
  fft(rre, rim, true)
  const recon = Array.from({ length: N }, (_, i) => Math.hypot(rre[i], rim[i]))
  const rmse = r => Math.sqrt(r.reduce((s, v, i) => s + (v - truth[i]) ** 2, 0) / N)
  const zonesBf = zoneScores(truth, bfRecon)
  const zones = zoneScores(truth, recon)
  const x = Array.from({ length: N }, (_, i) => i)

  return {
    params: p,
    outputs: [
      out('sinThetaMax', 'Largest illumination sinθ', sinMax, ''),
      out('naSynthetic', 'Synthetic NA = NA(obj) + sinθ(max)', naSynth, ''),
      out('periodBrightFieldUm', 'Smallest period, one bright-field image', periodBF, 'µm'),
      out('periodSyntheticUm', 'Smallest period, synthetic aperture', period, 'µm'),
      out('overlap1d', 'Adjacent pupil overlap (1D)', ov1, ''),
      out('overlap2d', 'Adjacent pupil overlap (circular pupils)', ov2, ''),
      out('rmseBrightField', 'Amplitude RMSE, bright field only', rmse(bfRecon), ''),
      out('rmseReconstruction', 'Amplitude RMSE, reconstruction', rmse(recon), ''),
      out('zonesResolvedBf', 'Target zones resolved, bright field (of 4)', zonesBf.filter(z => z.resolved).length, ''),
      out('zonesResolved', 'Target zones resolved, reconstruction (of 4)', zones.filter(z => z.resolved).length, ''),
    ],
    zones: zones.map((z, i) => ({ bins: ZONE_BINS[i], ...z })),
    series: [
      chart('amplitude', 'Sample amplitude: truth, one image, reconstruction', 'position (sample)', 'amplitude', [
        trace('truth', x, truth), trace('bright field', x, bfRecon), trace('reconstruction', x, recon),
      ]),
    ],
    warnings: [
      ...(m === 0 ? ['With no extra LEDs there is no synthetic aperture: reconstruction equals the bright-field image.'] : []),
      ...(m > 0 && ov1 < 0.2 ? ['Adjacent pupils barely overlap, so the update has little redundancy to constrain the phase.'] : []),
      ...(clipped ? ['Some LED angles were beyond the simulated spectrum width and were clipped.'] : []),
    ],
  }
}

export function toRow(p, result) {
  const o = Object.fromEntries(result.outputs.map(x => [x.id, x.value]))
  return {
    naObjective: p.naObjective,
    ledPitchMm: p.ledPitchMm,
    ledsPerSide: p.ledsPerSide,
    overlap1d: o.overlap1d,
    naSynthetic: o.naSynthetic,
    rmseReconstruction: o.rmseReconstruction,
    zonesResolved: o.zonesResolved,
  }
}
