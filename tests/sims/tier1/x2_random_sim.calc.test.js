// Tier-1 X2 (stochastic / random simulation): calc module KATs.
// Cases and expected values: kat_cases/tier1/stochastic_sim.json (FIT Stock Strategy, 30 cases, version 2026-10-17),
// each re-confirmed by an independent oracle (vetting/fit-social/kat/x2/oracle_x2.py: numpy eigen /
// matrix powers, truncated birth-death sums, exact random-walk convolution, absorbing-chain solve).
// Adapter = renames only (KAT lambda/mu/c -> lambda_per_h/mu_per_h/servers, W -> W_h, Wq -> Wq_h, P_wait -> Pwait,
// mean/var -> theoryMean/theoryVariance, mean_count/var_count -> mean/variance); never arithmetic on outputs.
// Every expected key is required (FIT Site ruling 20:09); extra keys (e.g. stable: true, W_h alongside W) are allowed. Tolerance per the KAT file: rel 1e-6, abs 1e-9 when expected is 0.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import X2 from '../../../lib/sims/tier1/x2_random_sim.calc.js'

const REL = 1e-6
const ABS0 = 1e-9
const near = (got, want) => {
  if (Array.isArray(want)) { expect(got).toHaveLength(want.length); want.forEach((w, i) => near(got[i], w)); return }
  expect(Number.isFinite(got)).toBe(true)
  if (want === 0) expect(Math.abs(got)).toBeLessThanOrEqual(ABS0)
  else expect(Math.abs(got - want)).toBeLessThanOrEqual(REL * Math.abs(want))
}
const schemaError = (got, want) => expect(got).toEqual(want)

// Reference mulberry32 written from the published C (Ettinger 2017) with BigInt, so it shares
// no arithmetic tricks (Math.imul, >>> 0) with the module.
function referenceMulberry32(seed) {
  const M = 0xFFFFFFFFn
  let x = BigInt(seed) & M
  return () => {
    x = (x + 0x6D2B79F5n) & M
    let z = x
    z = ((z ^ (z >> 15n)) * (z | 1n)) & M
    z = (z ^ ((z + ((z ^ (z >> 7n)) * (z | 61n))) & M)) & M
    return Number((z ^ (z >> 14n)) & M) / 4294967296
  }
}

describe('X2 seeded generator (mulberry32)', () => {
  // First five draws from an independent Python implementation (oracle_x2.py).
  const PY = {
    1: [0.6270739405881613, 0.002735721180215478, 0.5274470399599522, 0.9810509674716741, 0.9683778982143849],
    0: [0.26642920868471265, 0.0003297457005828619, 0.2232720274478197, 0.1462021479383111, 0.46732782293111086],
    42: [0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693, 0.17481389874592423],
    4294967295: [0.8964226141106337, 0.189478256739676, 0.7156526781618595, 0.9440599093213677, 0.8452364315744489],
  }
  it.each(Object.entries(PY))('seed %s gives the exact reference sequence', (seed, want) => {
    const r = X2.createRng(Number(seed))
    expect(want.map(() => r())).toEqual(want)
  })
  it('matches the reference for 2000 draws on several seeds, all in [0,1)', () => {
    for (const seed of [0, 1, 2, 42, 123456789, 2 ** 31, 4294967295]) {
      const a = X2.createRng(seed), b = referenceMulberry32(seed)
      for (let i = 0; i < 2000; i++) { const u = a(); expect(u).toBe(b()); expect(u >= 0 && u < 1).toBe(true) }
    }
  })
  it('is reproducible: same seed, same Monte Carlo run', () => {
    expect(X2.monteCarloPi({ seed: 7, n: 500 })).toEqual(X2.monteCarloPi({ seed: 7, n: 500 }))
  })
})

const mm1 = i => { const r = X2.mm1({ lambda_per_h: i.lambda, mu_per_h: i.mu }); return r.error ? r : { ...r, W: r.W_h, Wq: r.Wq_h } }
const mmc = i => { const r = X2.mmc({ lambda_per_h: i.lambda, mu_per_h: i.mu, servers: i.c }); return r.error ? r : { ...r, W: r.W_h, Wq: r.Wq_h, P_wait: r.Pwait } }
const pois = i => { const r = X2.poissonPmf({ k: i.k, mean: i.lambda * i.t }); return r.error ? r : { ...r, P_k: r.p } }
const walk = i => { const r = X2.randomWalk1D({ seed: 1, n: i.n, p: i.p, step: i.step, walkers: 1 }); return r.error ? r : { ...r, mean: r.theoryMean, var: r.theoryVariance } }
const bm = i => { const r = X2.brownian2D({ seed: 1, D_m2_s: i.D, dt_s: i.t, steps: 1, particles: 1 }); return r.error ? r : { ...r, msd: r.theoryMsd[1], rms: r.theoryRms[1] } }
const wf = i => {
  const r = X2.wrightFisherMoments({ N: i.N, p: i.p, t: i.t }); if (r.error) return r
  return { ...r, mean_count: r.mean, var_count: r.variance, fixation_prob: X2.fixationProbability({ N: i.N, s: 0, p: i.p }).u }
}
const check = (got, want) => {
  for (const [k, w] of Object.entries(want)) {
    expect(got).toHaveProperty(k)
    if (w === null || typeof w === 'boolean') expect(got[k]).toBe(w); else near(got[k], w)
  }
}

describe('stochastic_sim KATs: Markov chains', () => {
  it('mc-2state-must', () => near(X2.markovStationary({ P: [[0.9, 0.1], [0.2, 0.8]] }).pi, [0.6666667, 0.3333333]))
  it('mc-3state', () => near(X2.markovStationary({ P: [[0.5, 0.3, 0.2], [0.2, 0.6, 0.2], [0.1, 0.2, 0.7]] }).pi, [0.2285714, 0.3714286, 0.4]))
  it('mc-periodic', () => near(X2.markovStationary({ P: [[0, 1], [1, 0]] }).pi, [0.5, 0.5]))
  it('mc-reducible', () => schemaError(X2.markovStationary({ P: [[1, 0], [0, 1]] }), { error: 'MathError', reason: 'stationary_distribution_not_unique' }))
  it('mc-badrow', () => schemaError(X2.markovStationary({ P: [[0.9, 0.2], [0.2, 0.8]] }), { error: 'ConstraintViolation', reason: 'rows_must_sum_to_1' }))
  it('mc-nstep', () => near(X2.markovDistribution({ P: [[0.9, 0.1], [0.2, 0.8]], dist0: [1, 0], steps: 3 }).dists[3], [0.781, 0.219]))
  it('mc-nstep-0', () => near(X2.markovDistribution({ P: [[0.9, 0.1], [0.2, 0.8]], dist0: [0.25, 0.75], steps: 0 }).dists[0], [0.25, 0.75]))
})

describe('stochastic_sim KATs: queues', () => {
  it('mm1-must', () => check(mm1({ lambda: 2, mu: 3 }), { rho: 0.6666667, L: 2.0, Lq: 1.333333, W: 1.0, Wq: 0.6666667, P0: 0.3333333 }))
  it('mm1-idle', () => check(mm1({ lambda: 0, mu: 3 }), { rho: 0.0, L: 0.0, Lq: 0.0, W: 0.3333333, Wq: 0.0, P0: 1.0 }))
  it('mm1-unstable: regime result', () => check(mm1({ lambda: 3, mu: 3 }), { stable: false, rho: 1.0, L: null, Lq: null, W: null, Wq: null }))
  it('mmc-2', () => check(mmc({ lambda: 2, mu: 3, c: 2 }), { rho: 0.3333333, P_wait: 0.1666667, Lq: 0.08333333, Wq: 0.04166667, W: 0.375, L: 0.75 }))
  it('mmc-1-equals-mm1', () => check(mmc({ lambda: 2, mu: 3, c: 1 }), { rho: 0.6666667, P_wait: 0.6666667, Lq: 1.333333, Wq: 0.6666667, W: 1.0, L: 2.0 }))
  it('mmc-unstable: regime result', () => check(mmc({ lambda: 6, mu: 3, c: 2 }), { stable: false, rho: 1.0, P_wait: null, Lq: null, Wq: null, W: null, L: null }))
  it('mmc-4', () => schemaError(X2.mmc({ lambda_per_h: 2, mu_per_h: 3, servers: 4 }), { error: 'ConstraintViolation', reason: 'servers_out_of_range_1_3' }))
  it('md1', () => check(X2.md1({ lambda: 2, mu: 3 }), { rho: 0.6666667, Lq: 0.6666667, Wq: 0.3333333, W: 0.6666667, L: 1.333333 }))
  it('unstable results are never Infinity', () => {
    for (const r of [X2.mm1({ lambda_per_h: 5, mu_per_h: 3 }), X2.mmc({ lambda_per_h: 9, mu_per_h: 3, servers: 3 }), X2.md1({ lambda: 3, mu: 3 })])
      expect(Object.values(r).some(v => v === Infinity || Number.isNaN(v))).toBe(false)
  })
})

describe('stochastic_sim KATs: Poisson, walks, Brownian motion', () => {
  it('pois-0', () => check(pois({ lambda: 2, t: 1, k: 0 }), { P_k: 0.1353353, mean: 2, var: 2, P_at_least_1: 0.8646647 }))
  it('pois-3', () => check(pois({ lambda: 2, t: 1, k: 3 }), { P_k: 0.180447, mean: 2, var: 2, P_at_least_1: 0.8646647 }))
  it('pois-t0', () => check(pois({ lambda: 2, t: 0, k: 0 }), { P_k: 1.0, mean: 0, var: 0, P_at_least_1: 0.0 }))
  it('rw-sym', () => check(walk({ n: 100, p: 0.5, step: 1 }), { mean: 0.0, var: 100.0, rms: 10.0, P_at_origin: 0.07958924 }))
  it('rw-biased', () => check(walk({ n: 10, p: 0.6, step: 2 }), { mean: 4.0, var: 38.4, rms: 7.375636, P_at_origin: 0.2006581 }))
  it('rw-0', () => { check(walk({ n: 0, p: 0.5, step: 1 }), { mean: 0.0, var: 0.0, rms: 0.0, P_at_origin: 1.0 }); expect(walk({ n: 0, p: 0.5, step: 1 }).finals).toEqual([0]) })
  it('bm-2d', () => check(bm({ D: 1e-12, t: 10 }), { msd: 4e-11, rms: 6.324555e-06 }))
})

describe('stochastic_sim KATs: Wright-Fisher and fixation', () => {
  it('wf-must', () => check(wf({ N: 50, p: 0.3, t: 10 }), { mean_count: 30.0, var_count: 21.0, fixation_prob: 0.3, H_t: 0.3798405 }))
  it('wf-lost', () => {
    check(wf({ N: 50, p: 0, t: 10 }), { mean_count: 0, var_count: 0, fixation_prob: 0, H_t: 0.0 })
    expect(X2.wrightFisher({ seed: 3, N: 50, p0: 0, generations: 10 }).p.every(x => x === 0)).toBe(true)
  })
  it('wf-badp', () => schemaError(X2.wrightFisherMoments({ N: 50, p: 1.2 }), { error: 'ConstraintViolation', reason: 'p_out_of_range_0_1' }))
  it('kimura', () => check(X2.fixationProbability({ N: 50, s: 0.01, p: 0.01 }), { u: 0.02290058 }))
  it('kimura-neutral', () => check(X2.fixationProbability({ N: 50, s: 0, p: 0.2 }), { u: 0.2 }))
})

describe('stochastic_sim KATs: Monte Carlo pi bands (seeded estimate inside the KAT band)', () => {
  const band = (n, lo, hi) => { for (let seed = 0; seed < 50; seed++) { const e = X2.monteCarloPi({ seed, n }).estimate; expect(e).toBeGreaterThanOrEqual(lo); expect(e).toBeLessThanOrEqual(hi) } }
  it('band constants match pi +/- 4 se', () => {
    const se = n => 4 * Math.sqrt((Math.PI / 4) * (1 - Math.PI / 4) / n)
    near(se(10000), 0.01642183); near(Math.PI - 4 * se(10000), 3.075905); near(Math.PI + 4 * se(10000), 3.20728)
    near(se(100), 0.1642183); near(Math.PI - 4 * se(100), 2.484719); near(Math.PI + 4 * se(100), 3.798466)
  })
  it('mc-pi-band: n = 10000, seeds 0-49', () => band(10000, 3.075905, 3.20728))
  it('mc-pi-band-small: n = 100, seeds 0-49', () => band(100, 2.484719, 3.798466))
  it('mc-too-many', () => schemaError(X2.monteCarloPi({ seed: 1, n: 20000 }), { error: 'ConstraintViolation', reason: 'draws_out_of_range_1_10000' }))
})

describe('error style (17:46 ruling) on paths the KATs do not cover', () => {
  it('mid-run draw cap is RuntimeError/draw_cap_reached', () => {
    expect(X2.poissonArrivals({ seed: 1, rate_per_min: 1e6, window_min: 1 })).toEqual({ error: 'RuntimeError', reason: 'draw_cap_reached' })
  })
})

// The same 30 cases against the FIT-CALC block inlined in each game (must be byte-identical to lib).
const BLOCK = /\/\* FIT-CALC-BEGIN x2_random_sim \*\/[\s\S]*?\/\* FIT-CALC-END x2_random_sim \*\//
describe('X2 inlined copies', () => {
  const lib = readFileSync('lib/sims/tier1/x2_random_sim.calc.js', 'utf8').match(BLOCK)[0]
  it.each(['x2-random-sim-poly', 'x2-random-sim-u1', 'x2-random-sim-u2'])('%s inlined block is byte-identical to lib', game =>
    expect(readFileSync(`content/sims/html/${game}.html`, 'utf8').match(BLOCK)[0]).toBe(lib))
})
