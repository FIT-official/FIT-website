import { fft } from './fft.js'
import { mulberry32, gaussian } from './prng.js'
import { normaliseParams, out, trace, chart } from './spec.js'

const C = 299792458
const N = 256
const M = 64

export const params = [
  { id: 'carrierGHz', label: 'Carrier frequency (example value)', unit: 'GHz', min: 2, max: 80, step: 0.1, default: 24 },
  { id: 'bandwidthMHz', label: 'Chirp bandwidth B', unit: 'MHz', min: 20, max: 4000, step: 10, default: 500 },
  { id: 'chirpUs', label: 'Chirp repetition interval T', unit: 'µs', min: 50, max: 2000, step: 10, default: 200 },
  { id: 'rangeM', label: 'Target range R', unit: 'm', min: 1, max: 60, step: 0.1, default: 12.3 },
  { id: 'velocityMs', label: 'Target radial speed v (+ away)', unit: 'm/s', min: -20, max: 20, step: 0.1, default: 2.5 },
  { id: 'snrDb', label: 'Signal-to-noise ratio per sample', unit: 'dB', min: -10, max: 40, step: 1, default: 15 },
  { id: 'apertureM', label: 'Synthetic aperture length L (SAR only)', unit: 'm', min: 0.2, max: 6, step: 0.1, default: 2 },
]

export const assumptions = [
  'Frequency-modulated continuous-wave radar with complex baseband samples: 256 samples per chirp and 64 chirps per frame.',
  'One point target. The beat signal is a sampled complex tone whose frequency encodes range and whose chirp-to-chirp phase encodes radial speed.',
  'Range-Doppler coupling, range migration, clutter, antenna pattern, and hardware phase noise are ignored. Hann windows are applied before both FFTs.',
  'The carrier frequency is an example number for the simulation. It is not a statement that any frequency or power is permitted anywhere.',
]

export const caveats = [
  'Use only a compliant, approved, low-power radar module chosen and supervised by your teacher. This project involves no weapons, no ranging of people or vehicles outside an approved test, and no transmitter built from scratch.',
  'The synthetic-aperture figure uses the standard stripmap approximation cross-range resolution ≈ λR/(2L). Real imaging needs motion compensation that is not modelled here.',
]

function hann(n, len) {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (len - 1))
}

function parabolic(y0, y1, y2) {
  const d = y0 - 2 * y1 + y2
  return d === 0 ? 0 : (0.5 * (y0 - y2)) / d
}

export function run(input) {
  const p = normaliseParams(params, input)
  const f0 = p.carrierGHz * 1e9
  const B = p.bandwidthMHz * 1e6
  const T = p.chirpUs * 1e-6
  const lambda = C / f0
  const fs = N / T
  const fb = (2 * B * p.rangeM) / (C * T)
  const fd = (2 * p.velocityMs * f0) / C
  const rangeRes = C / (2 * B)
  const rangeMax = (fs * C * T) / (4 * B)
  const velMax = lambda / (4 * T)
  const velRes = lambda / (2 * M * T)

  const rand = mulberry32(4242)
  const sigma = Math.sqrt(10 ** (-p.snrDb / 10) / 2)
  const re = Array.from({ length: M }, () => new Float64Array(N))
  const im = Array.from({ length: M }, () => new Float64Array(N))
  for (let m = 0; m < M; m++) {
    for (let n = 0; n < N; n++) {
      const phase = 2 * Math.PI * (fb * (n / fs) + fd * m * T)
      const w = hann(n, N) * hann(m, M)
      re[m][n] = w * (Math.cos(phase) + sigma * gaussian(rand))
      im[m][n] = w * (Math.sin(phase) + sigma * gaussian(rand))
    }
    fft(re[m], im[m])
  }
  const mag = Array.from({ length: M }, () => new Float64Array(N))
  const colRe = new Float64Array(M)
  const colIm = new Float64Array(M)
  const power = Array.from({ length: M }, () => new Float64Array(N / 2))
  for (let n = 0; n < N; n++) {
    for (let m = 0; m < M; m++) {
      colRe[m] = re[m][n]
      colIm[m] = im[m][n]
    }
    fft(colRe, colIm)
    for (let m = 0; m < M; m++) {
      mag[m][n] = Math.hypot(colRe[m], colIm[m])
      if (n < N / 2) power[m][n] = mag[m][n]
    }
  }
  // Doppler axis is fftshifted: index k maps to bin (k - M/2).
  let peak = 0
  let pm = 0
  let pn = 0
  for (let m = 0; m < M; m++) {
    for (let n = 1; n < N / 2 - 1; n++) {
      if (mag[m][n] > peak) {
        peak = mag[m][n]
        pm = m
        pn = n
      }
    }
  }
  const dn = parabolic(mag[pm][pn - 1], mag[pm][pn], mag[pm][pn + 1])
  const mm0 = mag[(pm + M - 1) % M][pn]
  const mm2 = mag[(pm + 1) % M][pn]
  const dm = parabolic(mm0, mag[pm][pn], mm2)
  const binRange = pn + dn
  const estFb = (binRange * fs) / N
  const estRange = (estFb * C * T) / (2 * B)
  const dopBin = (pm >= M / 2 ? pm - M : pm) + dm
  const estFd = dopBin / (M * T)
  const estVel = (estFd * C) / (2 * f0)
  const aliased = Math.abs(p.velocityMs) > velMax
  const crossRange = (lambda * p.rangeM) / (2 * p.apertureM)

  const rangeAxis = []
  const rangeDb = []
  for (let n = 1; n < N / 2; n++) {
    rangeAxis.push((((n * fs) / N) * C * T) / (2 * B))
    rangeDb.push(20 * Math.log10((mag[pm][n] + 1e-12) / peak))
  }
  const velAxis = []
  const velDb = []
  for (let k = 0; k < M; k++) {
    const m = (k + M / 2) % M
    velAxis.push((((k - M / 2) / (M * T)) * C) / (2 * f0))
    velDb.push(20 * Math.log10((mag[m][pn] + 1e-12) / peak))
  }

  return {
    params: p,
    outputs: [
      out('lambdaMm', 'Wavelength λ', lambda * 1000, 'mm'),
      out('rangeResM', 'Range resolution c/2B', rangeRes, 'm'),
      out('rangeMaxM', 'Maximum range before beat aliasing', rangeMax, 'm'),
      out('velResMs', 'Speed resolution λ/(2MT)', velRes, 'm/s'),
      out('velMaxMs', 'Maximum unambiguous speed λ/4T', velMax, 'm/s'),
      out('beatKHz', 'Beat frequency', fb / 1000, 'kHz'),
      out('dopplerHz', 'Doppler shift', fd, 'Hz'),
      out('estRangeM', 'Estimated range', estRange, 'm'),
      out('estVelMs', 'Estimated radial speed', estVel, 'm/s'),
      out('rangeErrM', 'Range error', estRange - p.rangeM, 'm'),
      out('velErrMs', 'Speed error', estVel - p.velocityMs, 'm/s'),
      out('crossRangeM', 'SAR cross-range resolution ≈ λR/2L', crossRange, 'm'),
    ],
    series: [
      chart('range', 'Range profile at the strongest Doppler bin', 'range (m)', 'level (dB re peak)', [trace('range profile', rangeAxis, rangeDb)]),
      chart('doppler', 'Doppler spectrum at the strongest range bin', 'radial speed (m/s)', 'level (dB re peak)', [trace('Doppler spectrum', velAxis, velDb)]),
    ],
    warnings: [
      ...(aliased ? [`The true speed exceeds the unambiguous limit ±${velMax.toFixed(2)} m/s, so the estimate wraps to a false value.`] : []),
      ...(p.rangeM > rangeMax ? ['The target is beyond the maximum range for these sampling settings, so its beat frequency aliases.'] : []),
    ],
  }
}

export function toRow(p, result) {
  const o = Object.fromEntries(result.outputs.map(x => [x.id, x.value]))
  return {
    bandwidthMHz: p.bandwidthMHz,
    chirpUs: p.chirpUs,
    snrDb: p.snrDb,
    rangeM: p.rangeM,
    velocityMs: p.velocityMs,
    estRangeM: o.estRangeM,
    estVelMs: o.estVelMs,
  }
}
