import { fft } from './fft.js'
import { mulberry32, gaussian } from './prng.js'
import { normaliseParams, out, decimate, trace, chart } from './spec.js'

const N = 1024

export const params = [
  { id: 'wavelengthNm', label: 'Wavelength', unit: 'nm', min: 400, max: 800, step: 5, default: 635 },
  { id: 'pixelUm', label: 'Sensor pixel pitch', unit: 'µm', min: 0.5, max: 6, step: 0.01, default: 1.12 },
  { id: 'binning', label: 'Pixel binning', unit: '×', min: 1, max: 8, step: 1, default: 1, integer: true },
  { id: 'distanceMm', label: 'Object-to-sensor distance z', unit: 'mm', min: 1, max: 60, step: 0.5, default: 10 },
  { id: 'objectUm', label: 'Opaque strip width w', unit: 'µm', min: 5, max: 200, step: 1, default: 60 },
  { id: 'noisePct', label: 'Sensor noise (fraction of background)', unit: '%', min: 0, max: 10, step: 0.5, default: 1 },
]

export const assumptions = [
  'One-dimensional, scalar, monochromatic plane-wave illumination; the object is an opaque strip (amplitude 0) in a clear field.',
  'Propagation uses the band-limited angular spectrum method on a grid of 1024 samples whose pitch equals the (binned) sensor pixel.',
  'The reconstruction back-propagates the square root of the recorded intensity with zero phase, so a twin-image artefact is present, as in a real in-line hologram.',
  'Binning keeps the grid at 1024 samples, so a larger binning factor also enlarges the modelled recorded window (N × binned pitch). It is therefore NOT a fixed-sensor comparison: it changes both the sampling and the window extent at once.',
  'Real sensors add a colour filter, finite fill factor, speckle and aberrations; none are modelled.',
]

export const caveats = [
  'Pixel size limits what the sensor can sample. It is not the same quantity as optical resolution, which is set by the numerical aperture of the recorded wavefront.',
  'The "smallest period" output is a coherent-cutoff estimate, not a measured resolution. Verify it with a target of known period.',
  'To compare binning on a fixed sensor, keep the window width constant by changing the number of samples as well; this model does not do that.',
]

function propagate(re, im, z, lambda, pitch, fLim) {
  const f0 = 1 / (N * pitch)
  for (let k = 0; k < N; k++) {
    const f = (k < N / 2 ? k : k - N) * f0
    if (Math.abs(f) > fLim || Math.abs(f) >= 1 / lambda) {
      re[k] = 0
      im[k] = 0
      continue
    }
    const phase = 2 * Math.PI * z * Math.sqrt(1 / (lambda * lambda) - f * f)
    const c = Math.cos(phase)
    const s = Math.sin(phase)
    const r = re[k] * c - im[k] * s
    im[k] = re[k] * s + im[k] * c
    re[k] = r
  }
}

// Width of the contiguous dip around the centre that falls below half the background level.
function stripWidth(profile, pitch, centre) {
  let sum = 0
  let count = 0
  for (let i = 0; i < N; i++) {
    if (i < N * 0.1 || i > N * 0.9) {
      sum += profile[i]
      count++
    }
  }
  const threshold = 0.5 * (sum / count)
  if (!(profile[centre] < threshold)) return null
  let left = centre
  while (left > 0 && profile[left - 1] < threshold) left--
  let right = centre
  while (right < N - 1 && profile[right + 1] < threshold) right++
  if (left === 0 || right === N - 1) return null
  const frac = (a, b) => (threshold - a) / (b - a)
  const l = left - 1 + frac(profile[left - 1], profile[left])
  const r = right + frac(profile[right], profile[right + 1])
  return (r - l) * pitch
}

export function run(input) {
  const p = normaliseParams(params, input)
  const lambda = p.wavelengthNm / 1000
  const pitch = p.pixelUm * p.binning
  const z = p.distanceMm * 1000
  const half = (N * pitch) / 2
  const naGeom = half / Math.sqrt(z * z + half * half)
  const naNyq = Math.min(1, lambda / (2 * pitch))
  const naEff = Math.min(naGeom, naNyq)
  const fLim = Math.min(1 / lambda, naEff / lambda)
  const centre = N / 2

  const re = new Float64Array(N).fill(1)
  const im = new Float64Array(N)
  for (let n = 0; n < N; n++) if (Math.abs((n - centre) * pitch) < p.objectUm / 2) re[n] = 0
  fft(re, im)
  propagate(re, im, z, lambda, pitch, fLim)
  fft(re, im, true)
  const rand = mulberry32(1234)
  const hologram = new Float64Array(N)
  for (let n = 0; n < N; n++) {
    hologram[n] = Math.max(0, re[n] * re[n] + im[n] * im[n] + (p.noisePct / 100) * gaussian(rand))
  }

  const bRe = new Float64Array(N)
  const bIm = new Float64Array(N)
  for (let n = 0; n < N; n++) bRe[n] = Math.sqrt(hologram[n])
  fft(bRe, bIm)
  propagate(bRe, bIm, -z, lambda, pitch, fLim)
  fft(bRe, bIm, true)
  const recon = new Float64Array(N)
  for (let n = 0; n < N; n++) recon[n] = bRe[n] * bRe[n] + bIm[n] * bIm[n]

  const width = stripWidth(recon, pitch, centre)
  const fresnel = (p.objectUm / 2) ** 2 / (lambda * z)
  const minPeriod = lambda / naEff
  const span = Math.min(N, Math.max(64, Math.round((6 * p.objectUm) / pitch) + 64))
  const lo = Math.max(0, centre - Math.floor(span / 2))
  const hi = Math.min(N, lo + span)
  const xs = []
  const hs = []
  const rs = []
  for (let n = lo; n < hi; n++) {
    xs.push((n - centre) * pitch)
    hs.push(hologram[n])
    rs.push(recon[n])
  }
  const h = decimate(xs, hs)
  const r = decimate(xs, rs)

  return {
    params: p,
    outputs: [
      out('effectivePitchUm', 'Effective pixel pitch (pitch × binning)', pitch, 'µm'),
      out('sensorWidthMm', 'Modelled window width, 1024 × binned pitch (grows with binning)', (N * pitch) / 1000, 'mm'),
      out('naGeometric', 'NA from window size', naGeom, ''),
      out('naNyquist', 'NA from pixel sampling', naNyq, ''),
      out('naEffective', 'Effective NA (smaller of the two)', naEff, ''),
      out('minPeriodUm', 'Smallest resolvable period ≈ λ/NA', minPeriod, 'µm'),
      out('fresnelNumber', 'Fresnel number of strip half-width', fresnel, ''),
      out('reconWidthUm', 'Reconstructed strip width (half-max)', width === null ? NaN : width, 'µm'),
      out('widthErrorUm', 'Width error vs true w', width === null ? NaN : width - p.objectUm, 'µm'),
    ],
    limiting: naGeom <= naNyq ? 'window size (aperture)' : 'pixel sampling',
    series: [
      chart('hologram', 'Recorded hologram intensity', 'x (µm)', 'relative intensity', [trace('hologram', h.x, h.y)]),
      chart('recon', 'Back-propagated intensity (reconstruction)', 'x (µm)', 'relative intensity', [trace('reconstruction', r.x, r.y)]),
    ],
    warnings: [
      ...(width === null ? ['The strip is not resolved in the reconstruction: no half-intensity dip was found.'] : []),
      ...(naGeom > naNyq ? ['Pixel sampling is the limit: fringes at the window edge are finer than two pixels.'] : []),
    ],
  }
}

export function toRow(p, result) {
  const o = Object.fromEntries(result.outputs.map(x => [x.id, x.value]))
  return {
    wavelengthNm: p.wavelengthNm,
    pixelUm: o.effectivePitchUm,
    distanceMm: p.distanceMm,
    objectUm: p.objectUm,
    naEffective: o.naEffective,
    reconWidthUm: o.reconWidthUm,
    minPeriodUm: o.minPeriodUm,
  }
}
