// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { SIMULATIONS, runSimulation, defaultParams, fitPathLoss, fspl, formatValue } from '@/lib/researchProjects/sim'
import { liftingLine } from '@/lib/researchProjects/sim/prandtl'
import { overlap2D } from '@/lib/researchProjects/sim/fpm'
import { fft } from '@/lib/researchProjects/sim/fft'

const out = (result, id) => result.outputs.find(o => o.id === id).value

describe('shared numerics', () => {
  it('FFT round-trips and finds a tone in the right bin', () => {
    const n = 64
    const re = Float64Array.from({ length: n }, (_, i) => Math.cos((2 * Math.PI * 5 * i) / n))
    const im = new Float64Array(n)
    const original = Float64Array.from(re)
    fft(re, im)
    expect(Math.hypot(re[5], im[5])).toBeCloseTo(n / 2, 6)
    fft(re, im, true)
    original.forEach((v, i) => expect(re[i]).toBeCloseTo(v, 9))
    expect(() => fft(new Float64Array(6), new Float64Array(6))).toThrow(/power of two/)
  })

  it('formats values without NaN text', () => {
    expect(formatValue(null)).toBe('n/a')
    expect(formatValue(NaN)).toBe('n/a')
    expect(formatValue(0.123456, 3)).toBe('0.123')
    expect(formatValue(123456789, 3)).toBe('1.23e+8')
  })
})

describe('every simulation', () => {
  for (const [id, sim] of Object.entries(SIMULATIONS)) {
    it(id + ': declares units, limits, assumptions and runs at defaults with finite outputs', () => {
      expect(sim.params.length).toBeGreaterThan(3)
      for (const p of sim.params) {
        expect(p.label).toBeTruthy()
        expect(p.min).toBeLessThan(p.max)
        expect(p.default).toBeGreaterThanOrEqual(p.min)
        expect(p.default).toBeLessThanOrEqual(p.max)
        expect(typeof p.unit).toBe('string')
      }
      expect(sim.assumptions.length).toBeGreaterThan(2)
      expect(sim.caveats.length).toBeGreaterThan(1)
      const result = runSimulation(id, {})
      expect(result.outputs.length).toBeGreaterThan(5)
      for (const o of result.outputs) expect(o.value === null || Number.isFinite(o.value)).toBe(true)
      expect(result.series.length).toBeGreaterThan(0)
      for (const chart of result.series) for (const t of chart.traces) {
        expect(t.x.length).toBe(t.y.length)
        expect(t.y.every(Number.isFinite)).toBe(true)
      }
      for (const v of Object.values(result.row)) expect(v === null || Number.isFinite(v)).toBe(true)
    })

    it(id + ': is deterministic, and clamps hostile or missing parameters instead of throwing', () => {
      expect(JSON.stringify(runSimulation(id, {}))).toBe(JSON.stringify(runSimulation(id, {})))
      const hostile = Object.fromEntries(sim.params.map(p => [p.id, 1e30]))
      const low = Object.fromEntries(sim.params.map(p => [p.id, -1e30]))
      const junk = Object.fromEntries(sim.params.map(p => [p.id, 'abc']))
      for (const input of [hostile, low, junk, null, undefined]) {
        const r = runSimulation(id, input ?? {})
        for (const p of sim.params) {
          expect(r.params[p.id]).toBeGreaterThanOrEqual(p.min)
          expect(r.params[p.id]).toBeLessThanOrEqual(p.max)
        }
      }
      expect(defaultParams(id)).toEqual(runSimulation(id, {}).params)
    })
  }
  it('rejects an unknown simulation id', () => {
    expect(() => runSimulation('nope', {})).toThrow(/Unknown/)
  })
})

describe('holography model', () => {
  it('matches the hand calculation for NA limits (sampling versus aperture)', () => {
    const r = runSimulation('holobox', { wavelengthNm: 635, pixelUm: 1.12, binning: 1, distanceMm: 10 })
    expect(out(r, 'naNyquist')).toBeCloseTo(0.635 / (2 * 1.12), 4)
    const W = (1024 * 1.12) / 2
    expect(out(r, 'naGeometric')).toBeCloseTo(W / Math.hypot(10000, W), 4)
    expect(out(r, 'minPeriodUm')).toBeCloseTo(0.635 / out(r, 'naEffective'), 6)
    expect(r.limiting).toBe('window size (aperture)')
  })
  it('recovers a 60 um strip to within two pixels when unbinned, and flags the sampling limit when binned heavily', () => {
    const base = runSimulation('holobox', { distanceMm: 10, objectUm: 60 })
    expect(Math.abs(out(base, 'widthErrorUm'))).toBeLessThan(2.5)
    const binned = runSimulation('holobox', { distanceMm: 10, binning: 8 })
    expect(binned.limiting).toBe('pixel sampling')
    expect(out(binned, 'naEffective')).toBeLessThan(out(base, 'naEffective'))
    expect(binned.warnings.join(' ')).toMatch(/sampling/i)
  })
  it('shrinks the geometric aperture as distance grows', () => {
    const near = out(runSimulation('holobox', { distanceMm: 5 }), 'naGeometric')
    const far = out(runSimulation('holobox', { distanceMm: 40 }), 'naGeometric')
    expect(far).toBeLessThan(near / 4)
  })
})

describe('levitator model', () => {
  it('uses the speed-of-sound formula and finds a central node for a 180 degree cap offset', () => {
    const r = runSimulation('tinylev', { phaseErrorDeg: 0, posErrorMm: 0 })
    expect(out(r, 'soundSpeed')).toBeCloseTo(331.3 + 0.606 * 20, 6)
    expect(out(r, 'wavelengthMm')).toBeCloseTo((343.42 / 40000) * 1000, 4)
    expect(Math.abs(out(r, 'nodePositionMm'))).toBeLessThan(0.1)
    expect(out(r, 'nodeSpacingMm')).toBeGreaterThan(out(r, 'wavelengthMm') / 2)
    expect(out(r, 'stiffnessRatio')).toBeCloseTo(1, 6)
    expect(out(r, 'nodeShiftMm')).toBe(0)
  })
  it('weakens the node as phase error grows', () => {
    const low = out(runSimulation('tinylev', { phaseErrorDeg: 10 }), 'stiffnessRatio')
    const high = out(runSimulation('tinylev', { phaseErrorDeg: 50 }), 'stiffnessRatio')
    expect(high).toBeLessThan(low)
    expect(out(runSimulation('tinylev', { phaseErrorDeg: 50 }), 'nodeShiftMm')).toBeGreaterThan(out(runSimulation('tinylev', { phaseErrorDeg: 5 }), 'nodeShiftMm'))
  })
})

describe('localisation model', () => {
  it('is exact with no errors and no corrections', () => {
    const r = runSimulation('racecar', { wheelScaleErrPct: 0, slipEventsPerMin: 0, gyroBiasDegS: 0, gain: 0 })
    expect(out(r, 'rmseOdomM')).toBeLessThan(1e-4)
  })
  it('gives odometry error that grows with scale error and a fused error below it', () => {
    const r = runSimulation('racecar', {})
    expect(out(r, 'rmseFusedM')).toBeLessThan(out(r, 'rmseOdomM'))
    expect(out(r, 'improvement')).toBeGreaterThan(1.3)
  })
  it('loses the advantage as fixes disappear', () => {
    const good = out(runSimulation('racecar', { dropoutPct: 0, outageS: 0 }), 'rmseFusedM')
    const bad = out(runSimulation('racecar', { dropoutPct: 90, outageS: 30 }), 'rmseFusedM')
    expect(bad).toBeGreaterThan(good * 3)
    expect(out(runSimulation('racecar', { gain: 0 }), 'improvement')).toBeCloseTo(1, 6)
  })
})

describe('radar model', () => {
  it('matches the textbook resolution and ambiguity formulas', () => {
    const r = runSimulation('radar', { carrierGHz: 24, bandwidthMHz: 500, chirpUs: 200 })
    expect(out(r, 'rangeResM')).toBeCloseTo(299792458 / (2 * 500e6), 6)
    const lambda = 299792458 / 24e9
    expect(out(r, 'velMaxMs')).toBeCloseTo(lambda / (4 * 200e-6), 6)
    expect(out(r, 'velResMs')).toBeCloseTo(lambda / (2 * 64 * 200e-6), 6)
  })
  it('recovers a known target within a fraction of a range bin and speed bin', () => {
    const r = runSimulation('radar', { rangeM: 12.3, velocityMs: 2.5, snrDb: 15 })
    expect(Math.abs(out(r, 'rangeErrM'))).toBeLessThan(0.1)
    expect(Math.abs(out(r, 'velErrMs'))).toBeLessThan(0.1)
  })
  it('aliases a speed above the unambiguous limit and says so', () => {
    const r = runSimulation('radar', { velocityMs: 18 })
    expect(Math.abs(out(r, 'velErrMs'))).toBeGreaterThan(10)
    expect(r.warnings.join(' ')).toMatch(/unambiguous/)
  })
})

describe('glider model', () => {
  const d2r = Math.PI / 180
  const wing = (o = {}) => liftingLine({ span: 1.2, rootChord: 0.2, taper: 1, twistRad: 0, alphaRootRad: 5 * d2r, alphaL0Rad: 0, a0: 2 * Math.PI, ...o })
  it('gives span efficiency at most 1 and about 0.95 for an untwisted rectangular wing of aspect ratio 6', () => {
    const w = wing()
    expect(w.AR).toBeCloseTo(6, 9)
    expect(w.e).toBeLessThanOrEqual(1)
    expect(w.e).toBeGreaterThan(0.93)
    expect(w.e).toBeLessThan(0.97)
  })
  it('satisfies CDi = CL^2 / (pi e AR)', () => {
    const w = wing({ twistRad: -3 * d2r })
    expect(w.CDi).toBeCloseTo((w.CL * w.CL) / (Math.PI * w.e * w.AR), 9)
  })
  it('has an efficiency near one for a tapered wing and washout lowers lift for the same root angle', () => {
    const tapered = wing({ taper: 0.45 })
    expect(tapered.e).toBeGreaterThan(0.98)
    expect(tapered.e).toBeGreaterThan(wing().e)
    expect(wing({ twistRad: -4 * d2r }).CL).toBeLessThan(wing().CL)
  })
  it('derives speed from weight and flags low Reynolds number', () => {
    const r = runSimulation('prandtl', {})
    const S = out(r, 'area')
    expect(out(r, 'veq')).toBeCloseTo(Math.sqrt((2 * 0.25 * 9.81) / (1.225 * S * out(r, 'cl'))), 6)
    expect(out(r, 'reynolds')).toBeLessThan(1e5)
    expect(r.warnings.join(' ')).toMatch(/Reynolds/)
  })
})

describe('link model', () => {
  it('matches free-space loss: 6 dB per distance doubling', () => {
    expect(fspl(1000, 433) - fspl(500, 433)).toBeCloseTo(6.0206, 3)
    expect(fspl(500, 433)).toBeCloseTo(20 * Math.log10((4 * Math.PI * 500 * 433e6) / 299792458), 9)
  })
  it('computes terminal speed from drag and weight, and pointing loss from beamwidth', () => {
    const r = runSimulation('cansat', { massG: 300, chuteDiameterCm: 60, cdChute: 0.8, pointingErrDeg: 10, beamwidthDeg: 50 })
    const A = (Math.PI * 0.6 ** 2) / 4
    expect(out(r, 'terminalSpeedMs')).toBeCloseTo(Math.sqrt((2 * 0.3 * 9.81) / (1.225 * 0.8 * A)), 6)
    expect(out(r, 'pointingLossDb')).toBeCloseTo(12 * (10 / 50) ** 2, 9)
  })
  it('fits a known path-loss exponent and rejects degenerate data', () => {
    const points = [10, 20, 40, 80, 160].map(d => ({ dM: d, rssiDbm: -40 - 10 * 2.7 * Math.log10(d) }))
    const fit = fitPathLoss(points)
    expect(fit.exponent).toBeCloseTo(2.7, 9)
    expect(fit.rssiAt1m).toBeCloseTo(-40, 9)
    expect(fit.exponentSe).toBeCloseTo(0, 9)
    expect(fitPathLoss(points.slice(0, 2))).toBeNull()
    expect(fitPathLoss([{ dM: 5, rssiDbm: -50 }, { dM: 5, rssiDbm: -51 }, { dM: 5, rssiDbm: -52 }])).toBeNull()
    expect(fitPathLoss([{ dM: -1, rssiDbm: 1 }, { dM: 0, rssiDbm: 1 }, { dM: NaN, rssiDbm: 1 }])).toBeNull()
  })
})

describe('Fourier ptychography model', () => {
  it('matches the synthetic NA and the circular-pupil overlap formula', () => {
    expect(overlap2D(0, 16)).toBe(1)
    expect(overlap2D(32, 16)).toBe(0)
    expect(overlap2D(0.6, 1)).toBeCloseTo(0.6238, 3)
    const r = runSimulation('fpm', {})
    expect(out(r, 'naSynthetic')).toBeCloseTo(0.1 + out(r, 'sinThetaMax'), 9)
    expect(out(r, 'periodSyntheticUm')).toBeCloseTo(0.53 / out(r, 'naSynthetic'), 6)
  })
  it('resolves more target zones than one bright-field image when pupils overlap', () => {
    const r = runSimulation('fpm', {})
    expect(out(r, 'zonesResolvedBf')).toBe(2)
    expect(out(r, 'zonesResolved')).toBe(4)
    expect(out(r, 'rmseReconstruction')).toBeLessThan(out(r, 'rmseBrightField') / 2)
  })
  it('fails to improve when neighbouring pupils barely overlap', () => {
    const r = runSimulation('fpm', { ledPitchMm: 12 })
    expect(out(r, 'overlap1d')).toBeLessThan(0.1)
    expect(out(r, 'zonesResolved')).toBeLessThan(4)
    expect(r.warnings.join(' ')).toMatch(/overlap/)
  })
  it('reports no synthetic aperture with a single LED', () => {
    const r = runSimulation('fpm', { ledsPerSide: 0 })
    expect(out(r, 'zonesResolved')).toBe(2)
    expect(r.warnings.join(' ')).toMatch(/no synthetic aperture/)
  })
})
