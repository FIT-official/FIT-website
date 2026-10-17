/* FIT-CALC-BEGIN x6_numerical_stability */
const FITCalcX6 = (function () {
  'use strict';

  const PI = Math.PI;
  const MAX_STEPS = 100000;
  const MAX_CELLS = 100;

  function error(type, reason) {
    return { error: type, reason: reason };
  }

  function finite(x) {
    return typeof x === 'number' && Number.isFinite(x);
  }

  function validNumber(x) {
    return finite(x) ? null :
      error('ConstraintViolation', 'invalid_numeric_input');
  }

  function validSteps(steps) {
    if (!Number.isInteger(steps) || steps < 0 || steps > MAX_STEPS) {
      return error('ConstraintViolation', 'steps_out_of_range');
    }
    return null;
  }

  function supportedODE(ode) {
    return ode === 'decay' ||
      ode === 'logistic' ||
      ode === 't_minus_y';
  }

  function supportedMethod(method) {
    return method === 'euler' || method === 'rk4';
  }

  function checkODE(ode, params) {
    if (!supportedODE(ode)) {
      return error('NotSupported', 'ode_or_method_not_in_fixed_list');
    }
    if (!params || typeof params !== 'object') {
      return error('ConstraintViolation', 'invalid_parameters');
    }
    if (ode === 'decay' && !finite(params.lam)) {
      return error('ConstraintViolation', 'invalid_parameters');
    }
    if (ode === 'logistic') {
      if (!finite(params.r) || !finite(params.K) || params.K <= 0) {
        return error('ConstraintViolation', 'invalid_parameters');
      }
    }
    return null;
  }

  function rhs(ode, params, t, y) {
    if (ode === 'decay') return params.lam * y;
    if (ode === 'logistic') {
      return params.r * y * (1 - y / params.K);
    }
    return t - y;
  }

  function exactODE(ode, params, y0, t) {
    if (ode === 'decay') {
      return y0 * Math.exp(params.lam * t);
    }
    if (ode === 't_minus_y') {
      return t - 1 + (y0 + 1) * Math.exp(-t);
    }
    if (y0 === 0) return 0;
    const e = Math.exp(-params.r * t);
    return params.K / (1 + (params.K / y0 - 1) * e);
  }

  function advance(method, ode, params, t, y, h) {
    if (method === 'euler') {
      return y + h * rhs(ode, params, t, y);
    }
    const k1 = rhs(ode, params, t, y);
    const k2 = rhs(ode, params, t + h / 2, y + h * k1 / 2);
    const k3 = rhs(ode, params, t + h / 2, y + h * k2 / 2);
    const k4 = rhs(ode, params, t + h, y + h * k3);
    return y + h * (k1 + 2 * k2 + 2 * k3 + k4) / 6;
  }

  /**
   * Fixed-step scalar initial-value solver.
   * Inputs: method 'euler'|'rk4'; ode 'decay'|'logistic'|
   * 't_minus_y'; params {lam} or {r,K} or {};
   * y0 (state units), h (s), steps (integer).
   * Output: y, exact, abs_error (state units).
   * Assumptions: autonomous decay/logistic or specified forced ODE;
   * fixed positive step and t0=0. Zero steps has zero error.
   * Errors: unsupported method/ODE, non-positive step, invalid
   * inputs or step cap, and non-finite intermediate results.
   * Hand check: decay lam=-1, y0=1, Euler h=0.1,
   * 2 steps: (1-0.1)^2=0.81;
   * exact=exp(-0.2)=0.8187307530779818;
   * absolute error=0.0087307530779818.
   */
  function ode_solve(input) {
    const q = input || {};
    const { method, ode, params, y0, h, steps } = q;
    if (!supportedMethod(method) || !supportedODE(ode)) {
      return error('NotSupported', 'ode_or_method_not_in_fixed_list');
    }
    const pError = checkODE(ode, params);
    if (pError) return pError;
    if (!finite(h) || h <= 0) {
      return error('MathError', 'step_size_must_be_positive');
    }
    if (!finite(y0)) {
      return error('ConstraintViolation', 'invalid_numeric_input');
    }
    const sError = validSteps(steps);
    if (sError) return sError;
    if (steps === 0) {
      return { y: y0, exact: y0, abs_error: 0 };
    }
    const tEnd = h * steps;
    if (!finite(tEnd)) {
      return error('ConstraintViolation', 'time_out_of_range');
    }
    let y = y0;
    for (let i = 0; i < steps; i++) {
      y = advance(method, ode, params, i * h, y, h);
      if (!finite(y)) {
        return error('RuntimeError', 'non_finite_intermediate');
      }
    }
    const exact = exactODE(ode, params, y0, tEnd);
    if (!finite(exact)) {
      return error('RuntimeError', 'non_finite_exact_solution');
    }
    const abs_error = Math.abs(y - exact);
    if (!finite(abs_error)) {
      return error('RuntimeError', 'non_finite_intermediate');
    }
    return { y, exact, abs_error };
  }

  /**
   * Observed convergence order for exponential decay/growth.
   * Inputs: method, lam (s^-1), T (s), h [h1,h2,h3] (s).
   * T/h must be an integer to floating-point tolerance.
   * Outputs: errors[] (state units), observed_order (dimensionless
   * or null when the logarithmic ratio is undefined).
   * Assumptions: y(0)=1, uniform fixed grids, final time T.
   * Errors: invalid steps, time, parameters, unsupported method.
   * Hand check: Euler, lam=-1, T=1, h=[1,0.5,0.25].
   * Numerical y=[0,0.25,0.31640625].
   * Exact=0.36787944117144233.
   * Errors=[0.36787944117144233,0.11787944117144233,
   * 0.05147319117144233].
   * Last-pair order=log(e2/e3)/log(2), approximately 1.195.
   */
  function convergence_order(input) {
    const q = input || {};
    const { method, lam, T, h } = q;
    if (!supportedMethod(method)) {
      return error('NotSupported', 'ode_or_method_not_in_fixed_list');
    }
    if (!finite(lam) || !finite(T) || T <= 0 ||
        !Array.isArray(h) || h.length !== 3) {
      return error('ConstraintViolation', 'invalid_convergence_input');
    }
    const errors = [];
    for (const hi of h) {
      if (!finite(hi) || hi <= 0) {
        return error('MathError', 'step_size_must_be_positive');
      }
      const n = Math.round(T / hi);
      if (!Number.isSafeInteger(n) || n < 1 ||
          Math.abs(n * hi - T) > 1e-9 * Math.max(1, T)) {
        return error('ConstraintViolation', 'time_not_divisible_by_step');
      }
      const result = ode_solve({
        method, ode: 'decay', params: { lam },
        y0: 1, h: hi, steps: n
      });
      if (result.error) return result;
      errors.push(result.abs_error);
    }
    if (!(h[0] > h[1] && h[1] > h[2])) {
      return error('ConstraintViolation', 'step_sizes_not_descending');
    }
    let observed_order = null;
    if (errors[1] > 0 && errors[2] > 0) {
      const den = Math.log(h[1] / h[2]);
      const value = Math.log(errors[1] / errors[2]) / den;
      if (finite(value) && den !== 0) observed_order = value;
    }
    return { errors, observed_order };
  }

  /**
   * Real-axis absolute stability of a one-step method.
   * Inputs: method, z=h*lambda (dimensionless real number).
   * Outputs: abs_R (dimensionless), stable (boolean).
   * Assumptions: scalar linear test equation and real z.
   * Errors: unsupported method, invalid z or overflow.
   * Hand check: Euler z=-2 has R=-1, |R|=1, stable=true;
   * RK4 z=-2 has R=1-2+2-8/6+16/24=1/3,
   * |R|=0.3333333333333333, stable=true.
   */
  function stability(input) {
    const q = input || {};
    const { method, z } = q;
    if (!supportedMethod(method)) {
      return error('NotSupported', 'ode_or_method_not_in_fixed_list');
    }
    if (!finite(z)) {
      return error('ConstraintViolation', 'invalid_numeric_input');
    }
    const R = method === 'euler'
      ? 1 + z
      : 1 + z + z * z / 2 +
        z * z * z / 6 + z * z * z * z / 24;
    if (!finite(R)) {
      return error('ConstraintViolation', 'amplification_overflow');
    }
    const abs_R = Math.abs(R);
    return { abs_R, stable: abs_R <= 1 };
  }

  /**
   * Periodic first-order upwind advection.
   * Inputs: u0[] (scalar cell values), courant=a*dt/dx
   * (dimensionless), steps (integer).
   * Outputs: u[], min, max, mass=sum(u), bounded (boolean).
   * Assumptions: a>0, periodic cells, simultaneous explicit
   * updates; initial minimum/maximum define the bounded range.
   * Errors: 2..100 cell cap, invalid inputs/steps, overflow.
   * Hand check: u0=[1,0,0,0], C=0.5, 2 steps.
   * Step 1=[0.5,0.5,0,0].
   * Step 2=[0.25,0.5,0.25,0].
   * mass=1, min=0, max=0.5, bounded=true.
   */
  function upwind_advect(input) {
    const q = input || {};
    const { u0, courant, steps } = q;
    if (!Array.isArray(u0) ||
        u0.length < 2 || u0.length > MAX_CELLS) {
      return error('ConstraintViolation', 'cells_out_of_range_2_100');
    }
    if (!u0.every(finite) || !finite(courant) || courant < 0) {
      return error('ConstraintViolation', 'invalid_advection_input');
    }
    const sError = validSteps(steps);
    if (sError) return sError;
    const initialMin = Math.min(...u0);
    const initialMax = Math.max(...u0);
    let u = u0.slice();
    let bounded = true;
    for (let n = 0; n < steps; n++) {
      const next = new Array(u.length);
      for (let j = 0; j < u.length; j++) {
        next[j] = u[j] -
          courant * (u[j] - u[(j + u.length - 1) % u.length]);
        if (!finite(next[j])) {
          return error('RuntimeError', 'non_finite_intermediate');
        }
        if (next[j] < initialMin - 1e-12 ||
            next[j] > initialMax + 1e-12) bounded = false;
      }
      u = next;
    }
    const min = Math.min(...u);
    const max = Math.max(...u);
    const mass = u.reduce((sum, value) => sum + value, 0);
    if (!finite(mass)) {
      return error('RuntimeError', 'non_finite_intermediate');
    }
    return {
      u, min, max, mass,
      bounded: bounded &&
        min >= initialMin - 1e-12 &&
        max <= initialMax + 1e-12
    };
  }

  /**
   * Two-level error order and Richardson extrapolation.
   * Inputs: h1,h2 (positive grid/time spacing in a common SI
   * unit), e1,e2 (positive errors in quantity units),
   * optional f1,f2 (approximations in quantity units).
   * Outputs: observed_order (dimensionless),
   * extrapolated (quantity units, null without both f values).
   * Assumptions: same asymptotic error law e=C*h^p.
   * Errors: non-positive errors or h1<=h2, incomplete values,
   * undefined extrapolation denominator or overflow.
   * Hand check: h1=0.2, e1=0.04, h2=0.1, e2=0.01,
   * f1=2.04, f2=2.01.
   * p=log(4)/log(2)=2.
   * f*=2.01+(2.01-2.04)/(4-1)=2.
   */
  function grid_convergence(input) {
    const q = input || {};
    const { h1, e1, h2, e2, f1, f2 } = q;
    if (![h1, h2, e1, e2].every(finite) ||
        h1 <= h2 || h2 <= 0 || e1 <= 0 || e2 <= 0) {
      return error(
        'MathError',
        'errors_must_be_positive_and_h1_gt_h2'
      );
    }
    const observed_order =
      Math.log(e1 / e2) / Math.log(h1 / h2);
    if (!finite(observed_order)) {
      return error('MathError', 'undefined_convergence_order');
    }
    const hasF1 = f1 !== undefined;
    const hasF2 = f2 !== undefined;
    if (hasF1 !== hasF2) {
      return error('ConstraintViolation', 'incomplete_extrapolation_data');
    }
    let extrapolated = null;
    if (hasF1) {
      if (!finite(f1) || !finite(f2)) {
        return error('ConstraintViolation', 'invalid_numeric_input');
      }
      const ratio = Math.pow(h1 / h2, observed_order);
      if (!finite(ratio)) {
        return error('MathError', 'undefined_extrapolation');
      }
      if (Math.abs(ratio - 1) < 1e-14) {
        return error('MathError', 'undefined_extrapolation');
      }
      extrapolated = f2 + (f2 - f1) / (ratio - 1);
      if (!finite(extrapolated)) {
        return error('MathError', 'undefined_extrapolation');
      }
    }
    return { observed_order, extrapolated };
  }

  /**
   * Vector of slopes at supplied time-state pairs.
   * Inputs: ode, params as in ode_solve; points:[[t_s,y],...].
   * Outputs: slopes[] in state units/s.
   * Assumptions: pointwise evaluation, not numerical integration.
   * Errors: unsupported ODE, invalid parameters or points,
   * more than 10000 points, non-finite slopes.
   * Hand check: t_minus_y at [[0,1],[1,2],[2,0]]
   * gives [-1,-1,2].
   */
  function slope_field(input) {
    const q = input || {};
    const { ode, params, points } = q;
    const pError = checkODE(ode, params);
    if (pError) return pError;
    if (!Array.isArray(points) || points.length > 10000) {
      return error('ConstraintViolation', 'points_out_of_range');
    }
    const slopes = [];
    for (const point of points) {
      if (!Array.isArray(point) || point.length !== 2 ||
          !point.every(finite)) {
        return error('ConstraintViolation', 'invalid_slope_point');
      }
      const v = rhs(ode, params, point[0], point[1]);
      if (!finite(v)) {
        return error('RuntimeError', 'non_finite_intermediate');
      }
      slopes.push(v);
    }
    return { slopes };
  }

  function validatePendulum(q, needDt, thetaValue) {
    if (!finite(q.L_m) || q.L_m <= 0) {
      return error('ConstraintViolation', 'length_must_be_positive');
    }
    const g = q.g_m_s2 === undefined ? 9.81 : q.g_m_s2;
    if (!finite(g)) {
      return error('ConstraintViolation', 'invalid_numeric_input');
    }
    if (g === 0) return error('MathError', 'gravity_zero');
    if (g < 0) {
      return error('ConstraintViolation', 'gravity_must_be_positive');
    }
    if (needDt) {
      if (!finite(q.dt_s) || q.dt_s === 0) {
        return error('MathError', 'dt_must_be_positive');
      }
      if (q.dt_s < 0) {
        return error('ConstraintViolation', 'dt_must_be_positive');
      }
    }
    if (thetaValue !== undefined) {
      if (!finite(thetaValue) || Math.abs(thetaValue) > PI) {
        return error('ConstraintViolation', 'theta0_out_of_range');
      }
    }
    return null;
  }

  function pendulumEnergy(L, g, theta, omega) {
    return L * L * omega * omega / 2 +
      g * L * (1 - Math.cos(theta));
  }

  /**
   * Small-amplitude pendulum period.
   * Inputs: L_m (m), optional g_m_s2 (m/s^2; default 9.81).
   * Output: period_s (s).
   * Assumptions: point mass, negligible damping, small angle.
   * Errors: non-positive L or g, overflow.
   * Hand check: L=1, g=9.81,
   * T=2*pi*sqrt(1/9.81)=2.0060666807106475 s.
   */
  function small_angle_period(input) {
    const q = input || {};
    const ve = validatePendulum(q, false);
    if (ve) return ve;
    const g = q.g_m_s2 === undefined ? 9.81 : q.g_m_s2;
    const period_s = 2 * PI * Math.sqrt(q.L_m / g);
    if (!finite(period_s)) {
      return error('RuntimeError', 'non_finite_intermediate');
    }
    return { period_s };
  }

  /**
   * Exact finite-amplitude period, using AGM for K(k).
   * Inputs: L_m (m), g_m_s2 (m/s^2, default 9.81),
   * theta0_rad (rad), omega0_rad_s (rad/s; must be zero).
   * Outputs: period_s (s|null), period_ratio (dimensionless|null),
   * regime ('at_rest','oscillatory','unstable_equilibrium').
   * Assumptions: undamped point mass released from rest;
   * modulus k=sin(|theta0|/2).
   * Errors: invalid physical inputs, unsupported non-rest release.
   * Hand check: theta0=pi/2, L=1, g=9.81:
   * k=sin(pi/4)=sqrt(1/2), AGM(1,sqrt(1/2))
   * gives K=1.8540746773013719;
   * T=4*K/sqrt(9.81), ratio=2*K/pi,
   * approximately 1.180340599016096.
   */
  function exact_pendulum_period(input) {
    const q = input || {};
    const ve = validatePendulum(q, false, q.theta0_rad);
    if (ve) return ve;
    const omega = q.omega0_rad_s === undefined
      ? 0 : q.omega0_rad_s;
    if (!finite(omega)) {
      return error('ConstraintViolation', 'invalid_numeric_input');
    }
    if (omega !== 0) {
      return error('NotSupported', 'period_requires_release_from_rest');
    }
    const basic = small_angle_period(q);
    if (basic.error) return basic;
    const aTheta = Math.abs(q.theta0_rad);
    if (aTheta === 0) {
      return {
        period_s: basic.period_s,
        period_ratio: 1,
        regime: 'at_rest'
      };
    }
    if (aTheta === PI) {
      return {
        period_s: null,
        period_ratio: null,
        regime: 'unstable_equilibrium'
      };
    }
    const k = Math.sin(aTheta / 2);
    let a = 1;
    let b = Math.sqrt((1 - k) * (1 + k));
    let count = 0;
    while (Math.abs(a - b) > 1e-15 * Math.max(a, b)) {
      const an = (a + b) / 2;
      b = Math.sqrt(a * b);
      a = an;
      count++;
      if (count > 100) {
        return error('RuntimeError', 'agm_iteration_cap');
      }
    }
    const K = PI / (2 * a);
    const period_ratio = 2 * K / PI;
    const period_s = basic.period_s * period_ratio;
    if (!finite(period_s) || !finite(period_ratio)) {
      return error('RuntimeError', 'non_finite_intermediate');
    }
    return { period_s, period_ratio, regime: 'oscillatory' };
  }

  function pendulumAdvance(method, L, g, theta, omega, dt) {
    if (method === 'euler') {
      return [
        theta + dt * omega,
        omega - dt * (g / L) * Math.sin(theta)
      ];
    }
    const f = (th, om) => [
      om,
      -(g / L) * Math.sin(th)
    ];
    const k1 = f(theta, omega);
    const k2 = f(
      theta + dt * k1[0] / 2,
      omega + dt * k1[1] / 2
    );
    const k3 = f(
      theta + dt * k2[0] / 2,
      omega + dt * k2[1] / 2
    );
    const k4 = f(
      theta + dt * k3[0],
      omega + dt * k3[1]
    );
    return [
      theta + dt *
        (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]) / 6,
      omega + dt *
        (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]) / 6
    ];
  }

  function pendulumStep(method, input) {
    const q = input || {};
    const ve = validatePendulum(q, true, q.theta_rad);
    if (ve) return ve;
    if (!finite(q.omega_rad_s)) {
      return error('ConstraintViolation', 'invalid_numeric_input');
    }
    const g = q.g_m_s2 === undefined ? 9.81 : q.g_m_s2;
    const before = pendulumEnergy(
      q.L_m, g, q.theta_rad, q.omega_rad_s
    );
    const next = pendulumAdvance(
      method, q.L_m, g, q.theta_rad, q.omega_rad_s, q.dt_s
    );
    const after = pendulumEnergy(q.L_m, g, next[0], next[1]);
    const change = after - before;
    if (![before, after, change, ...next].every(finite)) {
      return error('RuntimeError', 'non_finite_intermediate');
    }
    return {
      theta_next_rad: next[0],
      omega_next_rad_s: next[1],
      energy_next_J_kg: after,
      energy_before_J_kg: before,
      energy_change_J_kg: change,
      energy_increased: change > 0
    };
  }

  /**
   * One explicit Euler pendulum step.
   * Inputs: L_m, g_m_s2, theta_rad, omega_rad_s, dt_s.
   * Outputs: next theta/omega, energies in J/kg, change, boolean.
   * Assumptions: undamped nonlinear pendulum, explicit Euler.
   * Errors: L, g, dt, angle, state or overflow.
   * Hand check: L=1, g=10, theta=0, omega=1, dt=0.1.
   * Euler yields theta=0.1, omega=1.
   * E_before=0.5; E_after=0.5+10*(1-cos(0.1)).
   */
  function euler_step(input) {
    return pendulumStep('euler', input);
  }

  /**
   * One classical RK4 nonlinear pendulum step.
   * Inputs and outputs: same as euler_step, SI units.
   * Assumptions: same undamped two-state equations.
   * Errors: as euler_step.
   * Hand check: theta=0, omega=0, L=1, g=9.81,
   * dt=0.1 produces theta_next=0, omega_next=0,
   * both energies zero and energy_increased=false.
   */
  function rk4_step(input) {
    return pendulumStep('rk4', input);
  }

  function pendulumRun(method, input) {
    const q = input || {};
    const ve = validatePendulum(q, true, q.theta0_rad);
    if (ve) return ve;
    if (!finite(q.omega0_rad_s)) {
      return error('ConstraintViolation', 'invalid_numeric_input');
    }
    const se = validSteps(q.steps);
    if (se) return se;
    const g = q.g_m_s2 === undefined ? 9.81 : q.g_m_s2;
    let theta = q.theta0_rad;
    let omega = q.omega0_rad_s;
    const initialEnergy = pendulumEnergy(q.L_m, g, theta, omega);
    let previousEnergy = initialEnergy;
    let increasedEvery = q.steps > 0;
    for (let n = 0; n < q.steps; n++) {
      const next = pendulumAdvance(
        method, q.L_m, g, theta, omega, q.dt_s
      );
      theta = next[0];
      omega = next[1];
      const E = pendulumEnergy(q.L_m, g, theta, omega);
      if (![theta, omega, E].every(finite)) {
        return error('RuntimeError', 'non_finite_intermediate');
      }
      if (!(E > previousEnergy)) increasedEvery = false;
      previousEnergy = E;
    }
    const energy_ratio = initialEnergy === 0
      ? null : previousEnergy / initialEnergy;
    if (energy_ratio !== null && !finite(energy_ratio)) {
      return error('RuntimeError', 'non_finite_intermediate');
    }
    return {
      theta_final_rad: theta,
      omega_final_rad_s: omega,
      energy_ratio,
      energy_increased_every_step: increasedEvery
    };
  }

  /**
   * Fixed-step Euler pendulum trajectory.
   * Inputs: L_m, g_m_s2, theta0_rad, omega0_rad_s, dt_s,
   * steps. Output: final theta/omega, Efinal/Einitial,
   * energy_increased_every_step; ratio null for zero initial E.
   * Assumptions: point-mass, undamped, fixed positive time step.
   * Errors: invalid physical parameters, steps cap or overflow.
   * Hand check: L=1, g=10, theta0=0, omega0=1,
   * dt=0.1, steps=1 gives theta=0.1, omega=1,
   * energy_ratio=1+20*(1-cos(0.1)).
   */
  function euler_run(input) {
    return pendulumRun('euler', input);
  }

  /**
   * Fixed-step RK4 pendulum trajectory.
   * Inputs, units and outputs: as euler_run.
   * Assumptions: fourth-order classical RK for both state values.
   * Errors: as euler_run.
   * Hand check: L=1, g=9.81, theta0=0, omega0=0,
   * dt=0.1, steps=10: theta=omega=0, energy_ratio=null,
   * energy_increased_every_step=false.
   */
  function rk4_run(input) {
    return pendulumRun('rk4', input);
  }

  /**
   * Side-by-side Euler and RK4 fixed-step comparison.
   * Inputs: same as euler_run, SI units.
   * Outputs: Euler final theta, omega, energy ratio and
   * monotonic-energy flag; RK4 final theta, omega, ratio.
   * Assumptions: identical initial state and time grid.
   * Errors: as euler_run.
   * Hand check: L=1, g=9.81, theta0=0, omega0=0,
   * dt=0.1, steps=5: both states remain zero,
   * both energy ratios are null.
   */
  function euler_rk4_compare_run(input) {
    const a = euler_run(input);
    if (a.error) return a;
    const b = rk4_run(input);
    if (b.error) return b;
    return {
      euler_theta_rad: a.theta_final_rad,
      euler_omega_rad_s: a.omega_final_rad_s,
      euler_energy_ratio: a.energy_ratio,
      euler_energy_increased_every_step:
        a.energy_increased_every_step,
      rk4_theta_rad: b.theta_final_rad,
      rk4_omega_rad_s: b.omega_final_rad_s,
      rk4_energy_ratio: b.energy_ratio
    };
  }

  return Object.freeze({
    API_VERSION: 1,
    ode_solve,
    convergence_order,
    stability,
    upwind_advect,
    grid_convergence,
    slope_field,
    small_angle_period,
    exact_pendulum_period,
    euler_step,
    rk4_step,
    euler_run,
    rk4_run,
    euler_rk4_compare_run
  });
})();
/* FIT-CALC-END x6_numerical_stability */
export default FITCalcX6;
