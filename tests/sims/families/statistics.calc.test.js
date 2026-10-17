// Statistics family: calc module KATs.
// Cases and expected values: kat_cases/families/statistics.json (FIT Stock Strategy, 58 cases, version 2026-10-17), copied verbatim;
// value cases re-confirmed by an independent oracle (vetting/fit-social/kat/statistics/oracle_statistics.py: numpy / scipy.stats
// norm, t, pearsonr, polyfit + O-Level quartile method written from the convention).
// Every expected key is required (FIT Site ruling 20:09); extra keys are allowed. Tolerance per the KAT file: numbers rel 1e-6,
// zero abs 1e-9; integers, booleans, strings, nulls, lists and error objects exact.
// The same cases also run against the FIT-CALC block inlined in each of the 5 games, which must match lib byte for byte.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import Stats from '../../../lib/sims/families/statistics.calc.js'

const KAT = [
  ["tally-strings", "tally", {"data": ["cat", "dog", "cat", "bird", "dog", "cat"]}, {"categories": ["cat", "dog", "bird"], "counts": [3, 2, 1]}],
  ["tally-numbers", "tally", {"data": [3, 1, 2, 3, 3, 1]}, {"categories": [1, 2, 3], "counts": [2, 1, 3]}],
  ["tally-empty", "tally", {"data": []}, {"error": "ConstraintViolation", "reason": "empty_data"}],
  ["summary-odd", "summary", {"data": [2, 4, 4, 5, 7, 9, 10]}, {"n": 7, "mean": 5.857143, "median": 5, "modes": [4], "range": 8, "q1": 4, "q3": 9, "iqr": 5, "sd_pop": 2.695423, "sd_sample": 2.91139, "min": 2, "max": 10}],
  ["summary-bimodal", "summary", {"data": [8, 1, 3, 9, 6, 3, 8, 7]}, {"n": 8, "mean": 5.625, "median": 6.5, "modes": [3, 8], "range": 8, "q1": 3.0, "q3": 8.0, "iqr": 5.0, "sd_pop": 2.735759, "sd_sample": 2.924649, "min": 1, "max": 9}],
  ["summary-nomode", "summary", {"data": [5, 1, 4, 2, 3]}, {"n": 5, "mean": 3.0, "median": 3, "modes": [], "range": 4, "q1": 1.5, "q3": 4.5, "iqr": 3.0, "sd_pop": 1.414214, "sd_sample": 1.581139, "min": 1, "max": 5}],
  ["summary-two", "summary", {"data": [10, 4]}, {"n": 2, "mean": 7.0, "median": 7.0, "modes": [], "range": 6, "q1": 4, "q3": 10, "iqr": 6, "sd_pop": 3.0, "sd_sample": 4.242641, "min": 4, "max": 10}],
  ["summary-one", "summary", {"data": [7]}, {"n": 1, "mean": 7.0, "median": 7, "modes": [7], "range": 0, "q1": 7, "q3": 7, "iqr": 0, "sd_pop": 0.0, "sd_sample": null, "min": 7, "max": 7}],
  ["summary-all-same", "summary", {"data": [5, 5, 5]}, {"n": 3, "mean": 5.0, "median": 5, "modes": [5], "range": 0, "q1": 5, "q3": 5, "iqr": 0, "sd_pop": 0.0, "sd_sample": 0.0, "min": 5, "max": 5}],
  ["summary-too-many", "summary", {"data": [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0, 10.5, 11.0, 11.5, 12.0, 12.5, 13.0, 13.5, 14.0, 14.5, 15.0, 15.5, 16.0, 16.5, 17.0, 17.5, 18.0, 18.5, 19.0, 19.5, 20.0, 20.5, 21.0, 21.5, 22.0, 22.5, 23.0, 23.5, 24.0, 24.5, 25.0, 25.5, 26.0, 26.5, 27.0, 27.5, 28.0, 28.5, 29.0, 29.5, 30.0, 30.5, 31.0, 31.5, 32.0, 32.5, 33.0, 33.5, 34.0, 34.5, 35.0, 35.5, 36.0, 36.5, 37.0, 37.5, 38.0, 38.5, 39.0, 39.5, 40.0, 40.5, 41.0, 41.5, 42.0, 42.5, 43.0, 43.5, 44.0, 44.5, 45.0, 45.5, 46.0, 46.5, 47.0, 47.5, 48.0, 48.5, 49.0, 49.5, 50.0, 50.5, 51.0, 51.5, 52.0, 52.5, 53.0, 53.5, 54.0, 54.5, 55.0, 55.5, 56.0, 56.5, 57.0, 57.5, 58.0, 58.5, 59.0, 59.5, 60.0, 60.5, 61.0, 61.5, 62.0, 62.5, 63.0, 63.5, 64.0, 64.5, 65.0, 65.5, 66.0, 66.5, 67.0, 67.5, 68.0, 68.5, 69.0, 69.5, 70.0, 70.5, 71.0, 71.5, 72.0, 72.5, 73.0, 73.5, 74.0, 74.5, 75.0, 75.5, 76.0, 76.5, 77.0, 77.5, 78.0, 78.5, 79.0, 79.5, 80.0, 80.5, 81.0, 81.5, 82.0, 82.5, 83.0, 83.5, 84.0, 84.5, 85.0, 85.5, 86.0, 86.5, 87.0, 87.5, 88.0, 88.5, 89.0, 89.5, 90.0, 90.5, 91.0, 91.5, 92.0, 92.5, 93.0, 93.5, 94.0, 94.5, 95.0, 95.5, 96.0, 96.5, 97.0, 97.5, 98.0, 98.5, 99.0, 99.5, 100.0]}, {"error": "ConstraintViolation", "reason": "too_many_points_max_200"}],
  ["grouped-unequal", "grouped_summary", {"edges": [0, 5, 10, 20, 40], "freqs": [4, 6, 14, 5]}, {"n": 29, "mean_est": 14.31034, "sd_est": 8.456189, "modal_class_index": 2, "median_class_index": 2}],
  ["grouped-zero-class", "grouped_summary", {"edges": [0, 10, 20, 30, 40], "freqs": [0, 7, 6, 2]}, {"n": 15, "mean_est": 21.66667, "sd_est": 6.992059, "modal_class_index": 1, "median_class_index": 2}],
  ["grouped-density-vs-freq", "grouped_summary", {"edges": [0, 10, 20, 40, 60], "freqs": [8, 12, 15, 6]}, {"n": 41, "mean_est": 23.65854, "sd_est": 14.35713, "modal_class_index": 1, "median_class_index": 2}],
  ["grouped-density-tie", "grouped_summary", {"edges": [0, 10, 30], "freqs": [5, 10]}, {"n": 15, "mean_est": 15.0, "sd_est": 7.071068, "modal_class_index": 0, "median_class_index": 1}],
  ["grouped-median-boundary", "grouped_summary", {"edges": [0, 10, 20, 30], "freqs": [3, 5, 8]}, {"n": 16, "mean_est": 18.125, "sd_est": 7.680129, "modal_class_index": 2, "median_class_index": 1}],
  ["grouped-zero", "grouped_summary", {"edges": [0, 10, 20, 30], "freqs": [0, 0, 0]}, {"error": "MathError", "reason": "zero_total_frequency"}],
  ["grouped-bad-edges", "grouped_summary", {"edges": [0, 10, 20], "freqs": [3, 4, 5]}, {"error": "ConstraintViolation", "reason": "bad_class_edges"}],
  ["hist-unequal", "histogram", {"data": [1, 2, 3, 6, 7, 8, 9, 12, 15, 19, 20], "edges": [0, 5, 10, 20]}, {"freqs": [3, 4, 4], "densities": [0.6, 0.8, 0.4]}],
  ["hist-boundary", "histogram", {"data": [5, 10, 0], "edges": [0, 5, 10]}, {"freqs": [1, 2], "densities": [0.2, 0.4]}],
  ["hist-outside", "histogram", {"data": [-1, 3], "edges": [0, 5]}, {"error": "ConstraintViolation", "reason": "value_outside_edges"}],
  ["zscore-test", "zscore", {"x": 51.8, "mean": 50, "sd": 1}, {"z": 1.8}],
  ["zscore-zero", "zscore", {"x": 3, "mean": 2, "sd": 0}, {"error": "MathError", "reason": "zero_spread"}],
  ["ncdf-pvalue", "normal_cdf", {"x": 1.8, "mu": 0, "sigma": 1}, {"p": 0.9640697}],
  ["ncdf-two-tail", "normal_cdf", {"x": 94.1, "mu": 100, "sigma": 2.5}, {"p": 0.009137468}],
  ["ncdf-at-mean", "normal_cdf", {"x": 7, "mu": 7, "sigma": 3}, {"p": 0.5}],
  ["ninv-95", "normal_inv", {"p": 0.95, "mu": 100, "sigma": 15}, {"x": 124.6728}],
  ["ninv-p1", "normal_inv", {"p": 1, "mu": 0, "sigma": 1}, {"error": "ConstraintViolation", "reason": "probability_out_of_range_0_1"}],
  ["box-no-outliers", "boxplot", {"data": [2, 4, 4, 5, 7, 9, 10]}, {"q1": 4, "median": 5, "q3": 9, "iqr": 5, "lower_fence": -3.5, "upper_fence": 16.5, "whisker_lo": 2, "whisker_hi": 10, "outliers": []}],
  ["box-both-outliers", "boxplot", {"data": [40, 3, -20, 4, 5, 6, 7, 8, 9]}, {"q1": 3.5, "median": 6, "q3": 8.5, "iqr": 5.0, "lower_fence": -4.0, "upper_fence": 16.0, "whisker_lo": 3, "whisker_hi": 9, "outliers": [-20, 40]}],
  ["box-on-fence", "boxplot", {"data": [0, 2, 3, 4, 5, 6, 7, 8, 15]}, {"q1": 2.5, "median": 5, "q3": 7.5, "iqr": 5.0, "lower_fence": -5.0, "upper_fence": 15.0, "whisker_lo": 0, "whisker_hi": 15, "outliers": []}],
  ["box-one", "boxplot", {"data": [3]}, {"q1": 3, "median": 3, "q3": 3, "iqr": 0, "lower_fence": 3.0, "upper_fence": 3.0, "whisker_lo": 3, "whisker_hi": 3, "outliers": []}],
  ["box-empty", "boxplot", {"data": []}, {"error": "ConstraintViolation", "reason": "empty_data"}],
  ["ztest-two", "ztest", {"xbar": 51.8, "mu0": 50, "sigma": 6, "n": 36, "tail": "two"}, {"z": 1.8, "p": 0.07186064}],
  ["ztest-right", "ztest", {"xbar": 51.8, "mu0": 50, "sigma": 6, "n": 36, "tail": "right"}, {"z": 1.8, "p": 0.03593032}],
  ["ztest-left", "ztest", {"xbar": 48.5, "mu0": 50, "sigma": 4, "n": 16, "tail": "left"}, {"z": -1.5, "p": 0.0668072}],
  ["ztest-zero", "ztest", {"xbar": 50, "mu0": 50, "sigma": 6, "n": 36, "tail": "two"}, {"z": 0.0, "p": 1.0}],
  ["ztest-bad-tail", "ztest", {"xbar": 51.8, "mu0": 50, "sigma": 6, "n": 36, "tail": "both"}, {"error": "NotSupported", "reason": "method_not_supported"}],
  ["ztest-n0", "ztest", {"xbar": 51.8, "mu0": 50, "sigma": 0, "n": 0, "tail": "two"}, {"error": "ConstraintViolation", "reason": "sample_size_not_positive_integer"}],
  ["ztest-sigma0", "ztest", {"xbar": 51.8, "mu0": 50, "sigma": 0, "n": 36, "tail": "two"}, {"error": "MathError", "reason": "zero_spread"}],
  ["sampling-mean", "sampling_mean", {"mu": 50, "sigma": 12, "n": 36}, {"mean": 50, "se": 2.0}],
  ["sampling-n-frac", "sampling_mean", {"mu": 50, "sigma": 12, "n": 2.5}, {"error": "ConstraintViolation", "reason": "sample_size_not_positive_integer"}],
  ["linreg-basic", "linreg", {"points": [[1, 2], [2, 4], [3, 5], [4, 4], [5, 5]]}, {"a": 2.2, "b": 0.6, "r": 0.7745967, "r2": 0.6, "rss": 2.4, "se_b": 0.2828427}],
  ["linreg-flat", "linreg", {"points": [[1, 3], [2, 3], [4, 3]]}, {"a": 3.0, "b": 0.0, "r": null, "r2": null, "rss": 0.0, "se_b": 0.0}],
  ["linreg-two", "linreg", {"points": [[0, 1], [2, 5]]}, {"a": 1.0, "b": 2.0, "r": 1.0, "r2": 1.0, "rss": 0.0, "se_b": null}],
  ["linreg-vertical", "linreg", {"points": [[2, 1], [2, 3], [2, 5]]}, {"error": "MathError", "reason": "all_x_equal"}],
  ["predict-boundary", "predict", {"a": 1, "b": 2, "x": 5, "x_min": 0, "x_max": 5}, {"y": 11, "extrapolation": false}],
  ["predict-extrap", "predict", {"a": 1, "b": 2, "x": 8, "x_min": 0, "x_max": 5}, {"y": 17, "extrapolation": true}],
  ["ci-t", "ci_mean", {"data": [12, 15, 11, 14, 13], "conf": 0.95}, {"mean": 13.0, "half_width": 1.963243, "lo": 11.03676, "hi": 14.96324, "method": "t"}],
  ["ci-z-const", "ci_mean", {"data": [5, 5, 5], "conf": 0.95, "sigma": 1}, {"mean": 5.0, "half_width": 1.131586, "lo": 3.868414, "hi": 6.131586, "method": "z"}],
  ["ci-t-const", "ci_mean", {"data": [5, 5, 5], "conf": 0.95}, {"error": "MathError", "reason": "zero_variance"}],
  ["ci-prop", "ci_proportion", {"successes": 45, "n": 100, "conf": 0.95}, {"p_hat": 0.45, "half_width": 0.09750698, "lo": 0.352493, "hi": 0.547507, "clipped": false}],
  ["ci-prop-below-0", "ci_proportion", {"successes": 1, "n": 10, "conf": 0.95}, {"p_hat": 0.1, "half_width": 0.1859385, "lo": -0.08593851, "hi": 0.2859385, "clipped": false}],
  ["ci-prop-zero", "ci_proportion", {"successes": 0, "n": 20, "conf": 0.95}, {"p_hat": 0.0, "half_width": 0.0, "lo": 0.0, "hi": 0.0, "clipped": false}],
  ["ci-prop-bad", "ci_proportion", {"successes": 25, "n": 20, "conf": 0.95}, {"error": "ConstraintViolation", "reason": "successes_out_of_range"}],
  ["n-for-margin", "sample_size_mean", {"sigma": 15, "margin": 3, "conf": 0.95}, {"n": 97}],
  ["control-xbar", "control_limits", {"mean": 500, "sd": 4, "n": 4}, {"ucl": 506.0, "lcl": 494.0, "cl": 500}],
  ["control-neg-lcl", "control_limits", {"mean": 2, "sd": 3, "n": 4}, {"ucl": 6.5, "lcl": -2.5, "cl": 2}],
  ["control-n1", "control_limits", {"mean": 10, "sd": 0.5, "n": 1}, {"ucl": 11.5, "lcl": 8.5, "cl": 10}],
]

const check = (got, want) => {
  for (const [k, w] of Object.entries(want)) {
    expect(got, `key ${k}`).toHaveProperty(k)
    const g = got[k]
    if (typeof w !== 'number') expect(g, k).toEqual(w)
    else if (Number.isInteger(w) && Number.isInteger(g)) expect(g, k).toBe(w)
    else {
      expect(Number.isFinite(g), `${k} finite`).toBe(true)
      if (w === 0) expect(Math.abs(g), k).toBeLessThanOrEqual(1e-9)
      else expect(Math.abs(g - w), k).toBeLessThanOrEqual(1e-6 * Math.abs(w))
    }
  }
}

describe('statistics KATs: lib/sims/families/statistics.calc.js', () => {
  it('has all 58 cases', () => expect(KAT).toHaveLength(58))
  it.each(KAT)('%s (%s)', (_id, op, input, want) => check(Stats[op](structuredClone(input)), want))
})

const BLOCK = /\/\* FIT-CALC-BEGIN statistics \*\/[\s\S]*?\/\* FIT-CALC-END statistics \*\//
const libBlock = readFileSync('lib/sims/families/statistics.calc.js', 'utf8').match(BLOCK)[0]
for (const game of ['statistics-p', 'statistics-s', 'statistics-jc', 'statistics-poly', 'statistics-u']) {
  describe(`statistics KATs: FIT-CALC block inlined in ${game}.html`, () => {
    const block = readFileSync(`content/sims/html/${game}.html`, 'utf8').match(BLOCK)[0]
    it('inlined block is byte-identical to lib', () => expect(block).toBe(libBlock))
    const C = new Function(`${block}\nreturn FITCalcStats;`)()
    it.each(KAT)('%s (%s)', (_id, op, input, want) => check(C[op](structuredClone(input)), want))
  })
}
