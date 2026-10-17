/* FIT-CALC-BEGIN x9_beer_lambert */
const FITCalcX9 = (function () {
  'use strict';

  const API_VERSION = 1;

  function error(cls, reason) {
    return { error: cls, reason };
  }

  function validate(values) {
    for (const value of values) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return error('ConstraintViolation', 'non_finite_input');
      }
      if (value < 0) {
        return error('ConstraintViolation', 'negative_input');
      }
    }
    return null;
  }

  function finiteResult(result) {
    for (const value of Object.values(result)) {
      if (typeof value === 'number' && !Number.isFinite(value)) {
        return error('ConstraintViolation', 'numeric_overflow');
      }
    }
    return result;
  }

  function finiteOrNull(value) {
    return Number.isFinite(value) ? value : null;
  }

  /**
   * Beer-Lambert spectroscopy at one wavelength.
   * Inputs: epsilon in L/(mol cm), c in mol/L, l in cm.
   * Outputs: A dimensionless, T as a fraction, percent_T in %.
   * Assumptions: homogeneous solution, monochromatic light,
   * constant molar absorptivity, no scattering or stray light.
   * Errors: negative_input, non_finite_input, numeric_overflow.
   *
   * Hand check: epsilon=200, c=0.002, l=1 gives
   * A=0.4, T=0.3981071705534972, percent_T=39.81071705534972.
   */
  function beer_lambert({ epsilon, c, l }) {
    const invalid = validate([epsilon, c, l]);
    if (invalid) return invalid;

    const A = epsilon * c * l;
    const T = Math.pow(10, -A);
    const percent_T = 100 * T;

    return finiteResult({ A, T, percent_T });
  }

  /**
   * Recover concentration from measured absorbance.
   * Inputs: A dimensionless, epsilon in L/(mol cm), l in cm.
   * Output: c in mol/L.
   * Assumptions: Beer-Lambert linear regime; epsilon and l known.
   * Errors: negative_input, non_finite_input,
   * epsilon_times_path_must_be_positive, numeric_overflow.
   *
   * Hand check: A=0.6, epsilon=150, l=2 gives c=0.002 mol/L.
   */
  function beer_lambert_conc({ A, epsilon, l }) {
    const invalid = validate([A, epsilon, l]);
    if (invalid) return invalid;

    const denominator = epsilon * l;
    if (denominator <= 0) {
      return error('MathError', 'epsilon_times_path_must_be_positive');
    }

    return finiteResult({ c: A / denominator });
  }

  /**
   * Convert percentage transmittance to base-10 absorbance.
   * Input: percent_T in %, strictly above 0 and at most 100.
   * Output: A dimensionless.
   * Assumptions: transmittance refers to the incident beam.
   * Errors: transmittance_must_be_in_0_100, non_finite_input.
   *
   * Hand check: percent_T=10 gives A=1.
   */
  function absorbance_from_T({ percent_T }) {
    if (typeof percent_T !== 'number' || !Number.isFinite(percent_T)) {
      return error('ConstraintViolation', 'non_finite_input');
    }
    if (percent_T <= 0 || percent_T > 100) {
      return error('MathError', 'transmittance_must_be_in_0_100');
    }

    return finiteResult({ A: 2 - Math.log10(percent_T) });
  }

  /**
   * Exponential attenuation through one to three homogeneous layers.
   * Input: layers is an array of 1-3 {mu, x} objects;
   * mu in cm^-1, x in cm.
   * Outputs: I_over_I0 dimensionless, total_mu_x dimensionless,
   * HVL and mean_free_path in cm or null.
   * HVL and mean_free_path are defined here only for one layer
   * with positive mu. They are null for multiple layers or mu=0.
   * Assumptions: narrow-beam exponential law, independent layers,
   * no scattering, build-up or spectral changes.
   * Errors: layers_out_of_range_1_3, negative_input,
   * non_finite_input, numeric_overflow.
   *
   * Hand check: [{mu:0.2,x:3}] gives total_mu_x=0.6,
   * I_over_I0=0.5488116360940264,
   * HVL=3.465735902799726, mean_free_path=5 cm.
   */
  function attenuation({ layers }) {
    if (!Array.isArray(layers) || layers.length < 1 || layers.length > 3) {
      return error('ConstraintViolation', 'layers_out_of_range_1_3');
    }

    let total_mu_x = 0;
    for (const layer of layers) {
      if (!layer || typeof layer !== 'object') {
        return error('ConstraintViolation', 'non_finite_input');
      }
      const invalid = validate([layer.mu, layer.x]);
      if (invalid) return invalid;
      total_mu_x += layer.mu * layer.x;
    }

    const I_over_I0 = Math.exp(-total_mu_x);
    let HVL = null;
    let mean_free_path = null;

    if (layers.length === 1 && layers[0].mu > 0) {
      HVL = finiteOrNull(Math.LN2 / layers[0].mu);
      mean_free_path = finiteOrNull(1 / layers[0].mu);
    }

    return finiteResult({
      I_over_I0,
      total_mu_x,
      HVL,
      mean_free_path
    });
  }

  /**
   * Convert a supplied mass attenuation coefficient to linear
   * attenuation and transmitted intensity.
   * Inputs: mu_over_rho in cm^2/g, rho in g/cm^3, x in cm.
   * Outputs: mu in cm^-1, I_over_I0 dimensionless.
   * Assumptions: uniform density and coefficient at one photon
   * energy; no coefficient database, scattering or build-up.
   * Errors: negative_input, non_finite_input, numeric_overflow.
   *
   * Hand check: mu_over_rho=0.08, rho=2.5, x=4 gives
   * mu=0.2 cm^-1, I_over_I0=0.44932896411722156.
   */
  function mass_attenuation({ mu_over_rho, rho, x }) {
    const invalid = validate([mu_over_rho, rho, x]);
    if (invalid) return invalid;

    const mu = mu_over_rho * rho;
    const I_over_I0 = Math.exp(-mu * x);

    return finiteResult({ mu, I_over_I0 });
  }

  /**
   * Light attenuation with depth in homogeneous water.
   * Inputs: k in m^-1, z in m.
   * Outputs: I_over_I0 dimensionless, euphotic_depth in m
   * or null if k=0.
   * Euphotic depth is the 1% light level.
   * Assumptions: fixed diffuse attenuation coefficient, one
   * optical band, exponential decay with depth.
   * Errors: negative_input, non_finite_input, numeric_overflow.
   *
   * Hand check: k=0.25, z=4 gives I_over_I0=0.36787944117144233,
   * euphotic_depth=18.420680743952367 m.
   */
  function light_depth({ k, z }) {
    const invalid = validate([k, z]);
    if (invalid) return invalid;

    const I_over_I0 = Math.exp(-k * z);
    const euphotic_depth = k === 0
      ? null
      : finiteOrNull(Math.log(100) / k);

    return finiteResult({ I_over_I0, euphotic_depth });
  }

  /**
   * Infer a homogeneous exponential attenuation coefficient.
   * Inputs: I_over_I0 as a fraction in (0,1], x in cm
   * for slab work or a consistent distance unit for other media.
   * Output: mu in inverse units of x (cm^-1 for slab work,
   * m^-1 when x is supplied in metres for water).
   * Assumptions: one homogeneous exponential attenuation region.
   * Errors: transmission_must_be_in_0_1_and_x_positive,
   * non_finite_input, numeric_overflow.
   *
   * Hand check: I_over_I0=0.5, x=2 gives
   * mu=0.34657359027997264 in inverse distance units.
   */
  function mu_from_measurement({ I_over_I0, x }) {
    if (
      typeof I_over_I0 !== 'number' ||
      !Number.isFinite(I_over_I0) ||
      typeof x !== 'number' ||
      !Number.isFinite(x)
    ) {
      return error('ConstraintViolation', 'non_finite_input');
    }

    if (I_over_I0 <= 0 || I_over_I0 > 1 || x <= 0) {
      return error(
        'MathError',
        'transmission_must_be_in_0_1_and_x_positive'
      );
    }

    return finiteResult({ mu: -Math.log(I_over_I0) / x });
  }

  return Object.freeze({
    API_VERSION,
    beer_lambert,
    beer_lambert_conc,
    absorbance_from_T,
    attenuation,
    mass_attenuation,
    light_depth,
    mu_from_measurement
  });
})();
/* FIT-CALC-END x9_beer_lambert */
export default FITCalcX9;
