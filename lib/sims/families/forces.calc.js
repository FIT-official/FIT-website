/* FIT-CALC-BEGIN forces */
const FITCalcForces = (function () {
  'use strict';

  const EPS = 1e-9;
  const SNAP = 1e-12;
  const RAD = Math.PI / 180;

  function err(error, reason) {
    const e = new Error(reason);
    e.fitError = error;
    e.reason = reason;
    throw e;
  }

  function num(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      err('ConstraintViolation', 'invalid_number');
    }
    return v;
  }

  function obj(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      err('ConstraintViolation', 'invalid_input');
    }
    return v;
  }

  function opt(v, fallback) {
    return v == null ? fallback : num(v);
  }

  function nonneg(v, reason) {
    if (v == null) err('ConstraintViolation', reason);
    v = num(v);
    if (v < 0) err('ConstraintViolation', reason);
    return v;
  }

  function pos(v, reason) {
    if (v == null) err('ConstraintViolation', reason);
    v = num(v);
    if (v <= 0) err('ConstraintViolation', reason);
    return v;
  }

  function range(v, lo, hi, reason) {
    v = num(v);
    if (v < lo || v > hi) err('ConstraintViolation', reason);
    return v;
  }

  function grav(v) {
    v = opt(v, 9.81);
    if (v <= 0) err('MathError', 'gravity_must_be_positive');
    return v;
  }

  function arr(v, max, reason, min) {
    if (!Array.isArray(v)) {
      err('ConstraintViolation', 'invalid_array');
    }
    if (v.length > max || v.length < (min || 0)) {
      err('ConstraintViolation', reason);
    }
    return v;
  }

  function snap(v, tolerance) {
    return Math.abs(v) < tolerance ? 0 : v;
  }

  function finite(v) {
    if (typeof v === 'number' && !Number.isFinite(v)) {
      err('MathError', 'non_finite_result');
    }
    if (v && typeof v === 'object') {
      Object.keys(v).forEach(k => finite(v[k]));
    }
    return v;
  }

  function safe(fn) {
    try {
      return finite(fn());
    } catch (e) {
      return e && e.fitError
        ? { error: e.fitError, reason: e.reason }
        : { error: 'RuntimeError', reason: 'calculation_failed' };
    }
  }

  function loadsOf(v) {
    return arr(v, 10, 'loads_exceed_10').map(a => {
      obj(a);
      return {
        force_N: nonneg(a.force_N, 'negative_load'),
        position_m: num(a.position_m)
      };
    });
  }

  function balanceCore(o) {
    obj(o);
    const p = num(o.pivot_m);
    const loads = loadsOf(o.loads);
    const w = nonneg(opt(o.beam_weight_N, 0), 'negative_load');
    const cg = opt(o.cg_m, p);

    let cw = 0;
    let acw = 0;
    let reaction = 0;

    function add(force, x) {
      const m = force * (x - p);
      if (m >= 0) cw += m;
      else acw -= m;
      reaction += force;
    }

    loads.forEach(a => add(a.force_N, a.position_m));
    add(w, cg);

    const net = snap(cw - acw, EPS);
    const tips = net > 0
      ? 'clockwise'
      : net < 0
        ? 'anticlockwise'
        : 'none';

    return {
      clockwise_N_m: cw,
      anticlockwise_N_m: acw,
      net_N_m: net,
      balanced: tips === 'none',
      tips,
      reaction_N: reaction
    };
  }

  function beamCore(o) {
    obj(o);
    const span = pos(o.span_m, 'span_not_positive');
    const points = arr(o.point_loads, 10, 'loads_exceed_10')
      .map(a => {
        obj(a);
        const force = nonneg(a.force_N, 'negative_load');
        const x = num(a.position_m);

        if (x < 0 || x > span) {
          err('ConstraintViolation', 'load_outside_span');
        }

        return { force_N: force, position_m: x };
      })
      .sort((a, b) => a.position_m - b.position_m);

    const udl = nonneg(opt(o.udl_N_per_m, 0), 'negative_load');

    let total = udl * span;
    let aboutA = udl * span * span / 2;

    points.forEach(a => {
      total += a.force_N;
      aboutA += a.force_N * a.position_m;
    });

    const RB = aboutA / span;
    const RA = total - RB;

    function momentAt(x) {
      let m = RA * x - udl * x * x / 2;

      points.forEach(a => {
        if (a.position_m < x) {
          m -= a.force_N * (x - a.position_m);
        }
      });

      return snap(m, EPS);
    }

    return {
      span,
      points,
      udl,
      RA,
      RB,
      momentAt
    };
  }

  const K = Object.freeze({
    solid_disc: 0.5,
    hoop: 1,
    solid_sphere: 0.4,
    hollow_sphere: 2 / 3
  });

  function shapeK(shape, canSlide) {
    if (canSlide && shape === 'block_frictionless') {
      return 0;
    }

    if (canSlide && shape === 'rod_centre') {
      err('NotSupported', 'shape_cannot_roll');
    }

    if (!Object.prototype.hasOwnProperty.call(K, shape)) {
      err('NotSupported', 'shape_not_supported');
    }

    return K[shape];
  }

  /**
   * Weight in a uniform gravitational field.
   *
   * Input:
   *   mass_kg >= 0
   *   g_m_s2 > 0 (optional, default 9.81)
   *
   * Output:
   *   weight_N
   *
   * Errors:
   *   ConstraintViolation / negative_mass
   *   MathError / gravity_must_be_positive
   *
   * Hand check:
   *   2.5 kg at g = 10 m/s2 gives 25 N.
   */
  function weight(o) {
    return safe(() => {
      obj(o);
      const g = grav(o.g_m_s2);

      return {
        weight_N: nonneg(o.mass_kg, 'negative_mass') * g
      };
    });
  }

  /**
   * Ideal Hooke's-law spring within its proportionality limit.
   *
   * Inputs:
   *   k_N_per_m > 0
   *   load_N >= 0
   *   limit_N >= 0 (optional)
   *
   * Outputs:
   *   extension_m
   *   within_limit
   *
   * Above the specified limit, within_limit is false and
   * extension_m is null; linear extrapolation is not valid.
   *
   * Errors:
   *   ConstraintViolation / spring_constant_not_positive
   *   ConstraintViolation / negative_load
   *   ConstraintViolation / negative_limit
   *
   * Hand check:
   *   30 N / 200 N/m = 0.15 m.
   */
  function spring(o) {
    return safe(() => {
      obj(o);

      const k = pos(
        o.k_N_per_m,
        'spring_constant_not_positive'
      );
      const f = nonneg(o.load_N, 'negative_load');
      const limit = o.limit_N == null
        ? null
        : nonneg(o.limit_N, 'negative_limit');

      if (limit !== null && f > limit) {
        return {
          extension_m: null,
          within_limit: false
        };
      }

      return {
        extension_m: f / k,
        within_limit: true
      };
    });
  }

  /**
   * Sum of 1–10 coplanar force vectors.
   *
   * Inputs:
   *   forces: array of { magnitude_N, direction_deg }
   *   magnitude_N >= 0
   *   direction_deg measured anticlockwise from +x
   *
   * Outputs:
   *   Rx_N
   *   Ry_N
   *   magnitude_N
   *   direction_deg: [0,360), or null if balanced
   *   balanced
   *
   * Errors:
   *   ConstraintViolation / forces_out_of_range_1_10
   *   ConstraintViolation / negative_magnitude
   *
   * Hand check:
   *   3 N east + 4 N north -> 5 N at 53.1301023542 degrees.
   */
  function resultant(o) {
    return safe(() => {
      obj(o);

      const forces = arr(
        o.forces,
        10,
        'forces_out_of_range_1_10',
        1
      );

      let x = 0;
      let y = 0;

      forces.forEach(a => {
        obj(a);

        const f = nonneg(
          a.magnitude_N,
          'negative_magnitude'
        );
        const t = num(a.direction_deg) * RAD;

        x += f * Math.cos(t);
        y += f * Math.sin(t);
      });

      x = snap(x, SNAP);
      y = snap(y, SNAP);

      const magnitude = Math.hypot(x, y);

      if (magnitude < EPS) {
        return {
          Rx_N: x,
          Ry_N: y,
          magnitude_N: 0,
          direction_deg: null,
          balanced: true
        };
      }

      const direction = (
        Math.atan2(y, x) / RAD + 360
      ) % 360;

      return {
        Rx_N: x,
        Ry_N: y,
        magnitude_N: magnitude,
        direction_deg: snap(direction, SNAP),
        balanced: false
      };
    });
  }

  /**
   * Horizontal motion from rest with limiting static friction.
   *
   * Assumption:
   *   Once moving, friction has the same magnitude as the
   *   limiting static friction. All forces are horizontal.
   *
   * Inputs:
   *   mass_kg > 0
   *   applied_N >= 0
   *   friction_max_N >= 0
   *
   * Outputs:
   *   friction_N
   *   net_N
   *   acceleration_m_s2
   *   moves
   *
   * Errors:
   *   ConstraintViolation / mass_not_positive
   *   ConstraintViolation / negative_force
   *
   * Hand check:
   *   12 N push, 4 N friction, 2 kg -> 4 m/s2.
   */
  function dynamics(o) {
    return safe(() => {
      obj(o);

      const m = pos(o.mass_kg, 'mass_not_positive');
      const applied = nonneg(
        o.applied_N,
        'negative_force'
      );
      const limit = nonneg(
        o.friction_max_N,
        'negative_force'
      );

      if (applied - limit <= EPS) {
        return {
          friction_N: applied,
          net_N: 0,
          acceleration_m_s2: 0,
          moves: false
        };
      }

      const net = applied - limit;

      return {
        friction_N: limit,
        net_N: net,
        acceleration_m_s2: net / m,
        moves: true
      };
    });
  }

  /**
   * Magnitude of a force's moment about a point.
   *
   * Formula:
   *   M = F d sin(angle)
   *
   * Inputs:
   *   force_N >= 0
   *   distance_m >= 0
   *   angle_deg in [0,180] (optional, default 90)
   *
   * Angle is between the force and the moment arm.
   *
   * Output:
   *   moment_N_m
   *
   * Errors:
   *   ConstraintViolation / negative_force
   *   ConstraintViolation / negative_distance
   *   ConstraintViolation / angle_out_of_range_0_180
   *
   * Hand check:
   *   10 N x 0.4 m x sin(30 degrees) = 2 N m.
   */
  function moment(o) {
    return safe(() => {
      obj(o);

      const f = nonneg(
        o.force_N,
        'negative_force'
      );
      const d = nonneg(
        o.distance_m,
        'negative_distance'
      );
      const a = range(
        opt(o.angle_deg, 90),
        0,
        180,
        'angle_out_of_range_0_180'
      );

      return {
        moment_N_m: snap(
          f * d * Math.sin(a * RAD),
          SNAP
        )
      };
    });
  }

  /**
   * Moments of downward loads on a rigid horizontal beam.
   *
   * Inputs:
   *   pivot_m
   *   loads: up to 10 { force_N >= 0, position_m }
   *   beam_weight_N >= 0 (optional, default 0)
   *   cg_m (optional, default pivot position)
   *
   * Outputs:
   *   clockwise_N_m
   *   anticlockwise_N_m
   *   net_N_m
   *   balanced
   *   tips
   *   reaction_N
   *
   * Positive net moment is clockwise. reaction_N is the
   * total downward load, including the beam weight ONCE.
   *
   * Errors:
   *   ConstraintViolation / loads_exceed_10
   *   ConstraintViolation / negative_load
   *
   * Hand check:
   *   Pivot=1 m, 10 N at x=0 m, 5 N at x=3 m:
   *   clockwise=10 N m, anticlockwise=10 N m,
   *   reaction=15 N.
   */
  function balance(o) {
    return safe(() => balanceCore(o));
  }

  /**
   * Find the additional downward load needed for equilibrium.
   *
   * Inputs:
   *   All balance inputs
   *   unknown_position_m
   *
   * Outputs:
   *   force_N
   *   feasible
   *
   * A negative force_N means an upward force is required.
   * In that case, feasible is false for a downward load.
   *
   * Errors:
   *   MathError / unknown_at_pivot
   *   ConstraintViolation / loads_exceed_10
   *   ConstraintViolation / negative_load
   *
   * Hand check:
   *   10 N at x=0, pivot=1, unknown x=3 -> 5 N.
   */
  function balance_unknown(o) {
    return safe(() => {
      obj(o);

      const b = balanceCore(o);
      const arm =
        num(o.unknown_position_m) - num(o.pivot_m);

      if (Math.abs(arm) < SNAP) {
        err('MathError', 'unknown_at_pivot');
      }

      const force = snap(
        -b.net_N_m / arm,
        SNAP
      );

      return {
        force_N: force,
        feasible: force >= -EPS
      };
    });
  }

  /**
   * Tipping of a uniform rigid block about its lower edge.
   *
   * Inputs:
   *   base_width_m > 0
   *   cg_height_m > 0
   *   tilt_deg in [0,90]
   *
   * Outputs:
   *   critical_tilt_deg
   *   state: 'stable', 'balanced_on_edge', or 'topples'
   *
   * Assumption:
   *   The centre of gravity initially lies over the centre
   *   of the rectangular supporting base. Positive tilt
   *   means rotation towards the potential tipping edge.
   *
   * Errors:
   *   ConstraintViolation / base_width_not_positive
   *   ConstraintViolation / cg_height_not_positive
   *   ConstraintViolation / angle_out_of_range_0_90
   *
   * Hand check:
   *   Base width=2 m, CG height=1 m -> critical tilt=45°.
   */
  function tilt(o) {
    return safe(() => {
      obj(o);

      const b = pos(
        o.base_width_m,
        'base_width_not_positive'
      );
      const h = pos(
        o.cg_height_m,
        'cg_height_not_positive'
      );
      const t = range(
        o.tilt_deg,
        0,
        90,
        'angle_out_of_range_0_90'
      );

      const critical =
        Math.atan((b / 2) / h) / RAD;
      const delta = t - critical;

      return {
        critical_tilt_deg: critical,
        state: Math.abs(delta) <= EPS
          ? 'balanced_on_edge'
          : delta < 0
            ? 'stable'
            : 'topples'
      };
    });
  }

  /**
   * Limiting slope angle for a static-friction coefficient.
   *
   * Formula:
   *   angle = atan(mu_s)
   *
   * Input:
   *   mu_s >= 0
   *
   * Output:
   *   angle_deg
   *
   * Error:
   *   ConstraintViolation / negative_friction_coefficient
   *
   * Hand check:
   *   mu_s=1 -> 45°.
   */
  function slip_angle(o) {
    return safe(() => {
      obj(o);

      const mu = nonneg(
        o.mu_s,
        'negative_friction_coefficient'
      );

      return {
        angle_deg: Math.atan(mu) / RAD
      };
    });
  }

  /**
   * Block initially at rest on a rough inclined plane.
   *
   * Inputs:
   *   mass_kg > 0
   *   angle_deg in [0,90]
   *   mu_s >= 0
   *   mu_k >= 0 and mu_k <= mu_s
   *   g_m_s2 > 0 (optional, default 9.81)
   *
   * Outputs:
   *   normal_N
   *   parallel_N
   *   friction_max_N
   *   slips
   *   friction_N
   *   acceleration_m_s2
   *
   * Positive acceleration is down the slope. If the
   * static-friction limit is not exceeded, the body remains
   * at rest and friction balances the downhill force.
   *
   * Errors:
   *   MathError / gravity_must_be_positive
   *   ConstraintViolation / mass_not_positive
   *   ConstraintViolation / angle_out_of_range_0_90
   *   ConstraintViolation / negative_friction_coefficient
   *   ConstraintViolation / kinetic_exceeds_static
   *
   * Hand check:
   *   m=2 kg, g=10, angle=30°, mu_s=.4, mu_k=.3:
   *   normal=17.3205081 N
   *   parallel=10 N
   *   acceleration=2.40192379 m/s2.
   */
  function incline(o) {
    return safe(() => {
      obj(o);

      const g = grav(o.g_m_s2);
      const m = pos(
        o.mass_kg,
        'mass_not_positive'
      );
      const a = range(
        o.angle_deg,
        0,
        90,
        'angle_out_of_range_0_90'
      );
      const mus = nonneg(
        o.mu_s,
        'negative_friction_coefficient'
      );
      const muk = nonneg(
        o.mu_k,
        'negative_friction_coefficient'
      );

      if (muk > mus) {
        err(
          'ConstraintViolation',
          'kinetic_exceeds_static'
        );
      }

      const normal = snap(
        m * g * Math.cos(a * RAD),
        SNAP
      );
      const parallel = snap(
        m * g * Math.sin(a * RAD),
        SNAP
      );
      const limit = mus * normal;
      const slips = parallel - limit > EPS;
      const friction = slips
        ? muk * normal
        : parallel;

      return {
        normal_N: normal,
        parallel_N: parallel,
        friction_max_N: limit,
        slips,
        friction_N: friction,
        acceleration_m_s2: slips
          ? (parallel - friction) / m
          : 0
      };
    });
  }

  /**
   * Two light strings supporting a vertical weight.
   *
   * Inputs:
   *   weight_N >= 0
   *   angle1_deg in [0,90]
   *   angle2_deg in [0,90]
   *
   * Angles are measured upwards from the horizontal.
   * Strings and knot are massless and in static equilibrium.
   *
   * Outputs:
   *   T1_N
   *   T2_N
   *
   * The case 90°/90° is statically indeterminate because
   * both strings are vertical and load sharing is unknown.
   * Two horizontal strings cannot support a positive weight.
   *
   * Errors:
   *   ConstraintViolation / negative_load
   *   ConstraintViolation / angle_out_of_range_0_90
   *   MathError / strings_horizontal_no_solution
   *   MathError / strings_vertical_indeterminate
   *
   * Hand check:
   *   Weight=10 N, angles=30° and 60°:
   *   T1=5 N and T2=8.660254 N.
   */
  function two_strings(o) {
    return safe(() => {
      obj(o);

      const w = nonneg(
        o.weight_N,
        'negative_load'
      );
      const a = range(
        o.angle1_deg,
        0,
        90,
        'angle_out_of_range_0_90'
      );
      const b = range(
        o.angle2_deg,
        0,
        90,
        'angle_out_of_range_0_90'
      );

      if (a === 90 && b === 90) {
        err(
          'MathError',
          'strings_vertical_indeterminate'
        );
      }

      const denominator =
        Math.sin((a + b) * RAD);

      if (Math.abs(denominator) < SNAP) {
        err(
          'MathError',
          'strings_horizontal_no_solution'
        );
      }

      const threshold =
        SNAP * Math.max(1, w);

      return {
        T1_N: snap(
          w * Math.cos(b * RAD) / denominator,
          threshold
        ),
        T2_N: snap(
          w * Math.cos(a * RAD) / denominator,
          threshold
        )
      };
    });
  }

  /**
   * Reactions and maximum sagging moment of a simply
   * supported beam under downward loads.
   *
   * Inputs:
   *   span_m > 0
   *   point_loads: up to 10 objects
   *     { force_N >= 0, position_m in [0,span_m] }
   *   udl_N_per_m >= 0 (optional, default 0)
   *
   * Outputs:
   *   RA_N
   *   RB_N
   *   max_moment_N_m
   *   max_moment_at_m
   *
   * A uniformly distributed load acts across the full span.
   * The moment maximum is sought at the supports, at point
   * loads, and wherever shear vanishes within a load-free
   * interval. Repeated load positions are counted once
   * when constructing interval boundaries, but every
   * point-load force contributes to equilibrium and moment.
   * Tied maxima use the smallest x. If maximum moment is
   * zero, max_moment_at_m is null.
   *
   * Errors:
   *   ConstraintViolation / span_not_positive
   *   ConstraintViolation / loads_exceed_10
   *   ConstraintViolation / negative_load
   *   ConstraintViolation / load_outside_span
   *
   * Hand check:
   *   4 m span, 10 N central point load:
   *   RA=5 N, RB=5 N,
   *   maximum moment=10 N m at x=2 m.
   */
  function beam_reactions(o) {
    return safe(() => {
      const b = beamCore(o);

      const xs = [0, b.span];

      b.points.forEach(p => {
        xs.push(p.position_m);
      });

      if (b.udl > 0) {
        const boundaries = [
          ...new Set(xs)
        ].sort((a, c) => a - c);

        let passed = 0;

        for (
          let i = 0;
          i < boundaries.length - 1;
          i++
        ) {
          const left = boundaries[i];
          const right = boundaries[i + 1];

          b.points.forEach(p => {
            if (p.position_m === left) {
              passed += p.force_N;
            }
          });

          const root =
            (b.RA - passed) / b.udl;

          if (root >= left && root <= right) {
            xs.push(root);
          }
        }
      }

      xs.sort((a, c) => a - c);

      let best = 0;
      let at = null;

      xs.forEach(x => {
        const m = b.momentAt(x);

        if (m > best + EPS) {
          best = m;
          at = x;
        } else if (
          m > EPS &&
          Math.abs(m - best) <= EPS &&
          (at === null || x < at)
        ) {
          at = x;
        }
      });

      if (best < EPS) {
        best = 0;
        at = null;
      }

      return {
        RA_N: b.RA,
        RB_N: b.RB,
        max_moment_N_m: best,
        max_moment_at_m: at
      };
    });
  }

  /**
   * Bending moment at a specified section of the same beam.
   *
   * Inputs:
   *   All beam_reactions inputs
   *   x_m in [0,span_m]
   *
   * Output:
   *   moment_N_m
   *
   * Sagging moment is positive. A point load at the section
   * makes no contribution to its own lever arm.
   *
   * Errors:
   *   All beam_reactions errors
   *   ConstraintViolation / position_outside_span
   *
   * Hand check:
   *   4 m span, 10 N load at x=2 m:
   *   bending moment at x=1 m = 5 N m.
   */
  function beam_moment(o) {
    return safe(() => {
      const b = beamCore(o);

      const x = range(
        o.x_m,
        0,
        b.span,
        'position_outside_span'
      );

      return {
        moment_N_m: b.momentAt(x)
      };
    });
  }

  /**
   * Moment of inertia of ideal, uniformly dense rigid shapes.
   *
   * Supported shapes:
   *   solid_disc
   *   hoop
   *   solid_sphere
   *   hollow_sphere
   *   rod_centre
   *
   * Inputs:
   *   shape
   *   mass_kg > 0
   *   radius_m > 0 for round shapes
   *   length_m > 0 for rod_centre
   *   axis_offset_m >= 0 (optional, default 0)
   *
   * The parallel-axis theorem adds mass_kg*axis_offset_m^2.
   *
   * Output:
   *   I_kg_m2
   *
   * Errors:
   *   ConstraintViolation / mass_not_positive
   *   ConstraintViolation / size_not_positive
   *   ConstraintViolation / negative_distance
   *   NotSupported / shape_not_supported
   *
   * Missing radius_m or length_m is classified as
   * ConstraintViolation / size_not_positive.
   *
   * Hand check:
   *   2 kg solid disc with radius 0.5 m:
   *   I = (1/2)(2)(0.5^2) = 0.25 kg m2.
   */
  function inertia(o) {
    return safe(() => {
      obj(o);

      const m = pos(
        o.mass_kg,
        'mass_not_positive'
      );

      let central;

      if (o.shape === 'rod_centre') {
        const L = pos(
          o.length_m,
          'size_not_positive'
        );
        central = m * L * L / 12;
      } else {
        const k = shapeK(o.shape, false);
        const r = pos(
          o.radius_m,
          'size_not_positive'
        );
        central = k * m * r * r;
      }

      const d = nonneg(
        opt(o.axis_offset_m, 0),
        'negative_distance'
      );

      return {
        I_kg_m2: central + m * d * d
      };
    });
  }

  /**
   * Rolling without slipping or frictionless sliding.
   *
   * Supported shapes:
   *   solid_disc, hoop, solid_sphere, hollow_sphere,
   *   block_frictionless
   *
   * Inputs:
   *   shape
   *   angle_deg in (0,90]
   *   height_m >= 0
   *   g_m_s2 > 0 (optional, default 9.81)
   *
   * Outputs:
   *   k
   *   acceleration_m_s2
   *   speed_at_bottom_m_s
   *   distance_m
   *   time_s
   *
   * For rolling bodies k = I/(mr^2), and acceleration is
   * g sin(angle)/(1+k). For a frictionless block k=0.
   * All bodies start from rest at the given vertical height.
   * Mass and radius cancel for each ideal shape.
   *
   * Errors:
   *   MathError / gravity_must_be_positive
   *   NotSupported / shape_cannot_roll
   *   NotSupported / shape_not_supported
   *   ConstraintViolation / angle_out_of_range_0_90
   *   ConstraintViolation / negative_distance
   *
   * Hand check:
   *   Solid sphere, g=10, angle=30°, height=1 m:
   *   k=0.4, acceleration=3.57142857 m/s2,
   *   speed=3.77964473 m/s.
   */
  function rolling(o) {
    return safe(() => {
      obj(o);

      const g = grav(o.g_m_s2);
      const k = shapeK(o.shape, true);
      const a = num(o.angle_deg);

      if (a <= 0 || a > 90) {
        err(
          'ConstraintViolation',
          'angle_out_of_range_0_90'
        );
      }

      const h = nonneg(
        o.height_m,
        'negative_distance'
      );

      const sine = Math.sin(a * RAD);
      const acceleration =
        g * sine / (1 + k);
      const distance = h / sine;

      return {
        k,
        acceleration_m_s2: acceleration,
        speed_at_bottom_m_s: Math.sqrt(
          2 * g * h / (1 + k)
        ),
        distance_m: distance,
        time_s: h === 0
          ? 0
          : Math.sqrt(
              2 * distance / acceleration
            )
      };
    });
  }

  /**
   * Conservation of angular momentum about a fixed axis.
   *
   * Assumption:
   *   External torque is zero.
   *
   * Inputs:
   *   I1_kg_m2 > 0
   *   omega1_rad_s (signed)
   *   I2_kg_m2 > 0
   *
   * Outputs:
   *   omega2_rad_s
   *   L_kg_m2_s
   *   KE1_J
   *   KE2_J
   *
   * Energy need not be conserved because internal work
   * may be performed when changing the inertia.
   *
   * Error:
   *   ConstraintViolation / inertia_not_positive
   *
   * Hand check:
   *   I1=4, omega1=3, I2=2:
   *   omega2=6 rad/s, L=12 kg m2/s,
   *   KE1=18 J, KE2=36 J.
   */
  function angular_momentum(o) {
    return safe(() => {
      obj(o);

      const i1 = pos(
        o.I1_kg_m2,
        'inertia_not_positive'
      );
      const w1 = num(o.omega1_rad_s);
      const i2 = pos(
        o.I2_kg_m2,
        'inertia_not_positive'
      );

      const L = i1 * w1;
      const w2 = L / i2;

      return {
        omega2_rad_s: w2,
        L_kg_m2_s: L,
        KE1_J: i1 * w1 * w1 / 2,
        KE2_J: i2 * w2 * w2 / 2
      };
    });
  }

  /**
   * Angular acceleration under a net fixed-axis torque.
   *
   * Formula:
   *   alpha = torque/I
   *
   * Inputs:
   *   torque_N_m (signed)
   *   I_kg_m2 > 0
   *
   * Output:
   *   alpha_rad_s2
   *
   * Error:
   *   ConstraintViolation / inertia_not_positive
   *
   * Hand check:
   *   12 N m / 3 kg m2 = 4 rad/s2.
   */
  function angular_acceleration(o) {
    return safe(() => {
      obj(o);

      const torque = num(o.torque_N_m);
      const i = pos(
        o.I_kg_m2,
        'inertia_not_positive'
      );

      return {
        alpha_rad_s2: torque / i
      };
    });
  }

  /**
   * Atwood machine with optional rotational pulley inertia.
   *
   * Assumptions:
   *   Light, inextensible string; no slip; frictionless axle.
   *
   * Inputs:
   *   m1_kg > 0
   *   m2_kg > 0
   *   pulley_I_kg_m2 >= 0 (optional, default 0)
   *   pulley_radius_m > 0 when pulley inertia is positive
   *   g_m_s2 > 0 (optional, default 9.81)
   *
   * Outputs:
   *   acceleration_m_s2 (positive when m2 descends)
   *   T1_N
   *   T2_N
   *
   * Errors:
   *   MathError / gravity_must_be_positive
   *   ConstraintViolation / mass_not_positive
   *   ConstraintViolation / inertia_not_positive
   *   ConstraintViolation / radius_not_positive
   *
   * If pulley_I_kg_m2 > 0 and pulley_radius_m is absent
   * or null, the documented error is radius_not_positive,
   * not invalid_number.
   *
   * Hand check:
   *   m1=2 kg, m2=3 kg, g=10, light pulley:
   *   a=2 m/s2, T1=T2=24 N.
   */
  function atwood(o) {
    return safe(() => {
      obj(o);

      const g = grav(o.g_m_s2);
      const m1 = pos(
        o.m1_kg,
        'mass_not_positive'
      );
      const m2 = pos(
        o.m2_kg,
        'mass_not_positive'
      );
      const i = nonneg(
        opt(o.pulley_I_kg_m2, 0),
        'inertia_not_positive'
      );

      let effective = 0;

      if (i > 0) {
        const r = pos(
          o.pulley_radius_m,
          'radius_not_positive'
        );
        effective = i / (r * r);
      }

      const a =
        (m2 - m1) * g /
        (m1 + m2 + effective);

      return {
        acceleration_m_s2: snap(a, SNAP),
        T1_N: m1 * (g + a),
        T2_N: m2 * (g - a)
      };
    });
  }

  return Object.freeze({
    API_VERSION: 1,
    weight,
    spring,
    resultant,
    dynamics,
    moment,
    balance,
    balance_unknown,
    tilt,
    slip_angle,
    incline,
    two_strings,
    beam_reactions,
    beam_moment,
    inertia,
    rolling,
    angular_momentum,
    angular_acceleration,
    atwood
  });
})();
/* FIT-CALC-END forces */
export default FITCalcForces;
