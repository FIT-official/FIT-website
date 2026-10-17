/* FIT-CALC-BEGIN x7_diffusion */
const FITCalcX7 = (function () {
  'use strict';

  const API_VERSION = 1;
  const MAX_CELLS = 100;
  const MAX_STEPS = 10000;
  const STABILITY_SLACK = 1e-12;

  function error(errorClass, reason) {
    return { error: errorClass, reason };
  }

  function invalidInput() {
    return error('ConstraintViolation', 'input_must_be_finite');
  }

  function hasFiniteFields(p, keys) {
    return p !== null &&
      typeof p === 'object' &&
      keys.every(key =>
        typeof p[key] === 'number' && Number.isFinite(p[key])
      );
  }

  function finiteResult(value) {
    function valid(v) {
      if (v === null) return true;
      if (typeof v === 'number') return Number.isFinite(v);
      if (typeof v === 'boolean' || typeof v === 'string') return true;
      if (Array.isArray(v)) return v.every(valid);
      if (v && typeof v === 'object') {
        return Object.keys(v).every(k => valid(v[k]));
      }
      return false;
    }

    return valid(value)
      ? value
      : error('MathError', 'non_finite_result');
  }

  function nonNegative(value, reason) {
    return value < 0
      ? error('ConstraintViolation', reason)
      : null;
  }

  function positive(value, reason) {
    return value <= 0
      ? error('ConstraintViolation', reason)
      : null;
  }

  function sumCells(cells) {
    let sum = 0;
    for (let i = 0; i < cells.length; i++) sum += cells[i];
    return sum;
  }

  function cellMass(cells, dx) {
    return sumCells(cells) * dx;
  }

  function cellCentre(cells, dx) {
    let weighted = 0;
    let total = 0;

    for (let i = 0; i < cells.length; i++) {
      total += cells[i];
      weighted += (i + 0.5) * dx * cells[i];
    }

    return total === 0 ? null : weighted / total;
  }

  function peakIndex(cells) {
    let index = 0;
    for (let i = 1; i < cells.length; i++) {
      if (cells[i] > cells[index]) index = i;
    }
    return index;
  }

  /**
   * Two-film mass transfer: two positive film resistances in series.
   * Input: k1_m_s, k2_m_s (m/s).
   * Output: K_m_s (m/s), with 1/K = 1/k1 + 1/k2.
   * Assumptions: steady state; no additional interfacial resistance.
   * Errors: non-positive film coefficient, non-finite input/result.
   *
   * Hand check: k1 = 2 m/s, k2 = 3 m/s.
   * K = 1/(1/2 + 1/3) = 1.2 m/s.
   */
  function two_film_overall_coefficient(p) {
    if (!hasFiniteFields(p, ['k1_m_s', 'k2_m_s'])) {
      return invalidInput();
    }
    if (p.k1_m_s <= 0 || p.k2_m_s <= 0) {
      return error(
        'ConstraintViolation',
        'mass_transfer_coefficient_must_be_positive'
      );
    }

    return finiteResult({
      K_m_s: 1 / (1 / p.k1_m_s + 1 / p.k2_m_s)
    });
  }

  /**
   * Transverse diffusion across a microchannel.
   * Inputs: L_m (m), D_m2_s (m^2/s), u_m_s (m/s).
   * Outputs: diffusion_time_s (s), mixing_length_m (m).
   * Assumptions: constant diffusivity and mean axial velocity;
   * characteristic transverse diffusion time L^2/D.
   * Errors: negative D, zero D, non-finite input/result.
   *
   * Hand check: L = 0.002 m, D = 1e-9 m^2/s, u = 0.01 m/s.
   * t_D = 0.002^2/1e-9 = 4000 s; length = 40 m.
   */
  function microchannel_diffusion(p) {
    if (!hasFiniteFields(p, ['L_m', 'D_m2_s', 'u_m_s'])) {
      return invalidInput();
    }

    const badD = nonNegative(p.D_m2_s, 'd_must_be_non_negative');
    if (badD) return badD;
    if (p.D_m2_s === 0) return error('MathError', 'd_zero');
    if (p.L_m < 0) {
      return error('ConstraintViolation', 'length_must_be_non_negative');
    }

    const t = p.L_m * p.L_m / p.D_m2_s;

    return finiteResult({
      diffusion_time_s: t,
      mixing_length_m: p.u_m_s * t
    });
  }

  /**
   * Steady one-dimensional membrane diffusion.
   * Inputs: D_m2_s (m^2/s), C_left and C_right (mol/m^3),
   * thickness_m (m), partition (dimensionless).
   * Output: flux (mol/(m^2 s)), positive left to right.
   * Assumptions: Fick's first law, constant D, steady linear
   * profile, identical partition factor applied at both faces.
   * Errors: zero/negative thickness, negative D or partition,
   * non-finite input/result.
   *
   * Hand check: D = 2e-9, C_left = 5, C_right = 1,
   * thickness = 0.002, partition = 0.5.
   * J = 2e-9 * 0.5 * 4 / 0.002 = 2e-6 mol/(m^2 s).
   */
  function membrane_steady_flux(p) {
    if (!hasFiniteFields(
      p,
      ['D_m2_s', 'C_left', 'C_right', 'thickness_m', 'partition']
    )) return invalidInput();

    const badD = nonNegative(p.D_m2_s, 'd_must_be_non_negative');
    if (badD) return badD;

    if (p.thickness_m === 0) {
      return error('MathError', 'thickness_zero');
    }
    if (p.thickness_m < 0) {
      return error('ConstraintViolation', 'thickness_must_be_positive');
    }
    if (p.partition < 0) {
      return error('ConstraintViolation', 'partition_must_be_non_negative');
    }

    return finiteResult({
      flux: p.D_m2_s * p.partition *
        (p.C_left - p.C_right) / p.thickness_m
    });
  }

  /**
   * Steady diffusion profile along a slab.
   * Inputs: D_m2_s (m^2/s), length_m and x_m (m),
   * C_left and C_right (mol/m^3).
   * Outputs: concentration (mol/m^3), flux (mol/(m^2 s)).
   * Assumptions: constant D, steady state, linear concentration.
   * Errors: zero/negative length, x outside [0,length],
   * negative D, non-finite input/result.
   *
   * Hand check: L = 0.1 m, x = 0.025 m,
   * C_left = 10, C_right = 2, D = 1e-9.
   * C(x) = 8 mol/m^3; J = 8e-8 mol/(m^2 s).
   */
  function scaffold_steady_diffusion(p) {
    if (!hasFiniteFields(
      p,
      ['D_m2_s', 'length_m', 'C_left', 'C_right', 'x_m']
    )) return invalidInput();

    const badD = nonNegative(p.D_m2_s, 'd_must_be_non_negative');
    if (badD) return badD;

    if (p.length_m === 0) {
      return error('MathError', 'thickness_zero');
    }
    if (p.length_m < 0) {
      return error('ConstraintViolation', 'thickness_must_be_positive');
    }
    if (p.x_m < 0 || p.x_m > p.length_m) {
      return error('ConstraintViolation', 'x_out_of_range');
    }

    return finiteResult({
      concentration: p.C_left +
        (p.C_right - p.C_left) * p.x_m / p.length_m,
      flux: p.D_m2_s *
        (p.C_left - p.C_right) / p.length_m
    });
  }

  /**
   * Advective motion of a tracer centre.
   * Inputs: u_m_s (m/s), initial_centre_m (m), time_s (s),
   * D_m2_s (m^2/s).
   * Outputs: centre_m and displacement_m (m).
   * Assumptions: constant uniform flow; diffusion broadens
   * the tracer without changing its centre.
   * Errors: negative time or D, non-finite input/result.
   *
   * Hand check: x0 = 2 m, u = 0.4 m/s, t = 5 s, D = 0.01.
   * Displacement = 2 m; centre = 4 m.
   */
  function advect_tracer_centre(p) {
    if (!hasFiniteFields(
      p,
      ['u_m_s', 'initial_centre_m', 'time_s', 'D_m2_s']
    )) return invalidInput();

    const badD = nonNegative(p.D_m2_s, 'd_must_be_non_negative');
    if (badD) return badD;
    const badTime = nonNegative(p.time_s, 'time_must_be_non_negative');
    if (badTime) return badTime;

    const displacement = p.u_m_s * p.time_s;

    return finiteResult({
      centre_m: p.initial_centre_m + displacement,
      displacement_m: displacement
    });
  }

  /**
   * Gaussian solution for an instantaneous plane tracer release.
   * Inputs: mass_per_area_mol_m2 (mol/m^2), D_m2_s (m^2/s),
   * u_m_s (m/s), time_s (s), x_m (m).
   * Outputs: concentration (mol/m^3), centre_m (m).
   * Assumptions: infinite 1-D domain, constant D and u,
   * instantaneous plane release at x=0 and t=0.
   * Errors: zero/negative D, zero/negative time, negative mass,
   * non-finite input/result.
   *
   * Hand check: M = 1 mol/m^2, D = 1 m^2/s, u = 0,
   * t = 1 s, x = 0. C = 1/sqrt(4*pi) = 0.2820947918
   * mol/m^3; centre = 0 m.
   */
  function gaussian_pulse(p) {
    if (!hasFiniteFields(
      p,
      ['mass_per_area_mol_m2', 'D_m2_s', 'u_m_s', 'time_s', 'x_m']
    )) return invalidInput();

    const badD = nonNegative(p.D_m2_s, 'd_must_be_non_negative');
    if (badD) return badD;
    if (p.D_m2_s === 0) return error('MathError', 'd_zero');

    const badTime = nonNegative(p.time_s, 'time_must_be_non_negative');
    if (badTime) return badTime;
    if (p.time_s === 0) return error('MathError', 'time_zero');

    if (p.mass_per_area_mol_m2 < 0) {
      return error('ConstraintViolation', 'mass_must_be_non_negative');
    }

    const centre = p.u_m_s * p.time_s;
    const varianceFactor = 4 * p.D_m2_s * p.time_s;
    const distance = p.x_m - centre;

    const concentration =
      p.mass_per_area_mol_m2 /
      Math.sqrt(Math.PI * varianceFactor) *
      Math.exp(-distance * distance / varianceFactor);

    return finiteResult({
      concentration,
      centre_m: centre
    });
  }

  /**
   * Signed Péclet number, comparing advection with diffusion.
   * Inputs: u_m_s (m/s), length_m (m), D_m2_s (m^2/s).
   * Output: Pe (dimensionless).
   * Assumptions: single characteristic length, uniform velocity.
   * Errors: zero/negative D, negative length, non-finite result.
   *
   * Hand check: u = 0.1 m/s, L = 2 m, D = 0.05 m^2/s.
   * Pe = 0.1*2/0.05 = 4.
   */
  function peclet_number(p) {
    if (!hasFiniteFields(p, ['u_m_s', 'length_m', 'D_m2_s'])) {
      return invalidInput();
    }

    const badD = nonNegative(p.D_m2_s, 'd_must_be_non_negative');
    if (badD) return badD;
    if (p.D_m2_s === 0) return error('MathError', 'd_zero');
    if (p.length_m < 0) {
      return error('ConstraintViolation', 'length_must_be_non_negative');
    }

    return finiteResult({
      Pe: p.u_m_s * p.length_m / p.D_m2_s
    });
  }

  /**
   * Complete mixing at a river outfall.
   * Inputs: Q_river_m3_s and Q_effluent_m3_s (m^3/s),
   * C_river_mg_L and C_effluent_mg_L (mg/L).
   * Output: concentration_mg_L (mg/L).
   * Assumptions: steady flows, conservative solute, complete
   * instantaneous mixing, no other sources or sinks.
   * Errors: negative flow, zero total flow, non-finite result.
   *
   * Hand check: river Q=9, C=2; effluent Q=1, C=12.
   * Mixed C=(9*2+1*12)/10=3 mg/L.
   */
  function river_complete_mix(p) {
    if (!hasFiniteFields(
      p,
      [
        'Q_river_m3_s', 'C_river_mg_L',
        'Q_effluent_m3_s', 'C_effluent_mg_L'
      ]
    )) return invalidInput();

    if (p.Q_river_m3_s < 0 || p.Q_effluent_m3_s < 0) {
      return error('ConstraintViolation', 'flow_must_be_non_negative');
    }

    const total = p.Q_river_m3_s + p.Q_effluent_m3_s;
    if (total === 0) return error('MathError', 'total_flow_zero');

    return finiteResult({
      concentration_mg_L:
        (p.Q_river_m3_s * p.C_river_mg_L +
          p.Q_effluent_m3_s * p.C_effluent_mg_L) / total
    });
  }

  /**
   * Well-mixed lake with throughflow and first-order decay.
   * Inputs: V_m3 (m^3), Q_m3_s (m^3/s), C_in and C_initial
   * (mol/m^3), k_per_s (s^-1), time_s (s).
   * Outputs: flushing_time_s (s or null),
   * steady_concentration (mol/m^3 or null),
   * concentration (mol/m^3).
   * Assumptions: constant volume, inflow equals outflow,
   * perfect mixing, constant inputs, first-order removal.
   * Q=0 gives null flushing time. Q=k=0 gives null steady
   * concentration and unchanged initial concentration.
   * Errors: non-positive V, negative Q/k/time, non-finite result.
   *
   * Hand check: V=100 m^3, Q=10 m^3/s, k=0.02 s^-1,
   * C_in=10, C_initial=20, t=10 s.
   * tau=10 s; C*=10*(0.1/0.12)=8.333333333333334.
   * C(10)=C*+(20-C*)*exp(-1.2).
   */
  function lake_flushing(p) {
    if (!hasFiniteFields(
      p,
      ['V_m3', 'Q_m3_s', 'C_in', 'C_initial', 'k_per_s', 'time_s']
    )) return invalidInput();

    if (p.V_m3 <= 0) {
      return error('ConstraintViolation', 'volume_must_be_positive');
    }
    if (p.Q_m3_s < 0) {
      return error('ConstraintViolation', 'flow_must_be_non_negative');
    }
    if (p.k_per_s < 0) {
      return error('ConstraintViolation', 'k_must_be_non_negative');
    }
    if (p.time_s < 0) {
      return error('ConstraintViolation', 'time_must_be_non_negative');
    }

    const flushing = p.Q_m3_s === 0
      ? null
      : p.V_m3 / p.Q_m3_s;

    const flowRate = p.Q_m3_s / p.V_m3;
    const removalRate = flowRate + p.k_per_s;

    if (removalRate === 0) {
      return finiteResult({
        flushing_time_s: null,
        steady_concentration: null,
        concentration: p.C_initial
      });
    }

    const steady = p.C_in * flowRate / removalRate;

    return finiteResult({
      flushing_time_s: flushing,
      steady_concentration: steady,
      concentration:
        steady + (p.C_initial - steady) *
        Math.exp(-removalRate * p.time_s)
    });
  }

  /**
   * Steady diffusion-decay morphogen gradient on a half-line.
   * Inputs: D_m2_s (m^2/s), k_per_s (s^-1),
   * C0 (mol/m^3), x_m (m).
   * Outputs: lambda_m (m), concentration (mol/m^3).
   * Assumptions: D*C''=k*C, C(0)=C0, C(infinity)=0,
   * spatially uniform diffusion and first-order removal.
   * Errors: zero/negative k, zero/negative D,
   * negative x, non-finite input/result.
   *
   * Hand check: D=4 m^2/s, k=1 s^-1, C0=10, x=2 m.
   * lambda=2 m; C=10*exp(-1)=3.6787944117 mol/m^3.
   */
  function morphogen_gradient(p) {
    if (!hasFiniteFields(p, ['D_m2_s', 'k_per_s', 'C0', 'x_m'])) {
      return invalidInput();
    }

    if (p.k_per_s < 0) {
      return error('ConstraintViolation', 'k_must_be_positive');
    }
    if (p.k_per_s === 0) return error('MathError', 'k_zero');

    const badD = nonNegative(p.D_m2_s, 'd_must_be_non_negative');
    if (badD) return badD;
    if (p.D_m2_s === 0) return error('MathError', 'd_zero');

    if (p.x_m < 0) {
      return error('ConstraintViolation', 'x_must_be_non_negative');
    }

    const lambda = Math.sqrt(p.D_m2_s / p.k_per_s);

    return finiteResult({
      lambda_m: lambda,
      concentration: p.C0 * Math.exp(-p.x_m / lambda)
    });
  }

  /**
   * Shared validation for the two explicit finite-volume schemes.
   * Input: p containing cells (mol/m^3), dx_m (m), dt_s (s),
   * either D_m2_s (m^2/s) or u_m_s (m/s), and boundary (string).
   * Output: { r } or { courant }, or a schema error.
   * Assumptions: 1-D equal-width cells, constant coefficients.
   * Order: cell count, dx, dt, coefficient, boundary, stability.
   * Errors: too_many_cells, too_few_cells, dx_zero,
   * dx_must_be_positive, dt_must_be_positive,
   * d_must_be_non_negative, velocity_must_be_non_negative,
   * boundary_not_supported, scheme-specific stability reason.
   *
   * Hand checks: D=1, dx=1, dt=0.5 gives r=0.5 accepted.
   * u=1, dx=1, dt=1 gives Co=1 accepted.
   */
  function validateGrid(p, scheme) {
    const cells = p && p.cells;
    const n = Array.isArray(cells) ? cells.length : 0;

    if (n > MAX_CELLS) {
      return error('ConstraintViolation', 'too_many_cells');
    }
    if (n < 2) {
      return error('ConstraintViolation', 'too_few_cells');
    }

    if (!hasFiniteFields(p, ['dx_m'])) return invalidInput();

    if (p.dx_m === 0) return error('MathError', 'dx_zero');
    if (p.dx_m < 0) {
      return error('ConstraintViolation', 'dx_must_be_positive');
    }

    if (!hasFiniteFields(p, ['dt_s'])) return invalidInput();

    if (p.dt_s === 0) {
      return error('MathError', 'dt_must_be_positive');
    }
    if (p.dt_s < 0) {
      return error('ConstraintViolation', 'dt_must_be_positive');
    }

    const coefficient = scheme === 'diffusion'
      ? 'D_m2_s'
      : 'u_m_s';

    if (!hasFiniteFields(p, [coefficient])) return invalidInput();

    if (scheme === 'diffusion' && p.D_m2_s < 0) {
      return error('ConstraintViolation', 'd_must_be_non_negative');
    }
    if (scheme === 'advection' && p.u_m_s < 0) {
      return error(
        'ConstraintViolation',
        'velocity_must_be_non_negative'
      );
    }

    const requiredBoundary = scheme === 'diffusion'
      ? 'zero_flux'
      : 'zero_gradient_outflow';

    if (p.boundary !== requiredBoundary) {
      return error('NotSupported', 'boundary_not_supported');
    }

    if (!cells.every(v =>
      typeof v === 'number' && Number.isFinite(v)
    )) return invalidInput();

    if (scheme === 'diffusion') {
      const r = p.D_m2_s * p.dt_s / (p.dx_m * p.dx_m);

      if (!Number.isFinite(r)) {
        return error('MathError', 'non_finite_result');
      }
      if (r > 0.5 * (1 + STABILITY_SLACK)) {
        return error(
          'ConstraintViolation',
          'ftcs_unstable_r_gt_0_5'
        );
      }
      return { r };
    }

    const courant = p.u_m_s * p.dt_s / p.dx_m;

    if (!Number.isFinite(courant)) {
      return error('MathError', 'non_finite_result');
    }
    if (courant > 1 * (1 + STABILITY_SLACK)) {
      return error(
        'ConstraintViolation',
        'upwind_unstable_courant_gt_1'
      );
    }

    return { courant };
  }

  function diffusionAdvance(cells, r) {
    const next = new Array(cells.length);

    for (let i = 0; i < cells.length; i++) {
      const left = i === 0 ? cells[i] : cells[i - 1];
      const right = i === cells.length - 1
        ? cells[i]
        : cells[i + 1];

      next[i] = cells[i] + r * (right - 2 * cells[i] + left);
    }
    return next;
  }

  function advectionAdvance(cells, courant, inflow) {
    const next = new Array(cells.length);

    for (let i = 0; i < cells.length; i++) {
      const left = i === 0 ? inflow : cells[i - 1];
      next[i] = cells[i] - courant * (cells[i] - left);
    }

    return next;
  }

  /**
   * One FTCS diffusion step with zero-flux end faces.
   * Inputs: D_m2_s (m^2/s), dx_m (m), dt_s (s),
   * cells[] (mol/m^3), boundary='zero_flux'.
   * Outputs: r (dimensionless), cells[] (mol/m^3),
   * mass_before and mass_after (mol/m^2), stable (boolean).
   * Assumptions: explicit 1-D diffusion, mirror ghost cells,
   * constant D and equal cell widths; stable when r<=0.5.
   * Errors: shared grid errors; r>0.5 rejected before update.
   *
   * Hand check: cells=[0,10,0], D=dx=1, dt=0.25.
   * r=0.25, next=[2.5,5,2.5], mass=10 before and after.
   */
  function ftcs_diffusion_step(p) {
    const validation = validateGrid(p, 'diffusion');
    if (validation.error) return validation;

    const next = diffusionAdvance(p.cells, validation.r);

    return finiteResult({
      r: validation.r,
      cells: next,
      mass_before: cellMass(p.cells, p.dx_m),
      mass_after: cellMass(next, p.dx_m),
      stable: true
    });
  }

  /**
   * Multiple FTCS diffusion steps with optional final-cell probes.
   * Inputs: D_m2_s (m^2/s), dx_m (m), dt_s (s),
   * steps (integer, 0..10000), cells[] (mol/m^3),
   * boundary='zero_flux', report_cells? (array of indices).
   * Outputs: r, final cells[], mass_before, mass_after,
   * stable, report_values (array or null).
   * Mass units: mol/m^2; r dimensionless.
   * Assumptions: explicit 1-D diffusion, no flux at both ends.
   * Errors: shared grid errors, steps_out_of_range_0_10000,
   * report_cell_out_of_range, non-finite intermediate result.
   *
   * Hand check: [0,10,0], D=dx=1, dt=0.25, steps=2,
   * report_cells=[1]. Final=[3.125,3.75,3.125];
   * r=0.25, report_values=[3.75], mass_before=mass_after=10.
   */
  function ftcs_diffusion_run(p) {
    const validation = validateGrid(p, 'diffusion');
    if (validation.error) return validation;

    if (
      !Number.isInteger(p.steps) ||
      p.steps < 0 ||
      p.steps > MAX_STEPS
    ) {
      return error(
        'ConstraintViolation',
        'steps_out_of_range_0_10000'
      );
    }

    if (p.report_cells !== undefined) {
      if (
        !Array.isArray(p.report_cells) ||
        !p.report_cells.every(i =>
          Number.isInteger(i) && i >= 0 && i < p.cells.length
        )
      ) {
        return error(
          'ConstraintViolation',
          'report_cell_out_of_range'
        );
      }
    }

    const before = cellMass(p.cells, p.dx_m);
    let current = p.cells.slice();

    for (let step = 0; step < p.steps; step++) {
      current = diffusionAdvance(current, validation.r);
      if (!current.every(Number.isFinite)) {
        return error('RuntimeError', 'non_finite_intermediate');
      }
    }

    const reportValues = p.report_cells === undefined
      ? null
      : p.report_cells.map(i => current[i]);

    return finiteResult({
      r: validation.r,
      cells: current,
      mass_before: before,
      mass_after: cellMass(current, p.dx_m),
      stable: true,
      report_values: reportValues
    });
  }

  /**
   * One positive-velocity first-order upwind advection step.
   * Inputs: u_m_s (m/s), dx_m (m), dt_s (s),
   * cells[] and inflow_concentration (mol/m^3),
   * boundary='zero_gradient_outflow'.
   * Outputs: courant (dimensionless), cells[], stable.
   * Assumptions: 1-D, constant non-negative velocity,
   * specified left inflow, right-side free outflow; Co<=1.
   * Errors: shared grid errors, negative velocity,
   * missing/non-finite inflow, Co>1.
   *
   * Hand check: cells=[0,4,0], inflow=0, u=dx=1, dt=0.5.
   * Co=0.5, final cells=[0,2,2].
   */
  function upwind_advection_step(p) {
    const validation = validateGrid(p, 'advection');
    if (validation.error) return validation;

    if (!hasFiniteFields(p, ['inflow_concentration'])) {
      return invalidInput();
    }

    const next = advectionAdvance(
      p.cells,
      validation.courant,
      p.inflow_concentration
    );

    return finiteResult({
      courant: validation.courant,
      cells: next,
      stable: true
    });
  }

  /**
   * Repeated first-order upwind advection with diagnostics.
   * Inputs: u_m_s (m/s), dx_m (m), dt_s (s),
   * steps (integer, 0..10000), cells[] and
   * inflow_concentration (mol/m^3),
   * boundary='zero_gradient_outflow'.
   * Outputs: courant, cells[], elapsed_s (s),
   * centre_before_m, centre_after_m, displacement_m (m or null),
   * mass_before, mass_after (mol/m^2), peak_cell (index).
   * Centres use concentration-weighted cell-centre positions;
   * a zero-total-concentration state has centre=null.
   * Assumptions: 1-D, uniform positive-direction velocity,
   * fixed left inflow and unrestricted right-side outflow.
   * Errors: shared grid errors, steps_out_of_range_0_10000,
   * invalid inflow, non-finite intermediate/result.
   *
   * Hand check: cells=[0,4,0,0], inflow=0, u=dx=1,
   * dt=0.5, steps=2. Final=[0,1,2,1], Co=0.5.
   * Centre moves from 1.5 to 2.5 m, displacement=1 m.
   * Mass remains 4 mol/m^2, peak_cell=2.
   */
  function upwind_advection_run(p) {
    const validation = validateGrid(p, 'advection');
    if (validation.error) return validation;

    if (
      !Number.isInteger(p.steps) ||
      p.steps < 0 ||
      p.steps > MAX_STEPS
    ) {
      return error(
        'ConstraintViolation',
        'steps_out_of_range_0_10000'
      );
    }

    if (!hasFiniteFields(p, ['inflow_concentration'])) {
      return invalidInput();
    }

    const before = cellCentre(p.cells, p.dx_m);
    const massBefore = cellMass(p.cells, p.dx_m);
    let current = p.cells.slice();

    for (let step = 0; step < p.steps; step++) {
      current = advectionAdvance(
        current,
        validation.courant,
        p.inflow_concentration
      );

      if (!current.every(Number.isFinite)) {
        return error('RuntimeError', 'non_finite_intermediate');
      }
    }

    const after = cellCentre(current, p.dx_m);

    return finiteResult({
      courant: validation.courant,
      cells: current,
      elapsed_s: p.steps * p.dt_s,
      centre_before_m: before,
      centre_after_m: after,
      displacement_m:
        before === null || after === null ? null : after - before,
      mass_before: massBefore,
      mass_after: cellMass(current, p.dx_m),
      peak_cell: peakIndex(current)
    });
  }

  return Object.freeze({
    API_VERSION,
    two_film_overall_coefficient,
    microchannel_diffusion,
    membrane_steady_flux,
    scaffold_steady_diffusion,
    advect_tracer_centre,
    gaussian_pulse,
    peclet_number,
    river_complete_mix,
    lake_flushing,
    morphogen_gradient,
    ftcs_diffusion_step,
    ftcs_diffusion_run,
    upwind_advection_step,
    upwind_advection_run
  });
})();
/* FIT-CALC-END x7_diffusion */
export default FITCalcX7;
