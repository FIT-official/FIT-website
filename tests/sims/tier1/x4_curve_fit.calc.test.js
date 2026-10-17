// Tier-1 X4 (estimation and curve fitting): calc module KATs.
// Cases and expected values: kat_cases/tier1/estimation_fitting.json (FIT Stock Strategy, 19 cases, version 2026-10-17),
// value cases re-confirmed by an independent oracle (vetting/fit-social/kat/x4/oracle_x4.py: scipy.stats ttest_1samp,
// ttest_ind, t.interval, chisquare; numpy lstsq; finite-difference GUM propagation).
// Every expected key is required (FIT Site ruling 20:09); extra keys are allowed. Tolerance per the KAT file:
// rel 1e-6, abs 1e-9 when expected is 0, null must be null, errors compared exactly as { error, reason }.
// The same cases also run against the FIT-CALC block inlined in each game.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import X4 from '../../../lib/sims/tier1/x4_curve_fit.calc.js'

const KAT = [
  ['t1-must', 't_test_1s', { data: [2, 4, 6, 8, 10], mu0: 5 }, { t: 0.7071068, df: 4, p_two_sided: 0.5185185, mean: 6.0, sd: 3.162278 }],
  ['t1-const', 't_test_1s', { data: [5, 5, 5], mu0: 4 }, { error: 'MathError', reason: 'zero_variance' }],
  ['t1-one', 't_test_1s', { data: [5], mu0: 4 }, { error: 'ConstraintViolation', reason: 'points_out_of_range_2_50' }],
  ['t2-pooled', 't_test_2s', { x: [20.1, 19.8, 20.4, 20.0, 19.9], y: [20.6, 20.9, 20.5, 21.0, 20.7], equal_var: true }, { t: -5.051815, df: 8, p_two_sided: 0.0009870261 }],
  ['t2-welch', 't_test_2s', { x: [20.1, 19.8, 20.4, 20.0, 19.9], y: [21.5, 19.0, 22.8, 20.2, 23.9, 18.7], equal_var: false }, { t: -1.136727, df: 5.145378, p_two_sided: 0.305805 }],
  ['ci95', 'ci_mean', { data: [2, 4, 6, 8, 10], conf: 0.95 }, { mean: 6.0, half_width: 3.926486, lo: 2.073514, hi: 9.926486 }],
  ['ci-badconf', 'ci_mean', { data: [2, 4, 6], conf: 1.0 }, { error: 'ConstraintViolation', reason: 'confidence_out_of_range' }],
  ['lin-must', 'linreg', { points: [[0, 1], [1, 3], [2, 5]] }, { a: 1.0, b: 2.0, rss: 0.0, r2: 1.0, se_b: 0.0 }],
  ['lin-noisy', 'linreg', { points: [[1, 2.1], [2, 3.9], [3, 6.2], [4, 7.8], [5, 10.1]] }, { a: 0.05, b: 1.99, rss: 0.107, r2: 0.9973053, se_b: 0.05972158 }],
  ['lin-vertical', 'linreg', { points: [[2, 1], [2, 3], [2, 5]] }, { error: 'MathError', reason: 'all_x_equal' }],
  ['lin-two', 'linreg', { points: [[0, 0], [2, 4]] }, { a: 0.0, b: 2.0, rss: 0.0, r2: 1.0, se_b: null }],
  ['exp-must', 'exp_fit', { points: [[0, 100], [5, 36.787944117144235]] }, { C0: 100.0, k: 0.2 }],
  ['exp-zero', 'exp_fit', { points: [[0, 100], [5, 0]] }, { error: 'MathError', reason: 'non_positive_y_for_log' }],
  ['calib', 'calibration', { standards: [0, 1, 2, 4, 8], signals: [0.02, 0.21, 0.39, 0.8, 1.58], unknown_signal: 0.55 }, { slope: 0.19575, intercept: 0.01275, x_unknown: 2.744572, LOD: 0.1621373 }],
  ['ratelaw', 'rate_law_fit', { C: [0.1, 0.2, 0.4], rate: [0.002, 0.008, 0.032] }, { order: 2.0, k: 0.2 }],
  ['unc-quot', 'uncertainty', { kind: 'product_quotient', terms: [{ x: 10, u: 0.2, power: 1 }, { x: 5, u: 0.1, power: -1 }] }, { f: 2.0, u_f: 0.05656854 }],
  ['unc-sum', 'uncertainty', { kind: 'sum', terms: [{ x: 12.0, u: 0.3, coeff: 1 }, { x: 4.0, u: 0.4, coeff: -1 }] }, { f: 8.0, u_f: 0.5 }],
  ['chi-gof', 'chi_square_gof', { observed: [50, 30, 20], expected_props: [1 / 3, 1 / 3, 1 / 3] }, { chi2: 14.0, df: 2, p: 0.000911882 }],
  ['chi-zero-exp', 'chi_square_gof', { observed: [5, 5], expected_props: [1, 0] }, { error: 'MathError', reason: 'zero_expected_count' }],
]

const check = (got, want) => {
  for (const [k, w] of Object.entries(want)) {
    expect(got, `key ${k}`).toHaveProperty(k)
    const g = got[k]
    if (w === null || typeof w === 'string') expect(g, k).toBe(w)
    else {
      expect(Number.isFinite(g), `${k} finite`).toBe(true)
      if (w === 0) expect(Math.abs(g), k).toBeLessThanOrEqual(1e-9)
      else expect(Math.abs(g - w), k).toBeLessThanOrEqual(1e-6 * Math.abs(w))
    }
  }
}

describe('estimation_fitting KATs: lib/sims/tier1/x4_curve_fit.calc.js', () => {
  it('has all 19 cases', () => expect(KAT).toHaveLength(19))
  it.each(KAT)('%s (%s)', (_id, op, input, want) => check(X4[op](input), want))
})

const BLOCK = /\/\* FIT-CALC-BEGIN x4_curve_fit \*\/[\s\S]*?\/\* FIT-CALC-END x4_curve_fit \*\//
const libBlock = readFileSync('lib/sims/tier1/x4_curve_fit.calc.js', 'utf8').match(BLOCK)[0]
for (const game of ['x4-curve-fit-poly', 'x4-curve-fit-u1', 'x4-curve-fit-u2']) {
  describe(`estimation_fitting KATs: FIT-CALC block inlined in ${game}.html`, () => {
    const block = readFileSync(`content/sims/html/${game}.html`, 'utf8').match(BLOCK)[0]
    const C = new Function(`${block}\nreturn FITCalcX4;`)()
    it.each(KAT)('%s (%s)', (_id, op, input, want) => check(C[op](input), want))
    // u2's re-wrapped copy was restored to the lib text byte for byte at integration (FIT Site 20:21), so the xfail is removed.
    it('inlined block is byte-identical to lib', () => expect(block).toBe(libBlock))
  })
}
