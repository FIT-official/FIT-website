import { describe, expect, it } from 'vitest'
import { samplingModel, signalValue, signedAlias, inspectionModel, inspectionSample, feedbackModel, heatStep, createHeatGrid, heatMetrics } from '../public/simulations/models'
import { activities, filterActivities } from '../public/simulations/catalog'

describe('Signal sampling: limiting cases and signed phase', () => {
  it.each([0, .3, Math.PI / 2, Math.PI])('matches every 7 Hz sample with a signed −3 Hz alias at phase %s', phase => {
    const result = samplingModel({ frequency: 7, sampleRate: 10, phase })
    expect(result.alias).toBe(-3)
    expect(result.residual).toBeLessThan(1e-10)
  })
  it('resolves a source below the strict Nyquist edge', () => {
    expect(signedAlias(7, 15)).toBe(7)
    expect(samplingModel({ frequency: 7, sampleRate: 15 }).resolvable).toBe(true)
  })
  it('flags equality and phase-degenerate zero samples', () => {
    const result = samplingModel({ frequency: 5, sampleRate: 10 })
    expect(result.resolvable).toBe(false)
    expect(Math.max(...result.samples.map(p => Math.abs(p.y)))).toBeLessThan(1e-10)
  })
  it('preserves a constant source and zero amplitude', () => {
    expect(samplingModel({ frequency: 0, phase: Math.PI / 2 }).samples.every(p => Math.abs(p.y - 1) < 1e-12)).toBe(true)
    expect(samplingModel({ amplitude: 0 }).samples.every(p => p.y === 0)).toBe(true)
    expect(signalValue(1, 7, 0, 0)).toBe(0)
  })
  it('counts both endpoints and meets the 40-measurement budget at 19 Hz', () => {
    const result = samplingModel({ frequency: 9, sampleRate: 19, duration: 2 })
    expect(result.samples).toHaveLength(39)
    expect(result.resolvable).toBe(true)
  })
})

describe('Inspection evidence: Bayes and reproducibility', () => {
  it('matches the 1%-prevalence reference exactly', () => {
    const result = inspectionModel()
    expect(result.tp).toBe(95); expect(result.fp).toBe(495)
    expect(result.fn).toBe(5); expect(result.tn).toBe(9405)
    expect(result.posterior).toBeCloseTo(95 / 590, 12)
  })
  it.each([0, .001, .5, 1])('conserves the population at prevalence %s', prevalence => {
    const result = inspectionModel({ prevalence, sensitivity: .743, specificity: .851, population: 1000 })
    expect(result.tp + result.fp + result.fn + result.tn).toBeCloseTo(1000, 10)
  })
  it('leaves prevalence unchanged for an uninformative flag', () => {
    expect(inspectionModel({ prevalence: .12, sensitivity: .3, specificity: .7 }).posterior).toBeCloseTo(.12, 12)
  })
  it('handles pure false alarms, perfect specificity, and undefined denominators', () => {
    expect(inspectionModel({ prevalence: 0 }).posterior).toBe(0)
    expect(inspectionModel({ specificity: 1 }).posterior).toBe(1)
    expect(inspectionModel({ prevalence: 0, specificity: 1 }).posterior).toBeNull()
    expect(inspectionModel({ prevalence: 1, sensitivity: 1 }).negativePosterior).toBeNull()
  })
  it('keeps fractional expected counts and integer sampled counts distinct', () => {
    expect(inspectionModel({ population: 100, prevalence: .013 }).tp % 1).not.toBe(0)
    const result = inspectionSample({ seed: 42 })
    expect([result.tp, result.fp, result.fn, result.tn].every(Number.isInteger)).toBe(true)
    expect(result.tp + result.fp + result.fn + result.tn).toBe(10000)
  })
  it('repeats a seed and varies independent seeds', () => {
    expect(inspectionSample({ seed: 123 })).toEqual(inspectionSample({ seed: 123 }))
    expect(inspectionSample({ seed: 123 })).not.toEqual(inspectionSample({ seed: 124 }))
  })
})

describe('Thermal feedback: analytic limits, reachability and energy', () => {
  it('matches the constant-duty exponential solution within 0.01 K', () => {
    const result = feedbackModel({ mode: 'Manual', manual: .5, duration: 100 })
    const exact = 20 + 30 * (1 - Math.exp(-4 * 100 / 200))
    expect(Math.abs(result.final - exact)).toBeLessThan(.01)
  })
  it('matches unsaturated P-only steady error', () => {
    const result = feedbackModel({ mode: 'P', duration: 1000 })
    const expectedError = 4 * (60 - 20) / (4 + 240 * .06)
    expect(60 - result.final).toBeCloseTo(expectedError, 6)
  })
  it('approaches a feasible target with PI', () => {
    expect(Math.abs(feedbackModel().final - 60)).toBeLessThan(.02)
  })
  it('reports an unreachable target without exceeding heater duty', () => {
    const result = feedbackModel({ target: 90, loss: 8, delay: 30 })
    expect(result.equilibriumLimit).toBe(50)
    expect(result.final).toBeLessThanOrEqual(50)
    expect(result.points.every(p => p.power >= 0 && p.power <= 240)).toBe(true)
  })
  it('heats linearly with zero loss and cools with no heater', () => {
    expect(feedbackModel({ mode: 'Manual', manual: .5, loss: 0, duration: 100 }).final).toBeCloseTo(80, 8)
    const result = feedbackModel({ mode: 'Manual', manual: 0, initial: 60, duration: 100 })
    expect(Math.abs(result.final - (20 + 40 * Math.exp(-2)))).toBeLessThan(.02)
  })
  it.each(['P', 'PI', 'Manual'])('conserves input = stored energy + losses in %s mode', mode => {
    const result = feedbackModel({ mode, delay: 25, disturbance: true })
    expect(Math.abs(result.energy - result.lossEnergy - result.storedEnergy)).toBeLessThan(1e-7)
  })
  it('converges as the timestep is halved', () => {
    const settings = { mode: 'Manual', manual: .5, duration: 100 }
    const exact = 20 + 30 * (1 - Math.exp(-2))
    const coarse = Math.abs(feedbackModel({ ...settings, dt: .2 }).final - exact)
    const fine = Math.abs(feedbackModel({ ...settings, dt: .1 }).final - exact)
    expect(fine / coarse).toBeLessThan(.51)
  })
  it('uses delay history and reproduces reset settings', () => {
    expect(feedbackModel({ delay: 20 }).overshoot).toBeGreaterThan(feedbackModel().overshoot)
    expect(feedbackModel()).toEqual(feedbackModel())
  })
})

describe('Spatial heat: symmetric fluxes and stable bounds', () => {
  const integrate = (grid, steps, options) => { for (let i = 0; i < steps; i++) grid = heatStep(grid, options); return grid }
  it('leaves a uniform isolated plate unchanged across heterogeneous materials', () => {
    const grid = createHeatGrid().map((c, i) => ({ temperature: 45, material: i % 3 ? .2 : 1 }))
    expect(heatStep(grid, { fixedEdges: false })).toEqual(grid)
  })
  it('exchanges equal and opposite energy for one connected pair', () => {
    const grid = createHeatGrid().map(() => ({ temperature: 20, material: 0 }))
    grid[80] = { temperature: 100, material: 1 }; grid[81] = { temperature: 20, material: .2 }
    const next = heatStep(grid, { fixedEdges: false })
    expect(next[80].temperature + next[81].temperature).toBeCloseTo(120, 12)
    expect(100 - next[80].temperature).toBeCloseTo(next[81].temperature - 20, 12)
  })
  it('conserves all stored energy over 1500 insulated steps', () => {
    const grid = createHeatGrid().map((c, i) => ({ ...c, material: i % 3 ? .2 : 1 }))
    const next = integrate(grid, 1500, { fixedEdges: false })
    expect(heatMetrics(next).mean).toBeCloseTo(heatMetrics(grid).mean, 10)
  })
  it('blocks heat at a zero-conductivity barrier', () => {
    const grid = createHeatGrid().map((c, i) => ({ ...c, material: i % 16 === 1 ? 0 : 1 }))
    const next = integrate(grid, 1000, { fixedEdges: false })
    expect(next.filter((c, i) => i % 16 > 1).every(c => c.temperature === 20)).toBe(true)
  })
  it('keeps temperatures within source/boundary extremes', () => {
    const next = integrate(createHeatGrid(), 1500, { fixedEdges: true })
    expect(next.every(c => c.temperature >= 20 && c.temperature <= 100)).toBe(true)
  })
  it('approaches the uniform plate linear steady solution', () => {
    const next = integrate(createHeatGrid(), 6000, { fixedEdges: true })
    expect(next[6 * 16 + 8].temperature).toBeCloseTo(100 - 80 * 8 / 15, 2)
  })
  it('converges under timestep refinement at a fixed elapsed time', () => {
    const coarse = integrate(createHeatGrid(), 100, { dt: .2, fixedEdges: true })
    const fine = integrate(createHeatGrid(), 200, { dt: .1, fixedEdges: true })
    const ref = integrate(createHeatGrid(), 400, { dt: .05, fixedEdges: true })
    const error = grid => grid.reduce((s, c, i) => s + Math.abs(c.temperature - ref[i].temperature), 0)
    expect(error(fine)).toBeLessThan(error(coarse) * .4)
  })
  it('rejects a timestep or conductance outside stable bounds', () => {
    expect(() => heatStep(createHeatGrid(), { dt: .3 })).toThrow(RangeError)
    const grid = createHeatGrid(); grid[2].material = 2
    expect(() => heatStep(grid)).toThrow(RangeError)
  })
})

describe('Library search', () => {
  it('finds topics using all words, ignores whitespace and applies intersecting filters', () => {
    expect(filterActivities({ query: '  SENSOR  waves  ' }).filter(a => a.kind !== 'family').map(a => a.id)).toEqual(['sampling'])
    expect(filterActivities({ subject: 'Physics', level: 'Advanced' }).filter(a => a.kind !== 'family').map(a => a.id)).toEqual(['feedback'])
    expect(filterActivities({ query: 'no such topic' })).toEqual([])
    expect(filterActivities()).toEqual(activities)
  })
})
