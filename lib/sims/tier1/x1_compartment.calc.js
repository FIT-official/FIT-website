
/* FIT-CALC-BEGIN x1_compartment */
const FITCalcX1 = (function () {
  'use strict';

  const R = 8.314;
  const own = (o, k) => o && Object.prototype.hasOwnProperty.call(o, k);
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  const valid = (o, keys) => o && typeof o === 'object' &&
    keys.every(k => own(o, k) && finite(o[k]));
  const safe = o => Object.values(o).every(v => v === null || typeof v === 'boolean' || finite(v)) ? o :
    { error: 'MathError', reason: 'undefined_result' };
  const REASONS = {
    HALF_LIFE_MUST_BE_POSITIVE: ['MathError', 'half_life_must_be_positive'],
    TIME_CONSTANT_MUST_BE_POSITIVE: ['MathError', 'tau_must_be_positive'],
    INVALID_ORDER: ['NotSupported', 'order_or_reactor_outside_scope'],
    TOO_MANY_STATES: ['NotSupported', 'too_many_states'],
    MathError: ['MathError', 'undefined_result']
  };
  const bad = code => {
    if (REASONS[code]) return { error: REASONS[code][0], reason: REASONS[code][1] };
    if (/NEGATIVE|MUST_BE_NONNEGATIVE/.test(code))
      return { error: 'ConstraintViolation', reason: 'negative_input' };
    return { error: 'ConstraintViolation', reason: code.toLowerCase() };
  };
  const pos = x => x > 0;
  const nonneg = x => x >= 0;

  /**
   * Integrated zero-, first- and second-order rate law.
   * Inputs: order (0, 1, 2), C0_mol_L >= 0, k >= 0,
   * t_s >= 0. k units: mol L^-1 s^-1 (zero),
   * s^-1 (first), L mol^-1 s^-1 (second).
   * Outputs: C_mol_L, halfLife_s; also tZero_s and depleted
   * for order 0.
   */
  function integratedRateLaw(p) {
    if (!valid(p, ['order', 'C0_mol_L', 'k', 't_s']))
      return bad('INVALID_INPUT');
    const { order, C0_mol_L: c, k, t_s: t } = p;
    if (![0, 1, 2].includes(order)) return bad('INVALID_ORDER');
    if (c < 0) return bad('NEGATIVE_CONCENTRATION');
    if (k < 0) return bad('NEGATIVE_RATE');
    if (!nonneg(t)) return bad('TIME_MUST_BE_NONNEGATIVE');
    if (order === 0) {
      const tZero_s = k === 0 ? null : c / k;
      return safe({
        C_mol_L: Math.max(0, c - k * t),
        halfLife_s: k === 0 ? null : c / (2 * k),
        tZero_s, depleted: k > 0 && t >= tZero_s
      });
    }
    if (order === 1)
      return safe({
        C_mol_L: c * Math.exp(-k * t),
        halfLife_s: k === 0 ? null : Math.LN2 / k
      });
    return safe({
      C_mol_L: c / (1 + k * c * t),
      halfLife_s: k === 0 || c === 0 ? null : 1 / (k * c)
    });
  }

  /**
   * First-order exponential decay, dC/dt=-kC.
   * Inputs: C0 >= 0 (arbitrary consistent concentration unit),
   * k_per_s >= 0 (s^-1), t_s >= 0 (s).
   * Output: C (same unit as C0).
   */
  function firstOrderDecay(p) {
    if (!valid(p, ['C0', 'k_per_s', 't_s']))
      return bad('INVALID_INPUT');
    const { C0, k_per_s: k, t_s: t } = p;
    if (C0 < 0) return bad('NEGATIVE_CONCENTRATION');
    if (k < 0) return bad('NEGATIVE_RATE');
    if (t < 0) return bad('TIME_MUST_BE_NONNEGATIVE');
    return safe({ C: C0 * Math.exp(-k * t) });
  }

  /**
   * Arrhenius law k=A exp(-Ea/RT).
   * Inputs: A > 0 (units of k), Ea_J_mol >= 0,
   * T_K > 0. Outputs: k, lnk, invT_per_K.
   */
  function arrhenius(p) {
    if (!valid(p, ['A', 'Ea_J_mol', 'T_K']))
      return bad('INVALID_INPUT');
    const { A, Ea_J_mol: E, T_K: T } = p;
    if (!pos(T)) return bad('MathError');
    if (!pos(A)) return bad('PREFACTOR_MUST_BE_POSITIVE');
    if (E < 0) return bad('NEGATIVE_ACTIVATION_ENERGY');
    const lnk = Math.log(A) - E / (R * T);
    return safe({ k: Math.exp(lnk), lnk, invT_per_K: 1 / T });
  }

  /**
   * Two-point Arrhenius parameter identification.
   * Inputs: k1,k2 > 0 (same rate units), T1_K,T2_K > 0.
   * Outputs: Ea_J_mol, A (same units as k).
   */
  function arrheniusTwoPoint(p) {
    if (!valid(p, ['k1', 'T1_K', 'k2', 'T2_K']))
      return bad('INVALID_INPUT');
    const { k1, k2, T1_K: T1, T2_K: T2 } = p;
    if (!pos(T1) || !pos(T2) || T1 === T2)
      return bad('MathError');
    if (!pos(k1) || !pos(k2))
      return bad('RATE_MUST_BE_POSITIVE');
    const E = -R * (Math.log(k2) - Math.log(k1)) /
      (1 / T2 - 1 / T1);
    const A = Math.exp(Math.log(k1) + E / (R * T1));
    return safe({ Ea_J_mol: E, A });
  }

  /**
   * Radioactive decay and instantaneous activity.
   * Inputs: N0 >= 0 (nuclei), halfLife_s > 0, t_s >= 0.
   * Outputs: N, lambda_per_s, activity_Bq.
   */
  function radioactiveDecay(p) {
    if (!valid(p, ['N0', 'halfLife_s', 't_s']))
      return bad('INVALID_INPUT');
    const { N0, halfLife_s: h, t_s: t } = p;
    if (N0 < 0) return bad('NEGATIVE_INITIAL_COUNT');
    if (!pos(h)) return bad('HALF_LIFE_MUST_BE_POSITIVE');
    if (t < 0) return bad('TIME_MUST_BE_NONNEGATIVE');
    const lambda_per_s = Math.LN2 / h;
    const N = N0 * Math.exp(-lambda_per_s * t);
    return safe({ N, lambda_per_s, activity_Bq: lambda_per_s * N });
  }

  /**
   * First-order batch conversion.
   * Inputs: k_per_s >= 0, t_s >= 0.
   * Output: X (dimensionless fraction).
   */
  function batchFirstOrder(p) {
    if (!valid(p, ['k_per_s', 't_s']))
      return bad('INVALID_INPUT');
    if (p.k_per_s < 0) return bad('NEGATIVE_RATE');
    if (p.t_s < 0) return bad('TIME_MUST_BE_NONNEGATIVE');
    return safe({ X: -Math.expm1(-p.k_per_s * p.t_s) });
  }

  /**
   * Steady-state first-order CSTR conversion.
   * Inputs: k_per_s >= 0, tau_s >= 0.
   * Output: X.
   */
  function cstrFirstOrder(p) {
    if (!valid(p, ['k_per_s', 'tau_s']))
      return bad('INVALID_INPUT');
    if (p.k_per_s < 0) return bad('NEGATIVE_RATE');
    if (p.tau_s < 0) return bad('NEGATIVE_RESIDENCE_TIME');
    const z = p.k_per_s * p.tau_s;
    return safe({ X: z / (1 + z) });
  }

  /**
   * Steady-state ideal PFR first-order conversion.
   * Inputs: k_per_s >= 0, tau_s >= 0.
   * Output: X.
   */
  function pfrFirstOrder(p) {
    if (!valid(p, ['k_per_s', 'tau_s']))
      return bad('INVALID_INPUT');
    if (p.k_per_s < 0) return bad('NEGATIVE_RATE');
    if (p.tau_s < 0) return bad('NEGATIVE_RESIDENCE_TIME');
    return safe({ X: -Math.expm1(-p.k_per_s * p.tau_s) });
  }

  /**
   * Hydraulic residence time tau=V/Q.
   * Inputs: V_m3 >= 0, Q_m3_s > 0.
   * Output: tau_s.
   */
  function residenceTime(p) {
    if (!valid(p, ['V_m3', 'Q_m3_s']))
      return bad('INVALID_INPUT');
    if (p.V_m3 < 0) return bad('NEGATIVE_VOLUME');
    if (!pos(p.Q_m3_s)) return bad('FLOW_MUST_BE_POSITIVE');
    return safe({ tau_s: p.V_m3 / p.Q_m3_s });
  }

  /**
   * Linear tank level response.
   * Model: A dh/dt=qin-h/R, tau=AR.
   */
  function linearTank(p) {
    if (!valid(p, ['A_m2', 'R_s_per_m2', 'qin_m3_s', 'h0_m', 't_s']))
      return bad('INVALID_INPUT');
    const { A_m2: A, R_s_per_m2: Rr, qin_m3_s: q,
      h0_m: h0, t_s: t } = p;
    if (!pos(A)) return bad('AREA_MUST_BE_POSITIVE');
    if (!pos(Rr)) return bad('RESISTANCE_MUST_BE_POSITIVE');
    if (q < 0) return bad('NEGATIVE_FLOW');
    if (h0 < 0) return bad('NEGATIVE_HEIGHT');
    if (t < 0) return bad('TIME_MUST_BE_NONNEGATIVE');
    const tau_s = A * Rr, hss_m = q * Rr;
    return safe({
      h_m: hss_m + (h0 - hss_m) * Math.exp(-t / tau_s),
      tau_s, hss_m
    });
  }

  /**
   * First-order-plus-dead-time response.
   * Inputs: K, tau_s > 0, theta_s >= 0, du, t_s >= 0.
   */
  function fopdtStep(p) {
    if (!valid(p, ['K', 'tau_s', 'theta_s', 'du', 't_s']))
      return bad('INVALID_INPUT');
    if (!pos(p.tau_s)) return bad('TIME_CONSTANT_MUST_BE_POSITIVE');
    if (p.theta_s < 0) return bad('NEGATIVE_DEAD_TIME');
    if (p.t_s < 0) return bad('TIME_MUST_BE_NONNEGATIVE');
    return safe({ y: p.t_s <= p.theta_s ? 0 :
      p.K * p.du * -Math.expm1(-(p.t_s - p.theta_s) / p.tau_s) });
  }

  /**
   * Well-mixed lake concentration.
   * Inputs: V_m3 > 0, Q_m3_s >= 0, Cin_mg_L >= 0,
   * C0_mg_L >= 0, k_per_s >= 0, t_s >= 0.
   */
  function wellMixedLake(p) {
    if (!valid(p, ['V_m3', 'Q_m3_s', 'Cin_mg_L',
      'C0_mg_L', 'k_per_s', 't_s'])) return bad('INVALID_INPUT');
    const { V_m3: V, Q_m3_s: Q, Cin_mg_L: Cin,
      C0_mg_L: C0, k_per_s: k, t_s: t } = p;
    if (!pos(V)) return bad('VOLUME_MUST_BE_POSITIVE');
    if (Q < 0) return bad('NEGATIVE_FLOW');
    if (Cin < 0 || C0 < 0) return bad('NEGATIVE_CONCENTRATION');
    if (k < 0) return bad('NEGATIVE_RATE');
    if (t < 0) return bad('TIME_MUST_BE_NONNEGATIVE');
    const a = Q / V + k;
    if (a === 0) return { C_mg_L: C0, Css_mg_L: null };
    const Css_mg_L = (Q / V * Cin) / a;
    return safe({
      C_mg_L: Css_mg_L + (C0 - Css_mg_L) * Math.exp(-a * t),
      Css_mg_L
    });
  }

  /**
   * Monod specific microbial growth rate.
   * Inputs: muMax_per_h >= 0, Ks_g_L > 0, S_g_L >= 0.
   * Outputs: mu_per_h and doubling_time.
   */
  function monod(p) {
    if (!valid(p, ['muMax_per_h', 'Ks_g_L', 'S_g_L']))
      return bad('INVALID_INPUT');
    if (p.muMax_per_h < 0) return bad('NEGATIVE_GROWTH_RATE');
    if (!pos(p.Ks_g_L))
      return bad('SATURATION_CONSTANT_MUST_BE_POSITIVE');
    if (p.S_g_L < 0) return bad('NEGATIVE_SUBSTRATE');
    const mu_per_h = p.muMax_per_h * p.S_g_L /
      (p.Ks_g_L + p.S_g_L);
    return safe({ mu_per_h,
      doubling_time: mu_per_h === 0 ? null : Math.LN2 / mu_per_h });
  }

  /**
   * Exponential population growth.
   * Inputs: N0 >= 0, r_per_day, t_day >= 0.
   */
  function exponentialGrowth(p) {
    if (!valid(p, ['N0', 'r_per_day', 't_day']))
      return bad('INVALID_INPUT');
    if (p.N0 < 0) return bad('NEGATIVE_POPULATION');
    if (p.t_day < 0) return bad('NEGATIVE_TIME');
    return safe({ N: p.N0 * Math.exp(p.r_per_day * p.t_day) });
  }

  /**
   * Logistic population growth.
   * Inputs: N0 >= 0, r_per_day >= 0, K > 0, t_day >= 0.
   * N0=0 is an equilibrium.
   */
  function logistic(p) {
    if (!valid(p, ['N0', 'r_per_day', 'K', 't_day']))
      return bad('INVALID_INPUT');
    if (p.N0 < 0) return bad('NEGATIVE_POPULATION');
    if (!pos(p.K)) return bad('CARRYING_CAPACITY_MUST_BE_POSITIVE');
    if (p.r_per_day < 0) return bad('NEGATIVE_GROWTH_RATE');
    if (p.t_day < 0) return bad('NEGATIVE_TIME');
    if (p.N0 === 0) return { N: 0 };
    const e = Math.exp(-p.r_per_day * p.t_day);
    return safe({ N: p.K / (1 + (p.K / p.N0 - 1) * e) });
  }

  /**
   * Shared fixed-step fourth-order Runge-Kutta integrator.
   * Supports 1-3 finite states and 0-5000 steps.
   */
  function rk4(p) {
    if (!p || typeof p.f !== 'function' || !Array.isArray(p.y0) ||
      !finite(p.t0) || !finite(p.dt) || !finite(p.steps))
      return bad('INVALID_INPUT');
    if (p.y0.length > 3) return bad('TOO_MANY_STATES');
    if (p.y0.length < 1 || !p.y0.every(finite))
      return bad('INVALID_INPUT');
    if (!Number.isInteger(p.steps) || p.steps < 0 || p.steps > 5000)
      return bad('INVALID_STEP_COUNT');
    if (!pos(p.dt)) return bad('INVALID_STEP_SIZE');
    const t = [p.t0], y = [p.y0.slice()], n = p.y0.length;
    let state = p.y0.slice(), time = p.t0;
    const derivative = (tt, yy) => {
      let v;
      try { v = p.f(tt, yy.slice()); }
      catch (_) { return null; }
      return Array.isArray(v) && v.length === n && v.every(finite)
        ? v : null;
    };
    for (let i = 0; i < p.steps; i++) {
      const h = p.dt;
      const k1 = derivative(time, state);
      if (!k1) return bad('MathError');
      const k2 = derivative(time + h / 2,
        state.map((v, j) => v + h * k1[j] / 2));
      if (!k2) return bad('MathError');
      const k3 = derivative(time + h / 2,
        state.map((v, j) => v + h * k2[j] / 2));
      if (!k3) return bad('MathError');
      const k4 = derivative(time + h,
        state.map((v, j) => v + h * k3[j]));
      if (!k4) return bad('MathError');
      state = state.map((v, j) => v +
        h * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]) / 6);
      time = p.t0 + (i + 1) * h;
      if (!finite(time) || !state.every(finite))
        return bad('MathError');
      t.push(time);
      y.push(state.slice());
    }
    return { t, y };
  }

  /**
   * Predator-prey Lotka-Volterra model integrated with RK4.
   * x'=alpha*x-beta*x*y; y'=delta*x*y-gamma*y.
   */
  function lotkaVolterra(p) {
    if (!valid(p, ['x0', 'y0', 'alpha', 'beta', 'delta',
      'gamma', 'dt', 'steps'])) return bad('INVALID_INPUT');
    if (p.x0 < 0 || p.y0 < 0) return bad('NEGATIVE_POPULATION');
    if (['alpha', 'beta', 'delta', 'gamma'].some(k => p[k] < 0))
      return bad('NEGATIVE_RATE');
    const result = rk4({
      f: (t, s) => [
        p.alpha * s[0] - p.beta * s[0] * s[1],
        p.delta * s[0] * s[1] - p.gamma * s[1]
      ],
      y0: [p.x0, p.y0],
      t0: 0, dt: p.dt, steps: p.steps
    });
    if (result.error) return result;
    return {
      t: result.t,
      x: result.y.map(v => v[0]),
      y: result.y.map(v => v[1])
    };
  }

  /**
   * Stock-and-flow with linear feedback, integrated by RK4.
   */
  function stockAndFlow(p) {
    if (!valid(p, ['S0', 'inflow', 'outflowRate_per_s',
      'feedbackGain', 'target', 'dt_s', 'steps']))
      return bad('INVALID_INPUT');
    if (p.S0 < 0) return bad('NEGATIVE_STOCK');
    if (p.inflow < 0) return bad('NEGATIVE_FLOW');
    if (p.outflowRate_per_s < 0 || p.feedbackGain < 0)
      return bad('NEGATIVE_RATE');
    if (p.target < 0) return bad('NEGATIVE_TARGET');
    const r = rk4({
      f: (t, s) => [p.inflow - p.outflowRate_per_s * s[0] +
        p.feedbackGain * (p.target - s[0])],
      y0: [p.S0], t0: 0, dt: p.dt_s, steps: p.steps
    });
    if (r.error) return r;
    return { t: r.t, S: r.y.map(a => a[0]) };
  }

  // FIT KAT-facing aliases use the concise parameter and output names.
  function decay(p) {
    if (!valid(p, ['order', 'C0', 'k', 't'])) return bad('INVALID_INPUT');
    const r = integratedRateLaw({ order: p.order, C0_mol_L: p.C0, k: p.k, t_s: p.t });
    if (r.error) return r;
    const out = { C: r.C_mol_L, half_life: r.halfLife_s };
    if (p.order === 0) out.depleted = r.depleted;
    return out;
  }

  // Constant-density ideal reactor with first- or second-order kinetics.
  function reactor(p) {
    if (!p || !['CSTR', 'PFR'].includes(p.type) || ![1, 2].includes(p.order))
      return bad('INVALID_ORDER');
    const keys = p.order === 2 ? ['k', 'tau', 'C0'] : ['k', 'tau'];
    if (!valid(p, keys)) return bad('INVALID_INPUT');
    if (keys.some(key => p[key] < 0)) return bad('NEGATIVE_RATE');
    const Da = p.k * p.tau * (p.order === 2 ? p.C0 : 1);
    if (!finite(Da)) return bad('MathError');
    let X;
    if (p.type === 'PFR') X = p.order === 1 ? -Math.expm1(-Da) : Da / (1 + Da);
    else if (p.order === 1) X = Da / (1 + Da);
    else X = Da === 0 ? 0 : 2 * Da / (2 * Da + 1 + Math.sqrt(1 + 4 * Da));
    return safe({ X, Da });
  }

  function lake(p) {
    if (!valid(p, ['W_g_per_s', 'Q_m3_per_s', 'k_per_s', 'V_m3']))
      return bad('INVALID_INPUT');
    if (Object.values(p).some(v => typeof v === 'number' && v < 0))
      return bad('NEGATIVE_RATE');
    const denominator = p.Q_m3_per_s + p.k_per_s * p.V_m3;
    if (denominator <= 0) return bad('MathError');
    return safe({ C_ss: p.W_g_per_s / denominator,
      tau_response: p.V_m3 / denominator });
  }

  function tankStep(p) {
    if (!valid(p, ['K', 'du', 'tau', 't'])) return bad('INVALID_INPUT');
    if (p.tau === 0) return bad('TIME_CONSTANT_MUST_BE_POSITIVE');
    if (p.tau < 0 || p.t < 0) return bad('NEGATIVE_TIME');
    const fraction = -Math.expm1(-p.t / p.tau);
    return safe({ y: p.K * p.du * fraction, fraction });
  }

  function growth(p) {
    if (!p || !['logistic', 'exponential'].includes(p.model)) return bad('INVALID_INPUT');
    const keys = p.model === 'logistic' ? ['N0', 'r', 'K', 't'] : ['N0', 'r', 't'];
    if (!valid(p, keys)) return bad('INVALID_INPUT');
    return p.model === 'logistic'
      ? logistic({ N0: p.N0, r_per_day: p.r, K: p.K, t_day: p.t })
      : exponentialGrowth({ N0: p.N0, r_per_day: p.r, t_day: p.t });
  }

  function monodRate(p) {
    if (!valid(p, ['mu_max', 'Ks', 'S'])) return bad('INVALID_INPUT');
    const r = monod({ muMax_per_h: p.mu_max, Ks_g_L: p.Ks, S_g_L: p.S });
    return r.error ? r : { mu: r.mu_per_h, doubling_time: r.doubling_time };
  }

  function lvEquilibrium(p) {
    if (!valid(p, ['alpha', 'beta', 'delta', 'gamma'])) return bad('INVALID_INPUT');
    if (Object.values(p).some(v => v < 0)) return bad('NEGATIVE_RATE');
    if (p.beta === 0 || p.delta === 0 || p.alpha === 0 || p.gamma === 0)
      return bad('MathError');
    return safe({ prey_eq: p.gamma / p.delta, pred_eq: p.alpha / p.beta,
      small_osc_period: 2 * Math.PI / Math.sqrt(p.alpha * p.gamma) });
  }

  function stockFlow(p) {
    if (!valid(p, ['S0', 'inflow', 'k', 't'])) return bad('INVALID_INPUT');
    if (Object.values(p).some(v => v < 0)) return bad('NEGATIVE_STOCK');
    const S_eq = p.k === 0 ? null : p.inflow / p.k;
    const S = p.k === 0 ? p.S0 + p.inflow * p.t :
      p.S0 * Math.exp(-p.k * p.t) + p.inflow * -Math.expm1(-p.k * p.t) / p.k;
    return safe({ S, S_eq });
  }

  return Object.freeze({
    API_VERSION: 1,
    decay, reactor, lake, tankStep, growth, monodRate, lvEquilibrium, stockFlow,
    integratedRateLaw,
    firstOrderDecay,
    arrhenius,
    arrheniusTwoPoint,
    radioactiveDecay,
    batchFirstOrder,
    cstrFirstOrder,
    pfrFirstOrder,
    residenceTime,
    linearTank,
    fopdtStep,
    wellMixedLake,
    monod,
    exponentialGrowth,
    logistic,
    lotkaVolterra,
    stockAndFlow,
    rk4
  });
})();
/* FIT-CALC-END x1_compartment */
export default FITCalcX1;

