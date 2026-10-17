/* FIT-CALC-BEGIN optics */
const FITCalcOptics = (function () {
  'use strict';

  /*
   * LIGHT AND OPTICS — PURE CALCULATION ENGINE
   * API_VERSION: 1
   *
   * Angles are measured from the normal, in degrees.
   * Lengths are in centimetres unless the field name says otherwise.
   * Refractive indices must be at least 1.
   * Speed of light in vacuum: 3.00e8 m/s.
   *
   * THIN-LENS SIGN CONVENTION — REAL IS POSITIVE
   * f > 0: converging lens; f < 0: diverging lens.
   * u > 0: real object; u < 0: virtual object.
   * v > 0: real image; v < 0: virtual image.
   * 1/f = 1/u + 1/v.
   * m = -v/u; negative means inverted, positive upright.
   *
   * LENSMAKER CARTESIAN RADIUS CONVENTION
   * Light travels from left to right.
   * R > 0 when the centre of curvature lies on the outgoing side.
   * R < 0 when it lies on the incoming side.
   * A plane surface is represented by null.
   *
   * Models assume geometrical optics, ideal interfaces, thin lenses,
   * paraxial rays where applicable, and monochromatic illumination
   * unless dispersion is explicitly modelled by separate indices.
   *
   * Every API function accepts one plain object and returns one.
   * Invalid calls return {error, reason}; errors are never thrown.
   * No calculation returns NaN or Infinity.
   */

  const PI = Math.PI;
  const C = 300000000;
  const EPS = 1e-9;

  function err(error, reason) {
    return { error: error, reason: reason };
  }

  function number(x) {
    return typeof x === 'number' && Number.isFinite(x);
  }

  function object(x) {
    return x !== null &&
      typeof x === 'object' &&
      !Array.isArray(x);
  }

  function input(x) {
    return object(x)
      ? null
      : err('ConstraintViolation', 'invalid_input');
  }

  function finiteFields(x, names) {
    for (const name of names) {
      if (!number(x[name])) {
        return err('ConstraintViolation', 'invalid_number');
      }
    }
    return null;
  }

  function positive(x, reason) {
    return x > 0
      ? null
      : err('ConstraintViolation', reason);
  }

  function index(n) {
    if (!number(n)) {
      return err('ConstraintViolation', 'invalid_number');
    }
    return n >= 1
      ? null
      : err('ConstraintViolation', 'refractive_index_below_1');
  }

  function angle(a) {
    if (!number(a)) {
      return err('ConstraintViolation', 'invalid_number');
    }
    return a >= 0 && a <= 90
      ? null
      : err('ConstraintViolation', 'angle_out_of_range_0_90');
  }

  function deg(a) {
    return a * 180 / PI;
  }

  function rad(a) {
    return a * PI / 180;
  }

  function safeResult(fields) {
    for (const value of Object.values(fields)) {
      if (typeof value === 'number' && !Number.isFinite(value)) {
        return err('MathError', 'non_finite_result');
      }
    }
    return fields;
  }

  function nearZero(x, scale) {
    return Math.abs(x) <= EPS * (scale || 1);
  }

  function nearPoint(x) {
    if (x === undefined) return 25;
    return x;
  }

  /*
   * reflect({incidence_deg})
   * Input: incidence angle, degrees from the normal, 0–90.
   * Output: reflection_deg, degrees from the normal.
   * Assumes a stationary, plane, specular mirror.
   * Errors: invalid_input, invalid_number, angle_out_of_range_0_90.
   *
   * Hand check: incidence = 37°; reflection = 37°.
   */
  function reflect(x) {
    const e = input(x) || angle(x.incidence_deg);
    if (e) return e;
    return { reflection_deg: x.incidence_deg };
  }

  /*
   * refract({n1,n2,incidence_deg})
   * Inputs: incident and transmitted refractive indices, angle in degrees.
   * Outputs: refraction_deg (degrees or null), tir (boolean),
   *          critical_deg (degrees or null).
   * Assumes a plane interface and Snell's law.
   * TIR is a valid result. Exact critical incidence gives 90°.
   * Absolute tolerance on n1*sin(i)-n2: 1e-9.
   * Errors: invalid_input, invalid_number,
   *         refractive_index_below_1, angle_out_of_range_0_90.
   *
   * Hand check: n1=1, n2=1.5, i=30°.
   * sin(r)=sin(30°)/1.5=1/3;
   * r=19.4712206345°; critical_deg=null; tir=false.
   */
  function refract(x) {
    const e = input(x) ||
      index(x.n1) ||
      index(x.n2) ||
      angle(x.incidence_deg);
    if (e) return e;

    const critical = x.n1 > x.n2
      ? deg(Math.asin(x.n2 / x.n1))
      : null;

    const numerator = x.n1 * Math.sin(rad(x.incidence_deg));
    const difference = numerator - x.n2;

    if (difference > EPS) {
      return {
        refraction_deg: null,
        tir: true,
        critical_deg: critical
      };
    }

    if (Math.abs(difference) <= EPS) {
      return {
        refraction_deg: 90,
        tir: false,
        critical_deg: critical
      };
    }

    const ratio = Math.max(0, Math.min(1, numerator / x.n2));

    return safeResult({
      refraction_deg: deg(Math.asin(ratio)),
      tir: false,
      critical_deg: critical
    });
  }

  /*
   * critical_angle({n1,n2})
   * Inputs: indices, dimensionless, n1>n2>=1.
   * Output: critical_deg, degrees from normal.
   * Assumes propagation from optically denser to rarer material.
   * Errors: refractive_index_below_1, invalid_number,
   *         invalid_input; no_critical_angle (MathError).
   *
   * Hand check: n1=1.5, n2=1.
   * sin(C)=2/3; C=41.8103148958°.
   */
  function critical_angle(x) {
    const e = input(x) || index(x.n1) || index(x.n2);
    if (e) return e;

    if (x.n1 <= x.n2) {
      return err('MathError', 'no_critical_angle');
    }

    return safeResult({
      critical_deg: deg(Math.asin(x.n2 / x.n1))
    });
  }

  /*
   * refractive_index({incidence_deg,refraction_deg})
   * Inputs: incident and refracted angles in degrees, each 0–90.
   * Output: n, dimensionless.
   * Assumes incidence from air (n_air=1), into material n>=1.
   * Errors: division_by_zero, indeterminate_normal_incidence
   *         (MathError), refractive_index_below_1,
   *         invalid_input, invalid_number, angle_out_of_range_0_90.
   *
   * Hand check: i=30°, r=19.4712206345°.
   * n=sin(30°)/sin(19.4712206345°)=1.5.
   */
  function refractive_index(x) {
    const e = input(x) ||
      angle(x.incidence_deg) ||
      angle(x.refraction_deg);
    if (e) return e;

    if (x.refraction_deg === 0) {
      return x.incidence_deg === 0
        ? err('MathError', 'indeterminate_normal_incidence')
        : err('MathError', 'division_by_zero');
    }

    const n = Math.sin(rad(x.incidence_deg)) /
      Math.sin(rad(x.refraction_deg));

    if (n < 1 - EPS) {
      return err('ConstraintViolation', 'refractive_index_below_1');
    }

    return safeResult({ n: Math.max(1, n) });
  }

  /*
   * speed_in_medium({n})
   * Input: refractive index >=1, dimensionless.
   * Output: v_m_s, metres per second.
   * Assumes c=3.00e8 m/s.
   * Errors: invalid_input, invalid_number, refractive_index_below_1.
   *
   * Hand check: n=1.5; v=300000000/1.5=200000000 m/s.
   */
  function speed_in_medium(x) {
    const e = input(x) || index(x.n);
    if (e) return e;
    return safeResult({ v_m_s: C / x.n });
  }

  /*
   * thin_lens({f_cm,u_cm})
   * Inputs: signed focal length and signed object distance, cm.
   * For this public operation the object must be real (u>0).
   * Outputs: v_cm, m, real, upright, at_infinity.
   * Infinity regime returns null for the undefined quantities.
   * Assumes a thin paraxial lens in one surrounding medium.
   * Errors: invalid_input, invalid_number,
   *         object_distance_not_positive (ConstraintViolation),
   *         zero_focal_length (MathError).
   *
   * Hand check: f=10 cm, u=30 cm.
   * 1/v=1/10-1/30=1/15; v=15 cm;
   * m=-15/30=-0.5, real=true, upright=false.
   */
  function thin_lens(x) {
    const e = input(x) ||
      finiteFields(x, ['f_cm', 'u_cm']);
    if (e) return e;

    if (x.u_cm <= 0) {
      return err('ConstraintViolation', 'object_distance_not_positive');
    }
    if (x.f_cm === 0) {
      return err('MathError', 'zero_focal_length');
    }

    const difference = x.u_cm - x.f_cm;

    if (nearZero(difference, Math.max(1, Math.abs(x.f_cm)))) {
      return {
        v_cm: null,
        m: null,
        real: null,
        upright: null,
        at_infinity: true
      };
    }

    const v = x.f_cm * x.u_cm / difference;
    const m = -v / x.u_cm;

    return safeResult({
      v_cm: v,
      m: m,
      real: v > 0,
      upright: m > 0,
      at_infinity: false
    });
  }

  /*
   * lens_power({f_cm})
   * Input: signed focal length, cm, nonzero.
   * Output: P_dioptre, dioptres (D).
   * Uses P=1/f_m=100/f_cm.
   * Errors: zero_focal_length (MathError),
   *         invalid_input, invalid_number.
   *
   * Hand check: f=-50 cm; P=-2 D.
   */
  function lens_power(x) {
    const e = input(x) || finiteFields(x, ['f_cm']);
    if (e) return e;

    if (x.f_cm === 0) {
      return err('MathError', 'zero_focal_length');
    }

    return safeResult({ P_dioptre: 100 / x.f_cm });
  }

  /*
   * lensmaker({n_lens,n_medium,R1_cm,R2_cm})
   * Inputs: refractive indices >=1 and Cartesian surface radii, cm.
   * A radius null denotes a plane face (zero curvature).
   * Output: f_cm and P_dioptre, signed focal length and power.
   * Cartesian radius: positive when centre of curvature is on the
   * outgoing side, negative when on the incoming side.
   * Positive f denotes converging power (real-is-positive).
   * Assumes a thin lens immersed in a uniform medium; ignores thickness.
   * Errors: zero_radius (ConstraintViolation), invalid_number,
   *         refractive_index_below_1, invalid_input,
   *         infinite_focal_length (MathError).
   *
   * Hand check: n_lens=1.5, n_medium=1,
   * R1=20 cm, R2=-20 cm.
   * P in cm^-1=(1.5-1)(1/20+1/20)=0.05;
   * f=20 cm; P_dioptre=5 D.
   */
  function lensmaker(x) {
    const e = input(x) ||
      index(x.n_lens) ||
      index(x.n_medium);
    if (e) return e;

    for (const key of ['R1_cm', 'R2_cm']) {
      if (x[key] !== null && !number(x[key])) {
        return err('ConstraintViolation', 'invalid_number');
      }
      if (x[key] === 0) {
        return err('ConstraintViolation', 'zero_radius');
      }
    }

    const c1 = x.R1_cm === null ? 0 : 1 / x.R1_cm;
    const c2 = x.R2_cm === null ? 0 : 1 / x.R2_cm;
    const relative = x.n_lens / x.n_medium - 1;
    const powerInverseCm = relative * (c1 - c2);

    if (powerInverseCm === 0) {
      return err('MathError', 'infinite_focal_length');
    }

    return safeResult({
      f_cm: 1 / powerInverseCm,
      P_dioptre: 100 * powerInverseCm
    });
  }

  /*
   * two_lens({f1_cm,f2_cm,d_cm,u_cm})
   * Inputs: two signed focal lengths, separation and real-object
   * distance, all in cm. f1,f2!=0, d>=0, u>0.
   * Outputs: v1_cm, u2_cm, v2_cm, m_total, at_infinity.
   * u2=d-v1 may be negative: a virtual object at lens 2.
   * The final distance is measured from lens 2.
   * If u=f1, lens 2 receives collimated rays and v2=f2.
   * If u2=f2, final image is at infinity: v2,m_total=null.
   * Assumes exactly two thin paraxial lenses in one medium.
   * Errors: zero_focal_length, zero_intermediate_object_distance
   *         (MathError), invalid_input, invalid_number,
   *         object_distance_not_positive, negative_separation
   *         (ConstraintViolation), element_not_supported
   *         (NotSupported for an explicit unsupported element).
   *
   * Hand check: f1=10, f2=20, d=40, u=30 cm.
   * v1=15; u2=25; v2=100;
   * m1=-15/30=-0.5; m2=-100/25=-4;
   * m_total=2.
   */
  function two_lens(x) {
    const e = input(x) ||
      finiteFields(x, ['f1_cm', 'f2_cm', 'd_cm', 'u_cm']);
    if (e) return e;

    if (x.element_kind !== undefined &&
        x.element_kind !== 'thin_lens') {
      return err('NotSupported', 'element_not_supported');
    }
    if (x.element_count !== undefined && x.element_count !== 2) {
      return err('ConstraintViolation', 'too_many_elements');
    }
    if (x.u_cm <= 0) {
      return err('ConstraintViolation', 'object_distance_not_positive');
    }
    if (x.d_cm < 0) {
      return err('ConstraintViolation', 'negative_separation');
    }
    if (x.f1_cm === 0 || x.f2_cm === 0) {
      return err('MathError', 'zero_focal_length');
    }

    if (Math.abs(x.u_cm - x.f1_cm) <= EPS) {
      return {
        v1_cm: null,
        u2_cm: null,
        v2_cm: x.f2_cm,
        m_total: null,
        at_infinity: true
      };
    }

    const v1 = x.f1_cm * x.u_cm / (x.u_cm - x.f1_cm);
    const u2 = x.d_cm - v1;

    if (Math.abs(u2) <= EPS) {
      return err('MathError', 'zero_intermediate_object_distance');
    }

    if (Math.abs(u2 - x.f2_cm) <= EPS) {
      return {
        v1_cm: v1,
        u2_cm: u2,
        v2_cm: null,
        m_total: null,
        at_infinity: true
      };
    }

    const v2 = x.f2_cm * u2 / (u2 - x.f2_cm);
    const m1 = -v1 / x.u_cm;
    const m2 = -v2 / u2;

    return safeResult({
      v1_cm: v1,
      u2_cm: u2,
      v2_cm: v2,
      m_total: m1 * m2,
      at_infinity: false
    });
  }

  /*
   * magnifier({f_cm,near_point_cm?})
   * Inputs: positive focal length and optional positive near point, cm.
   * Default near point D=25 cm.
   * Outputs: M_relaxed and M_near, dimensionless angular magnifications.
   * Assumes a simple magnifier, relaxed viewing and near-point viewing.
   * Errors: invalid_input, invalid_number, focal_length_not_positive,
   *         near_point_not_positive (ConstraintViolation).
   *
   * Hand check: f=5 cm, D=25 cm.
   * M_relaxed=25/5=5; M_near=1+25/5=6.
   */
  function magnifier(x) {
    const e = input(x) || finiteFields(x, ['f_cm']);
    if (e) return e;

    const D = nearPoint(x.near_point_cm);
    if (!number(D)) {
      return err('ConstraintViolation', 'invalid_number');
    }
    if (x.f_cm <= 0) {
      return err('ConstraintViolation', 'focal_length_not_positive');
    }
    if (D <= 0) {
      return err('ConstraintViolation', 'near_point_not_positive');
    }

    return safeResult({
      M_relaxed: D / x.f_cm,
      M_near: 1 + D / x.f_cm
    });
  }

  /*
   * telescope({f_obj_cm,f_eye_cm})
   * Inputs: positive objective and eyepiece focal lengths, cm.
   * Outputs: signed M_angular and length_cm.
   * Normal adjustment, afocal astronomical refractor.
   * M_angular=-f_obj/f_eye: negative denotes an inverted image.
   * length_cm=f_obj+f_eye.
   * Errors: invalid_input, invalid_number,
   *         focal_length_not_positive (ConstraintViolation).
   *
   * Hand check: objective=80 cm, eyepiece=10 cm;
   * M_angular=-8; length=90 cm.
   */
  function telescope(x) {
    const e = input(x) ||
      finiteFields(x, ['f_obj_cm', 'f_eye_cm']);
    if (e) return e;

    if (x.f_obj_cm <= 0 || x.f_eye_cm <= 0) {
      return err('ConstraintViolation', 'focal_length_not_positive');
    }

    return safeResult({
      M_angular: -x.f_obj_cm / x.f_eye_cm,
      length_cm: x.f_obj_cm + x.f_eye_cm
    });
  }

  /*
   * microscope({f_obj_cm,f_eye_cm,tube_cm,near_point_cm?})
   * Inputs: positive objective, eyepiece focal lengths and tube length,
   * cm; optional positive near point in cm (default 25 cm).
   * Output: M_total, signed approximate angular magnification.
   * Uses standard approximation M=-(L/f_obj)(D/f_eye).
   * Negative sign indicates an inverted final image.
   * Errors: invalid_input, invalid_number, focal_length_not_positive,
   *         tube_length_not_positive, near_point_not_positive
   *         (ConstraintViolation).
   *
   * Hand check: f_obj=2 cm, f_eye=5 cm, tube=16 cm, D=25 cm.
   * M=-(16/2)(25/5)=-40.
   */
  function microscope(x) {
    const e = input(x) ||
      finiteFields(x, ['f_obj_cm', 'f_eye_cm', 'tube_cm']);
    if (e) return e;

    const D = nearPoint(x.near_point_cm);
    if (!number(D)) {
      return err('ConstraintViolation', 'invalid_number');
    }
    if (x.f_obj_cm <= 0 || x.f_eye_cm <= 0) {
      return err('ConstraintViolation', 'focal_length_not_positive');
    }
    if (x.tube_cm <= 0) {
      return err('ConstraintViolation', 'tube_length_not_positive');
    }
    if (D <= 0) {
      return err('ConstraintViolation', 'near_point_not_positive');
    }

    return safeResult({
      M_total: -(x.tube_cm / x.f_obj_cm) * (D / x.f_eye_cm)
    });
  }

  /*
   * shadow({object_height_cm,object_distance_cm,screen_distance_cm})
   * Inputs: positive object height, object distance from point source,
   * and screen distance from the same source, in cm.
   * Output: shadow_height_cm, cm.
   * Assumes a point source, straight rays, perpendicular flat screen
   * and opaque object parallel to the screen.
   * Errors: invalid_input, invalid_number,
   *         distance_not_positive, screen_before_object,
   *         object_height_not_positive (ConstraintViolation).
   *
   * Hand check: object height=4 cm, object at 20 cm,
   * screen at 60 cm. Shadow=4*(60/20)=12 cm.
   */
  function shadow(x) {
    const e = input(x) ||
      finiteFields(x, [
        'object_height_cm',
        'object_distance_cm',
        'screen_distance_cm'
      ]);
    if (e) return e;

    if (x.object_height_cm <= 0) {
      return err('ConstraintViolation', 'object_height_not_positive');
    }
    if (x.object_distance_cm <= 0 || x.screen_distance_cm <= 0) {
      return err('ConstraintViolation', 'distance_not_positive');
    }
    if (x.screen_distance_cm <= x.object_distance_cm) {
      return err('ConstraintViolation', 'screen_before_object');
    }

    return safeResult({
      shadow_height_cm:
        x.object_height_cm * x.screen_distance_cm /
        x.object_distance_cm
    });
  }

  /*
   * layered_ray({indices,incidence_deg})
   * Inputs: indices array containing 2–3 refractive indices >=1;
   * incident angle in degrees from the first interface normal.
   * Outputs: angles_deg array (degrees or null), tir, tir_interface,
   * conserved_n_sin, all in order of propagation.
   * Assumes parallel plane interfaces and a common normal.
   * Conservation: n*sin(theta) is constant until TIR.
   * Errors: invalid_input, invalid_number, refractive_index_below_1,
   *         angle_out_of_range_0_90, invalid_layer_count
   *         (ConstraintViolation).
   *
   * Hand check: indices=[1,1.5,1.33], incidence=30°.
   * conserved=0.5; angles=[30,19.4712206345,22.082413° approx];
   * no total internal reflection.
   */
  function layered_ray(x) {
    const e = input(x) || angle(x.incidence_deg);
    if (e) return e;

    if (!Array.isArray(x.indices) ||
        x.indices.length < 2 ||
        x.indices.length > 3) {
      return err('ConstraintViolation', 'invalid_layer_count');
    }

    for (const n of x.indices) {
      const failure = index(n);
      if (failure) return failure;
    }

    const values = [x.incidence_deg];
    const conserved =
      x.indices[0] * Math.sin(rad(x.incidence_deg));

    for (let j = 1; j < x.indices.length; j++) {
      const next = refract({
        n1: x.indices[j - 1],
        n2: x.indices[j],
        incidence_deg: values[j - 1]
      });

      if (next.error) return next;

      if (next.tir) {
        values.push(null);
        return {
          angles_deg: values,
          tir: true,
          tir_interface: j,
          conserved_n_sin: conserved
        };
      }

      values.push(next.refraction_deg);
    }

    return {
      angles_deg: values,
      tir: false,
      tir_interface: null,
      conserved_n_sin: conserved
    };
  }

  /*
   * dispersion({n_red,n_blue,n_medium,R1_cm,R2_cm})
   * Inputs: red and blue lens indices, surrounding index, and Cartesian
   * surface radii; indices dimensionless, radii cm or null.
   * Outputs: f_red_cm, f_blue_cm, delta_f_cm=f_red-f_blue.
   * Assumes thin paraxial lenses with wavelength-dependent indices.
   * Errors: invalid_input, invalid_number, refractive_index_below_1,
   *         zero_radius, infinite_focal_length.
   *
   * Hand check: red=1.50, blue=1.52, medium=1,
   * R1=20, R2=-20 cm.
   * f_red=20 cm, f_blue=19.2307692308 cm;
   * delta_f=0.7692307692 cm.
   */
  function dispersion(x) {
    const e = input(x) ||
      index(x.n_red) ||
      index(x.n_blue) ||
      index(x.n_medium);
    if (e) return e;

    const common = {
      n_medium: x.n_medium,
      R1_cm: x.R1_cm,
      R2_cm: x.R2_cm
    };

    const red = lensmaker({
      ...common,
      n_lens: x.n_red
    });
    if (red.error) return red;

    const blue = lensmaker({
      ...common,
      n_lens: x.n_blue
    });
    if (blue.error) return blue;

    return safeResult({
      f_red_cm: red.f_cm,
      f_blue_cm: blue.f_cm,
      delta_f_cm: red.f_cm - blue.f_cm
    });
  }

  return Object.freeze({
    API_VERSION: 1,
    reflect: reflect,
    refract: refract,
    critical_angle: critical_angle,
    refractive_index: refractive_index,
    speed_in_medium: speed_in_medium,
    thin_lens: thin_lens,
    lens_power: lens_power,
    lensmaker: lensmaker,
    two_lens: two_lens,
    magnifier: magnifier,
    telescope: telescope,
    microscope: microscope,
    shadow: shadow,
    layered_ray: layered_ray,
    dispersion: dispersion
  });
})();
/* FIT-CALC-END optics */
export default FITCalcOptics;
