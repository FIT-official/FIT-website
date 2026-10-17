
/* FIT-CALC-BEGIN statistics */
const FITCalcStats = (function () {
  'use strict';

  const MAX = 200;
  const PI = Math.PI;

  function err(error, reason) {
    return { error, reason };
  }

  function finite(x) {
    return typeof x === 'number' && Number.isFinite(x);
  }

  function finiteFields(o, names) {
    if (!o || typeof o !== 'object') {
      return err('ConstraintViolation', 'invalid_input');
    }
    for (const k of names) {
      if (!finite(o[k])) {
        return err('ConstraintViolation', 'non_finite_value');
      }
    }
    return null;
  }

  function validData(data, minimum = 1) {
    if (!Array.isArray(data)) {
      return err('ConstraintViolation', 'invalid_data');
    }
    if (data.length === 0) {
      return err('ConstraintViolation', 'empty_data');
    }
    if (data.length > MAX) {
      return err('ConstraintViolation', 'too_many_points_max_200');
    }
    if (data.some(v => !finite(v))) {
      return err('ConstraintViolation', 'non_finite_value');
    }
    if (data.length < minimum) {
      return err('ConstraintViolation', 'points_out_of_range_2_200');
    }
    return null;
  }

  function validConf(conf) {
    if (!finite(conf) || conf <= 0 || conf >= 1) {
      return err('ConstraintViolation', 'confidence_out_of_range');
    }
    return null;
  }

  function validN(n) {
    if (!Number.isSafeInteger(n) || n < 1) {
      return err('ConstraintViolation', 'sample_size_not_positive_integer');
    }
    return null;
  }

  function validEdges(edges) {
    if (!Array.isArray(edges) ||
        edges.length < 2 ||
        edges.length > MAX + 1 ||
        edges.some(v => !finite(v))) {
      return err('ConstraintViolation', 'bad_class_edges');
    }
    for (let i = 1; i < edges.length; i++) {
      if (edges[i] <= edges[i - 1]) {
        return err('ConstraintViolation', 'bad_class_edges');
      }
    }
    return null;
  }

  function sortNumbers(a) {
    return a.slice().sort((x, y) => x - y);
  }

  function middle(a) {
    const n = a.length;
    const m = Math.floor(n / 2);
    return n % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  function quartiles(sorted) {
    const n = sorted.length;
    if (n === 1) {
      return {
        q1: sorted[0],
        median: sorted[0],
        q3: sorted[0]
      };
    }
    const m = Math.floor(n / 2);
    return {
      q1: middle(sorted.slice(0, m)),
      median: middle(sorted),
      q3: middle(sorted.slice(n % 2 ? m + 1 : m))
    };
  }

  function moments(data) {
    const n = data.length;
    const origin = data[0];
    let sum = 0;
    for (const x of data) sum += x - origin;
    const mean = origin + sum / n;
    let ss = 0;
    for (const x of data) {
      const d = x - mean;
      ss += d * d;
    }
    return { mean, ss };
  }

  /*
   * Internal standard normal CDF.
   * Simpson integration of the normal density on [0, |z|].
   * Step width <= 0.025, with an even number of panels.
   * Absolute integration error is well below 1e-7.
   * Values beyond 12 standard deviations use limiting tails.
   */
  function Phi(z) {
    if (z <= -12) return 0;
    if (z >= 12) return 1;
    if (z === 0) return 0.5;

    const a = Math.abs(z);
    const panels = Math.max(64, 2 * Math.ceil(a / 0.05));
    const h = a / panels;
    let sum = 1 + Math.exp(-a * a / 2);

    for (let i = 1; i < panels; i++) {
      const u = i * h;
      sum += (i % 2 ? 4 : 2) * Math.exp(-u * u / 2);
    }

    const area = h * sum / (3 * Math.sqrt(2 * PI));
    return Math.max(0, Math.min(1,
      z > 0 ? 0.5 + area : 0.5 - area
    ));
  }

  function invPhi(p) {
    let lo = -12;
    let hi = 12;

    for (let i = 0; i < 65; i++) {
      const mid = (lo + hi) / 2;
      if (Phi(mid) < p) lo = mid;
      else hi = mid;
    }

    return (lo + hi) / 2;
  }

  /*
   * Lanczos log-gamma for positive real arguments.
   * Internal numerical helper, dimensionless.
   */
  function logGamma(z) {
    const c = [
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
      return Math.log(PI) -
        Math.log(Math.sin(PI * z)) -
        logGamma(1 - z);
    }

    z -= 1;
    let x = c[0];
    for (let i = 1; i < c.length; i++) {
      x += c[i] / (z + i);
    }
    const t = z + 7.5;
    return 0.5 * Math.log(2 * PI) +
      (z + 0.5) * Math.log(t) - t + Math.log(x);
  }

  /*
   * Continued fraction for regularised incomplete beta.
   * Returns null on failure to converge within 500 iterations.
   */
  function betaFraction(a, b, x) {
    const tiny = 1e-300;
    let c = 1;
    let d = 1 - (a + b) * x / (a + 1);
    if (Math.abs(d) < tiny) d = tiny;
    d = 1 / d;
    let h = d;

    for (let m = 1; m <= 500; m++) {
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

      if (!Number.isFinite(h)) return null;
      if (Math.abs(delta - 1) < 3e-14) return h;
    }
    return null;
  }

  function incompleteBeta(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    const bt = Math.exp(
      logGamma(a + b) - logGamma(a) -
      logGamma(b) +
      a * Math.log(x) + b * Math.log1p(-x)
    );

    if (x < (a + 1) / (a + b + 2)) {
      const f = betaFraction(a, b, x);
      return f === null ? null :
        Math.max(0, Math.min(1, bt * f / a));
    }

    const f = betaFraction(b, a, 1 - x);
    return f === null ? null :
      Math.max(0, Math.min(1, 1 - bt * f / b));
  }

  function tCdf(t, df) {
    if (t === 0) return 0.5;
    const x = df / (df + t * t);
    const beta = incompleteBeta(df / 2, 0.5, x);
    if (beta === null) return null;
    return t > 0 ? 1 - beta / 2 : beta / 2;
  }

  function tInverse(p, df) {
    let lo = -1e12;
    let hi = 1e12;

    for (let i = 0; i < 120; i++) {
      const mid = (lo + hi) / 2;
      const value = tCdf(mid, df);
      if (value === null) return null;
      if (value < p) lo = mid;
      else hi = mid;
    }

    return (lo + hi) / 2;
  }

  /**
   * Tally categorical observations.
   * Input: {data[]} with 1–200 finite numbers or strings.
   * Output: {categories[],counts[]} in occurrences.
   * Strings retain first-appearance order; numbers ascend.
   * Errors: empty_data, too_many_points_max_200,
   * non_finite_value, invalid_data.
   * Worked example: ['cat','dog','cat'] ->
   * categories=['cat','dog'], counts=[2,1].
   */
  function tally({ data } = {}) {
    if (!Array.isArray(data)) {
      return err('ConstraintViolation', 'invalid_data');
    }
    if (!data.length) {
      return err('ConstraintViolation', 'empty_data');
    }
    if (data.length > MAX) {
      return err('ConstraintViolation', 'too_many_points_max_200');
    }
    if (data.some(v =>
      !(typeof v === 'string' || finite(v)))) {
      return err('ConstraintViolation', 'non_finite_value');
    }

    const isNumbers = data.every(finite);
    const isStrings = data.every(v => typeof v === 'string');

    if (!isNumbers && !isStrings) {
      return err('ConstraintViolation', 'mixed_category_types');
    }

    const map = new Map();
    data.forEach(v => map.set(v, (map.get(v) || 0) + 1));

    const categories = Array.from(map.keys());
    if (isNumbers) categories.sort((a, b) => a - b);

    return {
      categories,
      counts: categories.map(v => map.get(v))
    };
  }

  /**
   * Describe ungrouped numerical observations.
   * Input: {data[]} of 1–200 finite values, in common units.
   * Output: n, mean, median, modes[], range, q1, q3, iqr,
   * sd_pop, sd_sample, min, max.
   * SDs have data units; n and modes frequencies are counts.
   * Quartiles: median of the lower and upper halves;
   * exclude the middle item for odd n (O-Level convention).
   * Population SD divides by n; sample SD by n-1.
   * n=1 has null sample SD. Equal frequencies with at
   * least two distinct values mean no mode.
   * Errors: shared data validation codes.
   * Worked example: [1,2,2,5] -> mean=2.5,
   * median=2, q1=1.5, q3=3.5, IQR=2,
   * population variance=2.25, sample variance=3.
   */
  function summary({ data } = {}) {
    const error = validData(data);
    if (error) return error;

    const sorted = sortNumbers(data);
    const n = sorted.length;
    const m = moments(data);
    const q = quartiles(sorted);
    const counts = new Map();

    sorted.forEach(x =>
      counts.set(x, (counts.get(x) || 0) + 1));

    const top = Math.max(...counts.values());
    const modes = counts.size > 1 &&
      Array.from(counts.values()).every(v => v === top)
      ? []
      : Array.from(counts.keys()).filter(
        v => counts.get(v) === top
      );

    return {
      n,
      mean: m.mean,
      median: q.median,
      modes,
      range: sorted[n - 1] - sorted[0],
      q1: q.q1,
      q3: q.q3,
      iqr: q.q3 - q.q1,
      sd_pop: Math.sqrt(m.ss / n),
      sd_sample: n === 1 ? null :
        Math.sqrt(m.ss / (n - 1)),
      min: sorted[0],
      max: sorted[n - 1]
    };
  }

  /**
   * Estimate descriptive statistics from grouped classes.
   * Input: {edges[],freqs[]} with increasing numerical edges,
   * non-negative integer frequencies; edges.length=freqs.length+1.
   * Units: edges and mean_est/sd_est in data units.
   * SD is population midpoint estimate, divisor n.
   * Modal class uses frequency density; ties choose first.
   * Median class is first cumulative frequency >= n/2.
   * Output: {n,mean_est,sd_est,modal_class_index,
   * median_class_index}.
   * Errors: bad_class_edges, zero_total_frequency,
   * invalid_frequency, too_many_points_max_200.
   * Worked example: edges=[0,10,30], freqs=[4,6].
   * Midpoints 5,20; mean=14, variance=54,
   * sd=sqrt(54), modal index=0 (densities .4,.3),
   * median index=1.
   */
  function grouped_summary({ edges, freqs } = {}) {
    const e = validEdges(edges);
    if (e) return e;

    if (!Array.isArray(freqs) ||
        freqs.length !== edges.length - 1) {
      return err('ConstraintViolation', 'bad_class_edges');
    }
    if (freqs.some(v =>
      !Number.isSafeInteger(v) || v < 0)) {
      return err('ConstraintViolation', 'invalid_frequency');
    }

    const n = freqs.reduce((a, b) => a + b, 0);
    if (n === 0) {
      return err('MathError', 'zero_total_frequency');
    }

    const mids = freqs.map((_, i) =>
      (edges[i] + edges[i + 1]) / 2);

    const mean_est = freqs.reduce((s, f, i) =>
      s + f * mids[i], 0) / n;

    const variance = freqs.reduce((s, f, i) =>
      s + f * (mids[i] - mean_est) ** 2, 0) / n;

    let modal_class_index = 0;
    let bestDensity = -1;
    let median_class_index = 0;
    let cumulative = 0;
    let foundMedian = false;

    freqs.forEach((f, i) => {
      const density = f / (edges[i + 1] - edges[i]);

      if (density > bestDensity) {
        bestDensity = density;
        modal_class_index = i;
      }

      cumulative += f;
      if (!foundMedian && cumulative >= n / 2) {
        median_class_index = i;
        foundMedian = true;
      }
    });

    return {
      n,
      mean_est,
      sd_est: Math.sqrt(variance),
      modal_class_index,
      median_class_index
    };
  }

  /**
   * Construct a histogram.
   * Input: {data[],edges[]} with increasing class boundaries.
   * Classes [a,b), except last class [a,b].
   * Output: {freqs[],densities[]}; density unit is
   * frequency per unit of the data axis.
   * Errors: shared data validation, bad_class_edges,
   * value_outside_edges.
   * Worked example: data=[1,2,4,5], edges=[0,3,6]
   * -> freqs=[2,2], densities=[2/3,2/3].
   */
  function histogram({ data, edges } = {}) {
    const de = validData(data);
    if (de) return de;
    const ee = validEdges(edges);
    if (ee) return ee;

    const freqs = Array(edges.length - 1).fill(0);

    for (const v of data) {
      if (v < edges[0] || v > edges[edges.length - 1]) {
        return err('ConstraintViolation', 'value_outside_edges');
      }

      let i = freqs.length - 1;
      for (let j = 0; j < freqs.length - 1; j++) {
        if (v < edges[j + 1]) {
          i = j;
          break;
        }
      }
      freqs[i]++;
    }

    return {
      freqs,
      densities: freqs.map((f, i) =>
        f / (edges[i + 1] - edges[i]))
    };
  }

  /**
   * Standardise one observation.
   * Input: {x,mean,sd}, all in the same measurement units.
   * Output: {z}, dimensionless.
   * Errors: non_finite_value; zero_spread when sd<=0.
   * Worked example: x=74, mean=70, sd=8 -> z=0.5.
   */
  function zscore(o = {}) {
    const e = finiteFields(o, ['x', 'mean', 'sd']);
    if (e) return e;
    if (o.sd <= 0) return err('MathError', 'zero_spread');
    return { z: (o.x - o.mean) / o.sd };
  }

  /**
   * Normal cumulative distribution.
   * Input: {x,mu,sigma}; measurement units shared.
   * Output: {p}=P(X<=x), dimensionless.
   * Simpson quadrature; absolute accuracy better than 1e-7.
   * Errors: non_finite_value, zero_spread.
   * Worked example: x=10,mu=10,sigma=2 -> p=0.5.
   */
  function normal_cdf(o = {}) {
    const e = finiteFields(o, ['x', 'mu', 'sigma']);
    if (e) return e;
    if (o.sigma <= 0) return err('MathError', 'zero_spread');
    return { p: Phi((o.x - o.mu) / o.sigma) };
  }

  /**
   * Invert a normal cumulative probability.
   * Input: {p,mu,sigma}; 0<p<1, sigma>0.
   * Output: {x} in the units of mu and sigma.
   * Bisection of numerical normal CDF, p error <1e-7.
   * Errors: probability_out_of_range_0_1,
   * non_finite_value, zero_spread.
   * Worked example: p=0.5,mu=12,sigma=3 -> x=12.
   */
  function normal_inv(o = {}) {
    if (!finite(o.p) || o.p <= 0 || o.p >= 1) {
      return err('ConstraintViolation',
        'probability_out_of_range_0_1');
    }
    const e = finiteFields(o, ['mu', 'sigma']);
    if (e) return e;
    if (o.sigma <= 0) return err('MathError', 'zero_spread');
    return { x: o.mu + o.sigma * invPhi(o.p) };
  }

  /**
   * Sampling distribution of the sample mean.
   * Input: {mu,sigma,n}, n a positive integer;
   * sigma a population SD (non-negative).
   * Output: {mean,se}, in the original measurement units.
   * SE=sigma/sqrt(n). Zero sigma gives zero SE.
   * Errors: sample_size_not_positive_integer,
   * non_finite_value, negative_spread.
   * Worked example: mu=50,sigma=12,n=36 ->
   * mean=50,se=2.
   */
  function sampling_mean(o = {}) {
    const ne = validN(o.n);
    if (ne) return ne;
    const e = finiteFields(o, ['mu', 'sigma']);
    if (e) return e;
    if (o.sigma < 0) {
      return err('ConstraintViolation', 'negative_spread');
    }
    return { mean: o.mu, se: o.sigma / Math.sqrt(o.n) };
  }

  /**
   * Ordinary least-squares straight-line regression.
   * Input: {points:[[x,y],...]}, 2–200 finite pairs.
   * Output: intercept a (y units), slope b (y/x units),
   * Pearson r, r2, rss (squared y units),
   * se_b (slope units; null for n=2).
   * r and r2 null when all y are equal.
   * Errors: points_out_of_range_2_200,
   * non_finite_value, invalid_points, all_x_equal.
   * Worked example: points=[[1,2],[2,4],[3,6]]
   * -> a=0,b=2,r=1,r2=1,rss=0,se_b=0.
   */
  function linreg({ points } = {}) {
    if (!Array.isArray(points)) {
      return err('ConstraintViolation', 'invalid_points');
    }
    if (points.length < 2 || points.length > MAX) {
      return err('ConstraintViolation', 'points_out_of_range_2_200');
    }
    if (points.some(p =>
      !Array.isArray(p) ||
      p.length !== 2 ||
      !finite(p[0]) ||
      !finite(p[1]))) {
      return err('ConstraintViolation', 'non_finite_value');
    }

    const n = points.length;
    const xs = points.map(p => p[0]);
    const ys = points.map(p => p[1]);
    const mx = moments(xs).mean;
    const my = moments(ys).mean;
    let sxx = 0, syy = 0, sxy = 0;

    points.forEach(([x, y]) => {
      const dx = x - mx;
      const dy = y - my;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
    });

    if (sxx === 0) return err('MathError', 'all_x_equal');

    const b = sxy / sxx;
    const a = my - b * mx;
    const rss = points.reduce((s, [x, y]) =>
      s + (y - (a + b * x)) ** 2, 0);

    const r = syy === 0 ? null :
      Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));

    return {
      a,
      b,
      r,
      r2: r === null ? null : r * r,
      rss,
      se_b: n === 2 ? null :
        Math.sqrt(Math.max(0, rss) / (n - 2) / sxx)
    };
  }

  /**
   * Predict using a fitted straight line.
   * Input: {a,b,x,x_min,x_max}; x_min<=x_max.
   * Output: {y,extrapolation}; y=a+b*x,
   * extrapolation true outside observed x range.
   * Units: y and a share units; b is y per x unit.
   * Errors: non_finite_value, invalid_x_range.
   * Worked example: a=2,b=3,x=5,x_min=1,x_max=4
   * -> y=17,extrapolation=true.
   */
  function predict(o = {}) {
    const e = finiteFields(o,
      ['a', 'b', 'x', 'x_min', 'x_max']);
    if (e) return e;

    if (o.x_min > o.x_max) {
      return err('ConstraintViolation', 'invalid_x_range');
    }

    return {
      y: o.a + o.b * o.x,
      extrapolation: o.x < o.x_min || o.x > o.x_max
    };
  }

  /**
   * Two-sided confidence interval for a population mean.
   * Input: {data[],conf,sigma?}; observations share units.
   * If known population sigma is supplied, use a z interval.
   * Otherwise use Student's t with n-1 degrees of freedom,
   * sample SD dividing by n-1.
   * Output: {mean,half_width,lo,hi,method:'z'|'t'}.
   * Numerical t quantile uses regularised incomplete beta.
   * Errors: shared data codes, confidence_out_of_range,
   * points_out_of_range_2_200, zero_variance,
   * zero_spread, beta_iteration_limit.
   * Worked example: data=[8,10,12],conf=0.95,
   * sigma=2 -> mean=10,half_width=
   * 1.95996398454*2/sqrt(3),method='z'.
   */
  function ci_mean(o = {}) {
    const de = validData(o.data);
    if (de) return de;
    const ce = validConf(o.conf);
    if (ce) return ce;

    const known = o.sigma !== undefined;
    if (!known && o.data.length < 2) {
      return err('ConstraintViolation', 'points_out_of_range_2_200');
    }

    if (known) {
      if (!finite(o.sigma)) {
        return err('ConstraintViolation', 'non_finite_value');
      }
      if (o.sigma <= 0) {
        return err('MathError', 'zero_spread');
      }
    }

    const s = summary({ data: o.data });
    const sigma = known ? o.sigma : s.sd_sample;

    if (!known && sigma === 0) {
      return err('MathError', 'zero_variance');
    }

    const q = known ?
      invPhi((1 + o.conf) / 2) :
      tInverse((1 + o.conf) / 2, s.n - 1);

    if (q === null || !finite(q)) {
      return err('RuntimeError', 'beta_iteration_limit');
    }

    const half_width = q * sigma / Math.sqrt(s.n);

    return {
      mean: s.mean,
      half_width,
      lo: s.mean - half_width,
      hi: s.mean + half_width,
      method: known ? 'z' : 't'
    };
  }

  /**
   * Wald confidence interval for a population proportion.
   * Input: {successes,n,conf}; counts are non-negative integers.
   * Output: {p_hat,half_width,lo,hi,clipped:false};
   * all dimensionless proportions. Limits are NOT clipped.
   * Normal approximation is not guaranteed reliable for
   * small counts or extreme proportions.
   * Errors: sample_size_not_positive_integer,
   * successes_out_of_range, confidence_out_of_range.
   * Worked example: successes=50,n=100,conf=0.95 ->
   * p_hat=.5, half_width=.0979981992 approximately.
   */
  function ci_proportion(o = {}) {
    const ne = validN(o.n);
    if (ne) return ne;
    if (!Number.isSafeInteger(o.successes) ||
        o.successes < 0 || o.successes > o.n) {
      return err('ConstraintViolation', 'successes_out_of_range');
    }

    const ce = validConf(o.conf);
    if (ce) return ce;

    const p_hat = o.successes / o.n;
    const z = invPhi((1 + o.conf) / 2);
    const half_width = z *
      Math.sqrt(p_hat * (1 - p_hat) / o.n);

    return {
      p_hat,
      half_width,
      lo: p_hat - half_width,
      hi: p_hat + half_width,
      clipped: false
    };
  }

  /**
   * Minimum sample size for a specified mean margin.
   * Input: {sigma,margin,conf}; sigma and margin share units.
   * Output: {n}, smallest positive integer satisfying
   * z*sigma/sqrt(n)<=margin; known-sigma z method.
   * Errors: margin_not_positive, confidence_out_of_range,
   * zero_spread, sample_size_too_large, non_finite_value.
   * Worked example: sigma=10,margin=2,conf=.95 ->
   * ceil((1.95996398454*10/2)^2)=97.
   */
  function sample_size_mean(o = {}) {
    if (!finite(o.margin) || o.margin <= 0) {
      return err('ConstraintViolation', 'margin_not_positive');
    }
    const ce = validConf(o.conf);
    if (ce) return ce;
    if (!finite(o.sigma)) {
      return err('ConstraintViolation', 'non_finite_value');
    }
    if (o.sigma <= 0) {
      return err('MathError', 'zero_spread');
    }

    const z = invPhi((1 + o.conf) / 2);
    const raw = (z * o.sigma / o.margin) ** 2;

    if (!finite(raw) || raw > Number.MAX_SAFE_INTEGER) {
      return err('ConstraintViolation', 'sample_size_too_large');
    }

    let n = Math.max(1, Math.ceil(raw));
    while (n > 1 && z * o.sigma / Math.sqrt(n - 1) <= o.margin) {
      n--;
    }
    while (z * o.sigma / Math.sqrt(n) > o.margin) {
      n++;
    }
    return { n };
  }

  /**
   * Three-sigma x-bar control-chart limits.
   * Input: {mean,sd,n}; mean and sd share measurement units,
   * sd is the known within-process individual-observation SD.
   * Output: {ucl,lcl,cl}, in measurement units.
   * No truncation or clamping of negative LCL.
   * Errors: sample_size_not_positive_integer,
   * non_finite_value, zero_spread.
   * Worked example: mean=100,sd=6,n=9 ->
   * ucl=106,lcl=94,cl=100.
   */
  function control_limits(o = {}) {
    const ne = validN(o.n);
    if (ne) return ne;
    const e = finiteFields(o, ['mean', 'sd']);
    if (e) return e;
    if (o.sd <= 0) {
      return err('MathError', 'zero_spread');
    }

    const h = 3 * o.sd / Math.sqrt(o.n);

    return {
      ucl: o.mean + h,
      lcl: o.mean - h,
      cl: o.mean
    };
  }

  /**
   * Tukey 1.5-IQR box-plot statistics.
   * Input: {data[]} with 1–200 finite values, common units.
   * Output: q1,median,q3,iqr,lower_fence,upper_fence,
   * whisker_lo,whisker_hi,outliers[]; all data units.
   * Quartiles exclude the median for odd-length lists.
   * Fence equality counts as inside.
   * Errors: shared data validation codes.
   * Worked example: [1,2,3,4,5,20] ->
   * q1=2,median=3.5,q3=5,iqr=3,
   * fences=-2.5,9.5, whiskers=1,5,outliers=[20].
   */
  function boxplot({ data } = {}) {
    const de = validData(data);
    if (de) return de;
    const s = summary({ data });
    const sorted = sortNumbers(data);
    const lower_fence = s.q1 - 1.5 * s.iqr;
    const upper_fence = s.q3 + 1.5 * s.iqr;

    const inside = sorted.filter(v =>
      v >= lower_fence && v <= upper_fence);

    return {
      q1: s.q1,
      median: s.median,
      q3: s.q3,
      iqr: s.iqr,
      lower_fence,
      upper_fence,
      whisker_lo: inside.length ? inside[0] : null,
      whisker_hi: inside.length ?
        inside[inside.length - 1] : null,
      outliers: sorted.filter(v =>
        v < lower_fence || v > upper_fence)
    };
  }

  /**
   * Known-population-SD z test for a population mean.
   * Input: {xbar,mu0,sigma,n,tail:'two'|'left'|'right'}.
   * xbar,mu0,sigma share units; n is a positive integer.
   * Output: {z,p}, both dimensionless.
   * Validates tail, then n, then sigma.
   * Errors: method_not_supported,
   * sample_size_not_positive_integer,
   * zero_spread, non_finite_value.
   * Worked example: xbar=104,mu0=100,sigma=8,n=16,
   * tail='right' -> z=2,p=0.02275013195.
   */
  function ztest(o = {}) {
    if (!['two', 'left', 'right'].includes(o.tail)) {
      return err('NotSupported', 'method_not_supported');
    }
    const ne = validN(o.n);
    if (ne) return ne;

    if (!finite(o.sigma)) {
      return err('ConstraintViolation', 'non_finite_value');
    }
    if (o.sigma <= 0) {
      return err('MathError', 'zero_spread');
    }

    const e = finiteFields(o, ['xbar', 'mu0']);
    if (e) return e;

    const z = (o.xbar - o.mu0) /
      (o.sigma / Math.sqrt(o.n));

    const left = Phi(z);
    const p = o.tail === 'left' ? left :
      o.tail === 'right' ? 1 - left :
      2 * Math.min(left, 1 - left);

    return {
      z,
      p: Math.max(0, Math.min(1, p))
    };
  }

  return Object.freeze({
    API_VERSION: 1,
    tally,
    summary,
    grouped_summary,
    histogram,
    zscore,
    normal_cdf,
    normal_inv,
    sampling_mean,
    linreg,
    predict,
    ci_mean,
    ci_proportion,
    sample_size_mean,
    control_limits,
    boxplot,
    ztest
  });
})();
/* FIT-CALC-END statistics */
export default FITCalcStats;
