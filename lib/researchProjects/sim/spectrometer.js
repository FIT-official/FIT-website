import { mulberry32, gaussian } from './prng.js'
import { normaliseParams, out, trace, chart } from './spec.js'

// Camera-spectrometer model, after the transparent model in the supplied project 09 generator.
// SYNTHETIC: pixel p = 0..600 maps to lambda = 400 + 0.5 p nm; two equal narrow lines are blurred by a
// Gaussian of sigma = 0.5 + 10 w nm for slit width w mm; peak height scales as (w/0.1)(1.5/sigma).

const PIXELS = 601
const BACKGROUND = 20
const BAND = [500, 550]

export const params = [
  { id: 'slitMm', label: 'Model slit width w', unit: 'mm', min: 0.05, max: 1, step: 0.05, default: 0.3 },
  { id: 'lineNm', label: 'First line wavelength', unit: 'nm', min: 440, max: 540, step: 1, default: 520 },
  { id: 'separationNm', label: 'Line separation', unit: 'nm', min: 2, max: 30, step: 0.5, default: 10 },
  { id: 'peakScale', label: 'Line strength at w = 0.1 mm', unit: 'counts', min: 100, max: 2000, step: 50, default: 600 },
  { id: 'locPixels', label: 'Peak-location uncertainty', unit: 'pixels', min: 0.5, max: 5, step: 0.5, default: 2 },
  { id: 'p1', label: 'Calibration point 1: pixel', unit: 'pixel', min: 0, max: 600, step: 1, default: 100 },
  { id: 'l1', label: 'Calibration point 1: reference', unit: 'nm', min: 400, max: 700, step: 1, default: 450 },
  { id: 'p2', label: 'Calibration point 2: pixel', unit: 'pixel', min: 0, max: 600, step: 1, default: 300 },
  { id: 'l2', label: 'Calibration point 2: reference', unit: 'nm', min: 400, max: 700, step: 1, default: 550 },
  { id: 'p3', label: 'Held-out check: pixel', unit: 'pixel', min: 0, max: 600, step: 1, default: 500 },
  { id: 'l3', label: 'Held-out check: reference', unit: 'nm', min: 400, max: 700, step: 1, default: 650 },
]

export const assumptions = [
  'SYNTHETIC model only. Linear, unsaturated detector counts with a flat background of 20 counts and independent Poisson noise; it does not reproduce a real RGB camera.',
  'Instrument blur is a Gaussian of σ = 0.5 + 10w nm. This width rule is an illustrative teaching assumption, not measured optics.',
  'The resolution criterion is declared in advance: valley height divided by mean peak height below 0.80 after background subtraction. It is a classroom criterion, not a universal law.',
  'Relative collected signal is the background-subtracted sum of counts over 500 to 550 nm. It is in counts, not watts.',
  'The pixel calibration is a straight line λ = a·p + b through the first two points; the third point checks it independently.',
]

export const caveats = [
  'A high-resolution-looking chart is not proof of high instrument resolution. Quantitative wavelength claims in hardware need a verified spectral reference.',
  'The grating relation d sin θ = qλ used in the questions holds only for normal incidence.',
  'If no verified reference is available, report pixel positions and widths in pixels instead of inventing wavelengths.',
]

function poisson(rand, lambda) {
  if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * gaussian(rand)))
  const limit = Math.exp(-lambda)
  let k = 0
  let prod = 1
  do {
    k++
    prod *= rand()
  } while (prod > limit)
  return k - 1
}

export function spectrum(p) {
  const sigma = 0.5 + 10 * p.slitMm
  const lam = Array.from({ length: PIXELS }, (_, i) => 400 + 0.5 * i)
  const g = (x, c) => Math.exp(-0.5 * ((x - c) / sigma) ** 2)
  const expected = lam.map(x => BACKGROUND + p.peakScale * (p.slitMm / 0.1) * (1.5 / sigma) * (g(x, p.lineNm) + g(x, p.lineNm + p.separationNm)))
  return { sigma, lam, expected }
}

export function run(input) {
  const p = normaliseParams(params, input)
  const { sigma, lam, expected } = spectrum(p)
  const rand = mulberry32(9102026)
  const observed = expected.map(v => poisson(rand, v))

  const sub = expected.map(v => v - BACKGROUND)
  const signal = lam.reduce((s, x, i) => (x >= BAND[0] && x <= BAND[1] ? s + sub[i] : s), 0)
  const c1 = p.lineNm
  const c2 = p.lineNm + p.separationNm
  const at = x => sub[Math.round((x - 400) / 0.5)] ?? 0
  const peaks = (at(c1) + at(c2)) / 2
  let valley = Infinity
  for (let x = c1; x <= c2; x += 0.5) valley = Math.min(valley, at(x))
  const ratio = peaks > 0 ? valley / peaks : NaN
  const resolved = ratio < 0.8

  const a = (p.l2 - p.l1) / (p.p2 - p.p1 || NaN)
  const b = p.l1 - a * p.p1
  const predicted = a * p.p3 + b

  return {
    params: p,
    outputs: [
      out('sigmaNm', 'Instrument blur σ', sigma, 'nm'),
      out('fwhmNm', 'FWHM of one line, 2√(2 ln 2)·σ', 2 * Math.sqrt(2 * Math.log(2)) * sigma, 'nm'),
      out('valleyRatio', 'Valley ÷ mean peak (background removed)', ratio, ''),
      out('resolved', 'Lines resolved by the 0.80 criterion (1 = yes)', resolved ? 1 : 0, ''),
      out('signalCounts', 'Relative signal, 500 to 550 nm', signal, 'counts', 4),
      out('slopeNmPerPixel', 'Calibration slope a', a, 'nm/pixel'),
      out('interceptNm', 'Calibration intercept b', b, 'nm'),
      out('heldOutPredictionNm', 'Held-out prediction', predicted, 'nm'),
      out('heldOutResidualNm', 'Held-out residual (prediction − reference)', predicted - p.l3, 'nm'),
      out('locUncertaintyNm', 'Wavelength uncertainty from location alone, |a|·u(p)', Math.abs(a) * p.locPixels, 'nm'),
    ],
    series: [
      chart('spectrum', 'SYNTHETIC two-line spectrum', 'wavelength (nm)', 'counts', [
        trace('expected', lam.filter(x => x >= 480 && x <= 570), expected.filter((_, i) => lam[i] >= 480 && lam[i] <= 570)),
        trace('observed (Poisson noise)', lam.filter(x => x >= 480 && x <= 570), observed.filter((_, i) => lam[i] >= 480 && lam[i] <= 570)),
      ]),
    ],
    warnings: [
      ...(!resolved ? ['By the declared criterion the two lines are NOT resolved at this slit width and separation.'] : []),
      ...(Number.isNaN(a) ? ['Calibration points 1 and 2 share a pixel, so no slope can be found.'] : []),
      ...(Math.abs(predicted - p.l3) > 3 * Math.abs(a) * p.locPixels ? ['The held-out check disagrees with the calibration by more than three times the location uncertainty.'] : []),
    ],
  }
}

export function toRow(p, result) {
  const o = Object.fromEntries(result.outputs.map(x => [x.id, x.value]))
  return {
    slitMm: p.slitMm,
    separationNm: p.separationNm,
    fwhmNm: o.fwhmNm,
    valleyRatio: o.valleyRatio,
    signalCounts: o.signalCounts,
    heldOutResidualNm: o.heldOutResidualNm,
  }
}
