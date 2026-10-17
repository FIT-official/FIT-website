/* FIT-CALC-BEGIN x4_curve_fit */
const FITCalcX4 = (function () {
  'use strict';

  const API_VERSION = 1;
  const EPS = 1e-14;
  const MAX_ITER = 10000;

  function err(error, reason) {
    return { error, reason };
  }

  function finite(x) {
    return typeof x === 'number' && Number.isFinite(x);
  }

  function arrayOK(a, min = 2, max = 50) {
    return Array.isArray(a) && a.length >= min && a.length <= max;
  }

  function numbersOK(a) {
    return Array.isArray(a) && a.every(finite);
  }

  function safe(z) {
    return Number.isFinite(z) ? z : null;
  }

  function mean(a) {
    const base = a[0];
    let s = 0;
    for (const v of a) s += v - base;
    return base + s / a.length;
  }

  function variance(a, m) {
    let s = 0;
    for (const v of a) {
      const d = v - m;
      s += d * d;
    }
    return s / (a.length - 1);
  }

  function logGamma(z) {
    const p = [
      0.99999999999980993,
      676.5203681218851,
      -1259.1392167224028,
      771.32342877765313,
      -176.61502916214059,
      12.507343278686905,
      -0.13857109526572012,
      9.9843695780195716e-6,
      1.5056327351493116e-7
    ];
    if (z < 0.5) {
      return Math.log(Math.PI) -
        Math.log(Math.sin(Math.PI * z)) -
        logGamma(1 - z);
    }
    z -= 1;
    let x = p[0];
    for (let i = 1; i < p.length; i++) x += p[i] / (z + i);
    const t = z + 7.5;
    return 0.5 * Math.log(2 * Math.PI) +
      (z + 0.5) * Math.log(t) - t + Math.log(x);
  }

  function betaFraction(a, b, x) {
    const tiny = 1e-300;
    let c = 1;
    let d = 1 - (a + b) * x / (a + 1);
    if (Math.abs(d) < tiny) d = tiny;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAX_ITER; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x /
        ((a + m2 - 1) * (a + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < tiny) d = tiny;
      c = 1 + aa / c;
      if (Math.abs(c) < tiny) c = tiny;
      d = 1 / d;
      h *= d * c;
      aa = -(a + m) * (a + b + m) * x /
        ((a + m2) * (a + m2 + 1));
      d = 1 + aa * d;
      if (Math.abs(d) < tiny) d = tiny;
      c = 1 + aa / c;
      if (Math.abs(c) < tiny) c = tiny;
      d = 1 / d;
      const delta = d * c;
      h *= delta;
      if (Math.abs(delta - 1) < 2e-14) return h;
    }
    return null;
  }

  function regularisedBeta(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const front = Math.exp(
      logGamma(a + b) - logGamma(a) - logGamma(b) +
      a * Math.log(x) + b * Math.log1p(-x)
    );
    if (x < (a + 1) / (a + b + 2)) {
      const h = betaFraction(a, b, x);
      return h === null ? null : Math.max(0, Math.min(1, front * h / a));
    }
    const h = betaFraction(b, a, 1 - x);
    return h === null ? null :
      Math.max(0, Math.min(1, 1 - front * h / b));
  }

  function gammaQ(a, x) {
    if (x <= 0) return 1;
    const gln = logGamma(a);
    if (x < a + 1) {
      let sum = 1 / a;
      let term = sum;
      for (let n = 1; n <= MAX_ITER; n++) {
        term *= x / (a + n);
        sum += term;
        if (Math.abs(term) < Math.abs(sum) * 2e-15) {
          return Math.max(0, Math.min(1,
            1 - sum * Math.exp(-x + a * Math.log(x) - gln)));
        }
      }
      return null;
    }
    const tiny = 1e-300;
    let b = x + 1 - a;
    let c = 1 / tiny;
    let d = 1 / b;
    let h = d;
    for (let i = 1; i <= MAX_ITER; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b;
      if (Math.abs(d) < tiny) d = tiny;
      c = b + an / c;
      if (Math.abs(c) < tiny) c = tiny;
      d = 1 / d;
      const delta = d * c;
      h *= delta;
      if (Math.abs(delta - 1) < 2e-15) {
        return Math.max(0, Math.min(1,
          Math.exp(-x + a * Math.log(x) - gln) * h));
      }
    }
    return null;
  }

  function tTail(t, df) {
    return regularisedBeta(df / (df + t * t), df / 2, 0.5);
  }

  function tCritical(conf, df) {
    const target = 1 - conf;
    let lo = 0;
    let hi = 1;
    while (tTail(hi, df) > target && hi < 1e12) hi *= 2;
    for (let i = 0; i < 130; i++) {
      const mid = (lo + hi) / 2;
      if (tTail(mid, df) > target) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function validatedSample(a) {
    if (!arrayOK(a)) return err('ConstraintViolation',
      'points_out_of_range_2_50');
    if (!numbersOK(a)) return err('ConstraintViolation',
      'non_finite_input');
    return null;
  }

  function checkedResult(result) {
    for (const key of Object.keys(result)) {
      const value = result[key];
      if (typeof value === 'number' && !Number.isFinite(value)) {
        return err('MathError', 'non_finite_result');
      }
    }
    return result;
  }

  /**
   * One-sample, two-sided Student t test.
   * Input: {data:number[],mu0:number}, 2–50 independent observations,
   * all in the same SI unit as mu0.
   * Output: {mean,sd,t,df,p_two_sided}; sd is sample SD (n−1).
   * Assumes approximately normal independent observations.
   * Errors: points_out_of_range_2_50, non_finite_input, zero_variance.
   * Hand check: data [2,4,6], mu0=3; mean=4,
   * sd=2, t=1/sqrt(4/3)=0.8660254, df=2, p=0.477767.
   */
  function t_test_1s({ data, mu0 } = {}) {
    const e = validatedSample(data);
    if (e) return e;
    if (!finite(mu0)) return err('ConstraintViolation', 'non_finite_input');
    const m = mean(data);
    const v = variance(data, m);
    if (v === 0) return err('MathError', 'zero_variance');
    const sd = Math.sqrt(v);
    const t = (m - mu0) / (sd / Math.sqrt(data.length));
    const p_two_sided = tTail(Math.abs(t), data.length - 1);
    return checkedResult({ mean: m, sd, t, df: data.length - 1,
      p_two_sided });
  }

  /**
   * Independent two-sample two-sided t test.
   * Input: {x:number[],y:number[],equal_var:boolean}; 2–50
   * observations per group, equal physical units.
   * Output: {t,df,p_two_sided}. true=pooled, false=Welch.
   * Assumes independent, approximately normal samples.
   * Errors: points_out_of_range_2_50, non_finite_input,
   * zero_variance; invalid modes are NotSupported.
   * Hand check: x=[2,4,6], y=[1,3,5], equal_var=true:
   * pooled variance=4, SE=sqrt(8/3), t=0.612372436,
   * df=4; Welch has the same t and df=4 for these samples.
   */
  function t_test_2s({ x, y, equal_var } = {}) {
    const ex = validatedSample(x);
    if (ex) return ex;
    const ey = validatedSample(y);
    if (ey) return ey;
    if (typeof equal_var !== 'boolean') {
      return err('NotSupported', 'unsupported_variance_mode');
    }
    const n1 = x.length, n2 = y.length;
    const m1 = mean(x), m2 = mean(y);
    const v1 = variance(x, m1), v2 = variance(y, m2);
    if (v1 === 0 && v2 === 0) {
      return err('MathError', 'zero_variance');
    }
    let se2, df;
    if (equal_var) {
      const sp2 = ((n1 - 1) * v1 + (n2 - 1) * v2) /
        (n1 + n2 - 2);
      se2 = sp2 * (1 / n1 + 1 / n2);
      df = n1 + n2 - 2;
    } else {
      const a = v1 / n1, b = v2 / n2;
      se2 = a + b;
      df = se2 * se2 /
        (a * a / (n1 - 1) + b * b / (n2 - 1));
    }
    const t = (m1 - m2) / Math.sqrt(se2);
    return checkedResult({ t, df,
      p_two_sided: tTail(Math.abs(t), df) });
  }

  /**
   * Two-sided Student t confidence interval for a population mean.
   * Input: {data:number[],conf:number}, 2–50 values of one SI unit;
   * 0<conf<1.
   * Output: {mean,half_width,lo,hi}, all in the data's unit.
   * Assumes independent, approximately normal observations.
   * Errors: points_out_of_range_2_50, confidence_out_of_range,
   * non_finite_input; zero sample variance gives a zero-width result.
   * Hand check: [2,4,6,8,10], conf=.95: mean=6, sd=sqrt(10),
   * SE=sqrt(2), tcrit(df=4)=2.776445105,
   * half_width=3.926486322.
   */
  function ci_mean({ data, conf } = {}) {
    const e = validatedSample(data);
    if (e) return e;
    if (!finite(conf) || conf <= 0 || conf >= 1) {
      return err('ConstraintViolation', 'confidence_out_of_range');
    }
    const m = mean(data);
    const sd = Math.sqrt(variance(data, m));
    const half_width = tCritical(conf, data.length - 1) *
      sd / Math.sqrt(data.length);
    return checkedResult({ mean: m, half_width,
      lo: m - half_width, hi: m + half_width });
  }

  function fitLineRaw(points) {
    const n = points.length;
    const xs = points.map(p => p[0]);
    const ys = points.map(p => p[1]);
    const mx = mean(xs), my = mean(ys);
    let sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - mx, dy = ys[i] - my;
      sxx += dx * dx;
      sxy += dx * dy;
      syy += dy * dy;
    }
    if (sxx === 0) return err('MathError', 'all_x_equal');
    const b = sxy / sxx;
    const a = my - b * mx;
    let rss = 0;
    for (let i = 0; i < n; i++) {
      const r = ys[i] - (a + b * xs[i]);
      rss += r * r;
    }
    const r2 = syy === 0 ? null : 1 - rss / syy;
    const se_b = n === 2 ? null :
      Math.sqrt(Math.max(0, rss / (n - 2)) / sxx);
    return checkedResult({ a, b, r2, rss, se_b });
  }

  /**
   * Ordinary least-squares straight line y=a+b*x.
   * Input: {points:[[x,y],...]}, 2–50 finite SI-valued pairs.
   * Output: {a,b,r2,rss,se_b}; b and se_b have unit y/x,
   * rss has unit y². At n=2 se_b=null; at constant y r2=null.
   * Assumes independent, homoscedastic y residuals and exact x.
   * Errors: points_out_of_range_2_50, non_finite_input,
   * all_x_equal, non_finite_result.
   * Hand check: (0,1),(1,3),(2,5): a=1,b=2,r2=1,
   * rss=0,se_b=0.
   */
  function linreg({ points } = {}) {
    if (!arrayOK(points)) return err('ConstraintViolation',
      'points_out_of_range_2_50');
    if (!points.every(p => Array.isArray(p) &&
      p.length === 2 && numbersOK(p))) {
      return err('ConstraintViolation', 'non_finite_input');
    }
    return fitLineRaw(points);
  }

  /**
   * Log-linear exponential fit C(t)=C0*exp(-k*t).
   * Input: {points:[[t_s,C],...]}, C>0, 2–50 pairs.
   * Output: {C0,k}; C0 has C's SI unit; k is s^-1.
   * Assumes exponential decay and least squares on ln(C), not C.
   * Errors: points_out_of_range_2_50, non_positive_y_for_log,
   * all_x_equal, non_finite_input.
   * Hand check: (0,10),(1,10/e),(2,10/e²):
   * fitted ln C = ln 10 - t; C0=10, k=1 s^-1.
   */
  function exp_fit({ points } = {}) {
    if (!arrayOK(points)) return err('ConstraintViolation',
      'points_out_of_range_2_50');
    if (!points.every(p => Array.isArray(p) &&
      p.length === 2 && numbersOK(p))) {
      return err('ConstraintViolation', 'non_finite_input');
    }
    if (points.some(p => p[1] <= 0)) {
      return err('MathError', 'non_positive_y_for_log');
    }
    const r = fitLineRaw(points.map(p => [p[0], Math.log(p[1])]));
    if (r.error) return r;
    return checkedResult({ C0: Math.exp(r.a), k: -r.b });
  }

  /**
   * Unweighted linear calibration, signal=m*standard+c.
   * Input: {standards:number[],signals:number[],
   * unknown_signal:number}; 3–50 matched pairs.
   * Standard and unknown concentrations use the same SI unit,
   * signals share one instrument unit.
   * Output: {slope,intercept,x_unknown,LOD}; slope is signal
   * per concentration; x_unknown and LOD have concentration units.
   * LOD=3.3*s_y/slope with s_y=sqrt(RSS/(n-2)), signed as specified.
   * Assumes a linear response and constant signal variance.
   * Errors: points_out_of_range_2_50, insufficient_residual_df,
   * mismatched_lengths, zero_slope, all_x_equal, non_finite_input.
   * Hand check: standards [0,1,2,3], signals [1,3,5,7],
   * unknown=5 => slope=2, intercept=1, unknown=2, LOD=0.
   */
  function calibration({ standards, signals, unknown_signal } = {}) {
    const e = validatedSample(standards);
    if (e) return e;
    if (!arrayOK(signals)) return err('ConstraintViolation',
      'points_out_of_range_2_50');
    if (standards.length !== signals.length) {
      return err('ConstraintViolation', 'mismatched_lengths');
    }
    if (!numbersOK(signals) || !finite(unknown_signal)) {
      return err('ConstraintViolation', 'non_finite_input');
    }
    if (standards.length < 3) {
      return err('ConstraintViolation', 'insufficient_residual_df');
    }
    const r = fitLineRaw(standards.map((v, i) => [v, signals[i]]));
    if (r.error) return r;
    if (r.b === 0) return err('MathError', 'zero_slope');
    const sy = Math.sqrt(Math.max(0, r.rss) / (standards.length - 2));
    return checkedResult({
      slope: r.b,
      intercept: r.a,
      x_unknown: (unknown_signal - r.a) / r.b,
      LOD: 3.3 * sy / r.b
    });
  }

  /**
   * Initial-rate power-law fit rate=k*C^order.
   * Input: {C:number[],rate:number[]}, 2–50 positive pairs;
   * C in mol/L, rate in mol/(L s).
   * Output: {k,order}; k's units depend on fitted order.
   * Fits ln(rate)=ln(k)+order*ln(C).
   * Assumes a single power-law regime with multiplicative errors.
   * Errors: points_out_of_range_2_50, mismatched_lengths,
   * non_positive_y_for_log, all_x_equal, non_finite_input.
   * Hand check: C=[1,2,4],rate=[3,12,48]:
   * slope=2, intercept=ln 3, k=3, order=2.
   */
  function rate_law_fit({ C, rate } = {}) {
    const e = validatedSample(C);
    if (e) return e;
    if (!arrayOK(rate)) return err('ConstraintViolation',
      'points_out_of_range_2_50');
    if (C.length !== rate.length) return err('ConstraintViolation',
      'mismatched_lengths');
    if (!numbersOK(rate)) return err('ConstraintViolation',
      'non_finite_input');
    if (C.some(v => v <= 0) || rate.some(v => v <= 0)) {
      return err('MathError', 'non_positive_y_for_log');
    }
    const r = fitLineRaw(C.map((v, i) => [Math.log(v),
      Math.log(rate[i])]));
    if (r.error) return r;
    return checkedResult({ k: Math.exp(r.a), order: r.b });
  }

  /**
   * First-order independent-input uncertainty propagation.
   * Input: {kind:'sum'|'product_quotient',terms:[...]}, 1–50 terms.
   * For sum: {x,u,coeff}; f=sum(coeff*x),
   * u_f²=sum((coeff*u)²).
   * For product_quotient: {x,u,power}; f=product(x^power),
   * u_f²=f²*sum((power*u/x)²).
   * Units: x/u use the same SI unit per term; resulting f/u_f
   * use the algebraic combination of those units.
   * Assumes uncorrelated inputs, small relative uncertainty
   * for nonlinear operations, and u>=0.
   * Errors: unsupported_uncertainty_kind, terms_out_of_range_1_50,
   * negative_uncertainty, zero_denominator, non_finite_input.
   * Hand check: sum (x=3,u=.2,c=2), (x=4,u=.3,c=-1):
   * f=2, u_f=sqrt(.16+.09)=.5.
   */
  function uncertainty({ kind, terms } = {}) {
    if (kind !== 'sum' && kind !== 'product_quotient') {
      return err('NotSupported', 'unsupported_uncertainty_kind');
    }
    if (!Array.isArray(terms) || terms.length < 1 ||
      terms.length > 50) return err('ConstraintViolation',
        'terms_out_of_range_1_50');
    const field = kind === 'sum' ? 'coeff' : 'power';
    for (const t of terms) {
      if (!t || !finite(t.x) || !finite(t.u) || !finite(t[field])) {
        return err('ConstraintViolation', 'non_finite_input');
      }
      if (t.u < 0) return err('ConstraintViolation',
        'negative_uncertainty');
      if (kind === 'product_quotient' && t.x === 0) {
        return err('MathError', 'zero_denominator');
      }
      if (kind === 'product_quotient' && t.x < 0 &&
        !Number.isInteger(t.power)) {
        return err('MathError', 'undefined_power');
      }
    }
    let f, v = 0;
    if (kind === 'sum') {
      f = 0;
      for (const t of terms) {
        f += t.coeff * t.x;
        v += (t.coeff * t.u) ** 2;
      }
    } else {
      f = 1;
      for (const t of terms) {
        f *= Math.pow(t.x, t.power);
        v += (t.power * t.u / t.x) ** 2;
      }
      v *= f * f;
    }
    return checkedResult({ f, u_f: Math.sqrt(v) });
  }

  /**
   * Pearson chi-square goodness-of-fit test.
   * Input: {observed:number[],expected_props:number[]},
   * 2–50 categories, nonnegative integer counts and probabilities
   * summing to 1. Counts are dimensionless.
   * Output: {chi2,df,p}; df=categories-1, upper-tail p.
   * Assumes independent multinomial observations, with no
   * parameters estimated from observed counts.
   * Small expected counts weaken asymptotic inference.
   * Errors: points_out_of_range_2_50, mismatched_lengths,
   * invalid_counts, invalid_probabilities, zero_expected_count.
   * Hand check: observed [30,70], props [.5,.5],
   * expected [50,50], chi2=16, df=1,
   * p=0.0000633424837.
   */
  function chi_square_gof({ observed, expected_props } = {}) {
    if (!arrayOK(observed) || !arrayOK(expected_props)) {
      return err('ConstraintViolation', 'points_out_of_range_2_50');
    }
    if (observed.length !== expected_props.length) {
      return err('ConstraintViolation', 'mismatched_lengths');
    }
    if (!numbersOK(observed) || observed.some(v =>
      v < 0 || !Number.isInteger(v))) {
      return err('ConstraintViolation', 'invalid_counts');
    }
    if (!numbersOK(expected_props) ||
      expected_props.some(v => v < 0) ||
      Math.abs(expected_props.reduce((a, b) => a + b, 0) - 1) > 1e-10) {
      return err('ConstraintViolation', 'invalid_probabilities');
    }
    const N = observed.reduce((a, b) => a + b, 0);
    let chi2 = 0;
    for (let i = 0; i < observed.length; i++) {
      const expected = N * expected_props[i];
      if (expected === 0) return err('MathError',
        'zero_expected_count');
      chi2 += (observed[i] - expected) ** 2 / expected;
    }
    const df = observed.length - 1;
    return checkedResult({ chi2, df, p: gammaQ(df / 2, chi2 / 2) });
  }

  return Object.freeze({
    API_VERSION,
    t_test_1s,
    t_test_2s,
    ci_mean,
    linreg,
    exp_fit,
    calibration,
    rate_law_fit,
    uncertainty,
    chi_square_gof
  });
})();
/* FIT-CALC-END x4_curve_fit */
export default FITCalcX4;