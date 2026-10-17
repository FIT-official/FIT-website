/* FIT-CALC-BEGIN moles */
const FITCalcMoles = (function () {
  'use strict';

  const API_VERSION = 1;
  const AR = Object.freeze({
    H: 1, He: 4, Li: 7, B: 11, C: 12, N: 14, O: 16,
    F: 19, Ne: 20, Na: 23, Mg: 24, Al: 27, Si: 28,
    P: 31, S: 32, Cl: 35.5, Ar: 40, K: 39, Ca: 40,
    Cr: 52, Mn: 55, Fe: 56, Cu: 64, Zn: 65, Br: 80,
    Ag: 108, I: 127, Ba: 137, Pb: 207
  });
  const NA = 6.02e23;
  const VM = 24;
  const R = 8.31;
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const error = (c, reason) => ({ error: c, reason });
  const cv = reason => error('ConstraintViolation', reason);
  const me = reason => error('MathError', reason);
  const rt = reason => error('RuntimeError', reason);
  const ns = reason => error('NotSupported', reason);
  const isError = x => !!x && typeof x === 'object' && own(x, 'error');
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  const whole = x => Number.isSafeInteger(x);
  const positiveInteger = x => whole(x) && x > 0;
  const numeric = (...xs) => xs.every(finite);
  const ok = x => {
    function check(v) {
      if (typeof v === 'number') return Number.isFinite(v);
      if (v === null || typeof v !== 'object') return true;
      return Object.values(v).every(check);
    }
    return check(x) ? x : cv('number_out_of_range');
  };

  function parseInternal(formula) {
    if (typeof formula !== 'string' ||
        formula.length < 1 || formula.length > 40) {
      return cv('formula_syntax_error');
    }
    const parts = formula.split(/[.·]/);
    if (parts.some(p => !p)) return cv('formula_syntax_error');
    const result = {};
    let failure = null;

    function add(into, symbol, amount) {
      const value = (into[symbol] || 0) + amount;
      if (!whole(value) || value < 1) {
        failure = cv('formula_syntax_error');
        return;
      }
      into[symbol] = value;
    }

    for (const part of parts) {
      let i = 0;

      function number() {
        const start = i;
        while (i < part.length && /[0-9]/.test(part[i])) i++;
        if (i === start) return 1;
        const n = Number(part.slice(start, i));
        if (!positiveInteger(n)) failure = cv('formula_syntax_error');
        return n;
      }

      const multiplier = /[0-9]/.test(part[0]) ? number() : 1;

      function sequence(closing, depth) {
        const map = {};
        let entries = 0;
        if (depth > 20) {
          failure = cv('formula_syntax_error');
          return map;
        }

        while (i < part.length && !failure) {
          const ch = part[i];
          if (ch === ')' || ch === ']') {
            if (ch !== closing) failure = cv('formula_syntax_error');
            break;
          }

          if (ch === '(' || ch === '[') {
            i++;
            const sub = sequence(ch === '(' ? ')' : ']', depth + 1);
            if (failure) break;
            if (i >= part.length || part[i] !== (ch === '(' ? ')' : ']')) {
              failure = cv('formula_syntax_error');
              break;
            }
            i++;
            const n = number();
            if (failure) break;
            for (const symbol of Object.keys(sub)) {
              add(map, symbol, sub[symbol] * n);
            }
            entries++;
          } else if (/[A-Z]/.test(ch)) {
            let symbol = part[i++];
            if (i < part.length && /[a-z]/.test(part[i])) {
              symbol += part[i++];
            }
            if (!own(AR, symbol)) {
              failure = ns('element_not_in_table');
              break;
            }
            const n = number();
            if (failure) break;
            add(map, symbol, n);
            entries++;
          } else {
            failure = cv('formula_syntax_error');
            break;
          }
        }

        if (entries === 0 && !failure) failure = cv('formula_syntax_error');
        return map;
      }

      const sub = sequence(null, 0);
      if (failure) return failure;
      if (i !== part.length) return cv('formula_syntax_error');
      for (const symbol of Object.keys(sub)) {
        add(result, symbol, sub[symbol] * multiplier);
      }
      if (failure) return failure;
    }

    return result;
  }

  function massInternal(formula) {
    const elements = parseInternal(formula);
    if (isError(elements)) return elements;
    let mass = 0;
    for (const [symbol, count] of Object.entries(elements)) {
      mass += AR[symbol] * count;
    }
    return Number.isFinite(mass) ? mass : cv('number_out_of_range');
  }

  function formulaText(counts) {
    return Object.entries(counts)
      .map(([s, n]) => s + (n === 1 ? '' : String(n))).join('');
  }

  /**
   * Example: Ca(OH)2 -> {Ca:1,O:2,H:2}.
   * Input: formula (ASCII chemical formula, 1–40 characters).
   * Output: elements (symbol -> whole-number count).
   * Nested brackets and hydrate parts are expanded.
   * Errors: formula_syntax_error; element_not_in_table.
   */
  function parse_formula({ formula } = {}) {
    const elements = parseInternal(formula);
    return isError(elements) ? elements : { elements };
  }

  /**
   * Example: CuSO4.5H2O -> 250 g/mol.
   * Input: formula. Output: M_g_mol (g/mol).
   * Assumption: fixed school relative atomic masses.
   * Errors: formula_syntax_error; element_not_in_table.
   */
  function molar_mass({ formula } = {}) {
    const M = massInternal(formula);
    return isError(M) ? M : { M_g_mol: M };
  }

  /**
   * Example: 9 g H2O -> 0.5 mol, 3.01e23 molecules.
   * Inputs: formula, mass_g (g, >=0).
   * Outputs: n_mol (mol), particles (formula units).
   * Errors: negative_mass; invalid_number; formula errors.
   */
  function moles({ formula, mass_g } = {}) {
    if (!finite(mass_g)) return cv('invalid_number');
    if (mass_g < 0) return cv('negative_mass');
    const M = massInternal(formula);
    if (isError(M)) return M;
    return ok({ n_mol: mass_g / M, particles: mass_g / M * NA });
  }

  /**
   * Example: 0.25 mol CO2 -> 11 g.
   * Inputs: formula, n_mol (mol). Output: mass_g (g).
   * Errors: negative_amount; invalid_number; formula errors.
   */
  function mass_from_moles({ formula, n_mol } = {}) {
    if (!finite(n_mol)) return cv('invalid_number');
    if (n_mol < 0) return cv('negative_amount');
    const M = massInternal(formula);
    return isError(M) ? M : ok({ mass_g: n_mol * M });
  }

  /**
   * Example: 0.5 mol -> 12 dm3 at r.t.p.
   * Exactly one input: n_mol (mol) or volume_dm3 (dm3).
   * Outputs: both fields. Assumes 24 dm3/mol.
   * Errors: give_exactly_one_of_n_or_volume; negative_amount.
   */
  function gas_rtp(x = {}) {
    const hasN = x.n_mol !== undefined;
    const hasV = x.volume_dm3 !== undefined;
    if (hasN === hasV) return cv('give_exactly_one_of_n_or_volume');
    const v = hasN ? x.n_mol : x.volume_dm3;
    if (!finite(v)) return cv('invalid_number');
    if (v < 0) return cv('negative_amount');
    return ok(hasN
      ? { n_mol: v, volume_dm3: v * VM }
      : { n_mol: v / VM, volume_dm3: v });
  }

  /**
   * Example: 0.05 mol NaCl in 250 cm3 -> 0.2 mol/dm3,
   * 11.7 g/dm3.
   * Inputs: n_mol (mol), volume_cm3 (cm3), optional formula.
   * Outputs: c_mol_dm3, c_g_dm3 (null without formula).
   * Errors: volume_not_positive; negative_amount; formula errors.
   */
  function concentration({ n_mol, volume_cm3, formula } = {}) {
    if (!numeric(n_mol, volume_cm3)) return cv('invalid_number');
    if (volume_cm3 <= 0) return cv('volume_not_positive');
    if (n_mol < 0) return cv('negative_amount');
    const c = n_mol / (volume_cm3 / 1000);
    if (formula === undefined) {
      return ok({ c_mol_dm3: c, c_g_dm3: null });
    }
    const M = massInternal(formula);
    return isError(M) ? M :
      ok({ c_mol_dm3: c, c_g_dm3: c * M });
  }

  /**
   * Example: H2O -> H 11.111...%, O 88.888...%.
   * Input: formula. Output: percent (element -> mass %).
   * Errors: formula_syntax_error; element_not_in_table.
   */
  function percent_composition({ formula } = {}) {
    const elements = parseInternal(formula);
    if (isError(elements)) return elements;
    const M = massInternal(formula);
    if (isError(M)) return M;
    const percent = {};
    for (const [s, n] of Object.entries(elements)) {
      percent[s] = 100 * n * AR[s] / M;
    }
    return ok({ percent });
  }

  /**
   * Example: elements [C,H,O], masses [2.4,0.6,1.6]
   * -> C2H6O, ratio {C:2,H:6,O:1}.
   * Inputs: elements (symbols), masses_g (g or mass percentages).
   * Uses first multiplier 1..6 whose ratios are within 0.1
   * of integers. Outputs: formula, ratio.
   * Errors: elements_and_masses_mismatch; mass_not_positive;
   * element_not_in_table; no_whole_number_ratio.
   */
  function empirical_formula({ elements, masses_g } = {}) {
    if (!Array.isArray(elements) || !Array.isArray(masses_g) ||
        elements.length < 2 || elements.length !== masses_g.length ||
        new Set(elements).size !== elements.length ||
        elements.length > Object.keys(AR).length) {
      return cv('elements_and_masses_mismatch');
    }
    for (const s of elements) {
      if (typeof s !== 'string' || !own(AR, s)) {
        return ns('element_not_in_table');
      }
    }
    if (!masses_g.every(finite)) return cv('invalid_number');
    if (masses_g.some(x => x <= 0)) return cv('mass_not_positive');
    const amounts = masses_g.map((m, i) => m / AR[elements[i]]);
    const smallest = Math.min(...amounts);
    const ratios = amounts.map(x => x / smallest);
    if (!ratios.every(Number.isFinite)) return cv('number_out_of_range');
    for (let k = 1; k <= 6; k++) {
      const rounded = ratios.map(x => Math.round(x * k));
      if (rounded.every((n, i) =>
        positiveInteger(n) && Math.abs(ratios[i] * k - n) <= 0.1 + 1e-12)) {
        const ratio = {};
        elements.forEach((s, i) => { ratio[s] = rounded[i]; });
        return { formula: formulaText(ratio), ratio };
      }
    }
    return rt('no_whole_number_ratio');
  }

  /**
   * Example: empirical CH2, Mr 28 -> multiplier 2, C2H4.
   * Inputs: empirical (formula), M_g_mol (g/mol).
   * Outputs: multiplier (integer), formula.
   * Errors: not_a_whole_multiple; value_not_positive;
   * formula errors.
   */
  function molecular_formula({ empirical, M_g_mol } = {}) {
    if (!finite(M_g_mol)) return cv('invalid_number');
    if (M_g_mol <= 0) return cv('value_not_positive');
    const elements = parseInternal(empirical);
    if (isError(elements)) return elements;
    const M = massInternal(empirical);
    const ratio = M_g_mol / M;
    const k = Math.round(ratio);
    if (!positiveInteger(k) || Math.abs(ratio - k) > 0.05) {
      return me('not_a_whole_multiple');
    }
    const counts = {};
    for (const [s, n] of Object.entries(elements)) {
      if (!positiveInteger(n * k)) return cv('number_out_of_range');
      counts[s] = n * k;
    }
    return { multiplier: k, formula: formulaText(counts) };
  }

  /**
   * Example: 4 g H2 + 32 g O2 -> 36 g H2O; exact ratio.
   * Inputs: reactants [{formula,coeff,mass_g}], products
   * [{formula,coeff}]; coefficients are balanced integers.
   * Outputs: limiting_index, extent_mol, exact_ratio,
   * product_moles, product_masses_g, excess_left_g.
   * Mass conservation checked when products are supplied.
   * Errors: species_out_of_range; coefficient_not_positive_integer;
   * mass_not_positive; reaction_not_balanced; formula errors.
   */
  function limiting({ reactants, products } = {}) {
    if (!Array.isArray(reactants) || !Array.isArray(products) ||
        reactants.length < 1 || reactants.length > 6 ||
        products.length > 6) return cv('species_out_of_range');
    const all = [...reactants, ...products];
    if (all.some(x => !x || !positiveInteger(x.coeff))) {
      return cv('coefficient_not_positive_integer');
    }
    if (reactants.some(x => !finite(x.mass_g))) return cv('invalid_number');
    if (reactants.some(x => x.mass_g <= 0)) return cv('mass_not_positive');
    const masses = [];
    for (const x of all) {
      const M = massInternal(x.formula);
      if (isError(M)) return M;
      masses.push(M);
    }
    if (products.length) {
      const before = reactants.reduce((s, x, i) =>
        s + x.coeff * masses[i], 0);
      const after = products.reduce((s, x, j) =>
        s + x.coeff * masses[reactants.length + j], 0);
      if (Math.abs(before - after) >
          1e-9 * Math.max(1, before, after)) {
        return cv('reaction_not_balanced');
      }
    }
    const extents = reactants.map((x, i) =>
      (x.mass_g / masses[i]) / x.coeff);
    const extent = Math.min(...extents);
    const ties = extents.map((x, i) =>
      Math.abs(x - extent) <=
        1e-9 * Math.max(Math.abs(x), Math.abs(extent), 1e-30) ? i : -1)
      .filter(i => i >= 0);
    const limiting_index = ties[0];
    const product_moles = products.map(x => x.coeff * extent);
    const product_masses_g = products.map((x, j) =>
      product_moles[j] * masses[reactants.length + j]);
    const excess_left_g = reactants.map((x, i) => {
      const remaining = x.mass_g - x.coeff * extent * masses[i];
      return i === limiting_index ||
        Math.abs(remaining) < 1e-9 ? 0 : Math.max(0, remaining);
    });
    return ok({
      limiting_index, extent_mol: extent,
      exact_ratio: ties.length > 1,
      product_moles, product_masses_g, excess_left_g
    });
  }

  /**
   * Example: actual 8 g, theoretical 10 g -> 80%, false.
   * Inputs: actual_g, theoretical_g (g).
   * Outputs: percent, over_100. Above 100 is allowed.
   * Errors: theoretical_not_positive; negative_mass.
   */
  function percent_yield({ actual_g, theoretical_g } = {}) {
    if (!numeric(actual_g, theoretical_g)) return cv('invalid_number');
    if (theoretical_g <= 0) return cv('theoretical_not_positive');
    if (actual_g < 0) return cv('negative_mass');
    const percent = 100 * actual_g / theoretical_g;
    return ok({ percent, over_100: percent > 100 });
  }

  /**
   * Example: 4 g pure in 5 g sample -> 80%.
   * Inputs: pure_g, sample_g (g). Output: percent.
   * Errors: mass_not_positive; negative_mass; pure_exceeds_sample.
   */
  function purity({ pure_g, sample_g } = {}) {
    if (!numeric(pure_g, sample_g)) return cv('invalid_number');
    if (sample_g <= 0) return cv('mass_not_positive');
    if (pure_g < 0) return cv('negative_mass');
    if (pure_g > sample_g) return cv('pure_exceeds_sample');
    return ok({ percent: 100 * pure_g / sample_g });
  }

  /**
   * Example: p=99720 Pa, V=0.003 m3, T=300 K
   * -> n=0.12 mol.
   * Exactly three inputs: p_Pa, V_m3, T_K, n_mol.
   * Output: all four, including the solved field.
   * Assumption: ideal gas, R=8.31 J/(K mol).
   * Errors: give_exactly_three_values; below_absolute_zero;
   * value_not_positive.
   */
  function ideal_gas(x = {}) {
    const names = ['p_Pa', 'V_m3', 'T_K', 'n_mol'];
    const present = names.filter(k => x[k] !== undefined);
    if (present.length !== 3) return cv('give_exactly_three_values');
    if (x.T_K !== undefined && finite(x.T_K) && x.T_K < 0) {
      return cv('below_absolute_zero');
    }
    if (present.some(k => !finite(x[k]))) return cv('invalid_number');
    if (present.some(k => x[k] <= 0)) return cv('value_not_positive');
    const result = { ...x };
    const missing = names.find(k => x[k] === undefined);
    if (missing === 'n_mol') result.n_mol = x.p_Pa * x.V_m3 / (R * x.T_K);
    if (missing === 'p_Pa') result.p_Pa = x.n_mol * R * x.T_K / x.V_m3;
    if (missing === 'V_m3') result.V_m3 = x.n_mol * R * x.T_K / x.p_Pa;
    if (missing === 'T_K') result.T_K = x.p_Pa * x.V_m3 / (x.n_mol * R);
    return ok({
      p_Pa: result.p_Pa, V_m3: result.V_m3,
      T_K: result.T_K, n_mol: result.n_mol
    });
  }

  /**
   * Example: 4.6 g sample, 8.8 g CO2, 5.4 g H2O
   * -> C 2.4 g, H 0.6 g, O 1.6 g, C2H6O.
   * Inputs: mass_sample_g, mass_CO2_g, mass_H2O_g (g).
   * Outputs: mass_C_g, mass_H_g, mass_O_g, formula.
   * All combustion products are collected; sample contains C,H,O.
   * Errors: negative_mass; mass_not_positive;
   * masses_inconsistent; empirical ratio errors.
   */
  function combustion({ mass_sample_g, mass_CO2_g, mass_H2O_g } = {}) {
    if (!numeric(mass_sample_g, mass_CO2_g, mass_H2O_g)) {
      return cv('invalid_number');
    }
    if ([mass_sample_g, mass_CO2_g, mass_H2O_g].some(x => x < 0)) {
      return cv('negative_mass');
    }
    if (mass_sample_g <= 0 || mass_CO2_g <= 0) {
      return cv('mass_not_positive');
    }
    const C = mass_CO2_g * 12 / 44;
    const H = mass_H2O_g * 2 / 18;
    let O = mass_sample_g - C - H;
    if (O < -1e-6) return cv('masses_inconsistent');
    if (Math.abs(O) <= 1e-6) O = 0;
    const elements = ['C'];
    const masses_g = [C];
    if (H > 0) { elements.push('H'); masses_g.push(H); }
    if (O > 0) { elements.push('O'); masses_g.push(O); }
    let formula;
    if (elements.length === 1) {
      formula = 'C';
    } else {
      const empirical = empirical_formula({ elements, masses_g });
      if (isError(empirical)) return empirical;
      formula = empirical.formula;
    }
    return ok({
      mass_C_g: C, mass_H_g: H, mass_O_g: O, formula
    });
  }

  /**
   * Example: 0.1 mol/dm3, 20 cm3 titrant, 25 cm3 analyte,
   * coefficients 1:1 -> 0.002 mol and 0.08 mol/dm3.
   * Inputs: c_titrant_mol_dm3, v_titrant_cm3,
   * v_analyte_cm3, analyte_coeff, titrant_coeff.
   * Outputs: n_titrant_mol, n_analyte_mol,
   * c_analyte_mol_dm3. Volumes in cm3.
   * Errors: value_not_positive; coefficient_not_positive_integer.
   */
  function titration(x = {}) {
    const { c_titrant_mol_dm3: c, v_titrant_cm3: v,
      v_analyte_cm3: a, analyte_coeff: ac,
      titrant_coeff: tc } = x;
    if (!numeric(c, v, a, ac, tc)) return cv('invalid_number');
    if (c <= 0 || v <= 0 || a <= 0) return cv('value_not_positive');
    if (!positiveInteger(ac) || !positiveInteger(tc)) {
      return cv('coefficient_not_positive_integer');
    }
    const nt = c * v / 1000;
    const na = nt * ac / tc;
    return ok({
      n_titrant_mol: nt, n_analyte_mol: na,
      c_analyte_mol_dm3: na / (a / 1000)
    });
  }

  /**
   * Example: 0.01 mol acid, 0.1 mol/dm3 alkali, 20 cm3,
   * ratios 1 and 0.5, CaCO3 sample 0.5 g
   * -> acid left .002, reacted .008, pure .4 g, purity 80%.
   * Inputs: acid_total_mol, alkali_c_mol_dm_dm3,
   * alkali_v_cm3, acid_per_alkali, sample_per_acid,
   * sample_formula, sample_mass_g.
   * Outputs: acid_left_mol, acid_reacted_mol, sample_mol,
   * pure_mass_g, purity_percent. Acid is in excess.
   * Errors: value_not_positive; titre_exceeds_acid_added;
   * formula errors. Purity above 100 remains a result.
   */
  function back_titration(x = {}) {
    const { acid_total_mol: total, alkali_c_mol_dm3: c,
      alkali_v_cm3: v, acid_per_alkali: a,
      sample_per_acid: s, sample_formula: formula,
      sample_mass_g: sample } = x;
    if (!numeric(total, c, v, a, s, sample)) {
      return cv('invalid_number');
    }
    if ([total, c, v, a, s, sample].some(z => z <= 0)) {
      return cv('value_not_positive');
    }
    const M = massInternal(formula);
    if (isError(M)) return M;
    const left = c * v / 1000 * a;
    if (left > total + 1e-12) return cv('titre_exceeds_acid_added');
    const reacted = Math.max(0, total - left);
    const amount = reacted * s;
    const pure = amount * M;
    return ok({
      acid_left_mol: left, acid_reacted_mol: reacted,
      sample_mol: amount, pure_mass_g: pure,
      purity_percent: 100 * pure / sample
    });
  }

  /**
   * Example: 0.1 mol/dm3 NaCl, 250 cm3, 100% purity
   * -> 1.4625 g.
   * Inputs: formula, c_mol_dm3, volume_cm3,
   * optional purity_percent (default 100).
   * Output: mass_g to weigh (g).
   * Errors: purity_out_of_range; value_not_positive;
   * formula errors.
   */
  function solution_prep(x = {}) {
    const { formula, c_mol_dm3: c, volume_cm3: v } = x;
    const p = x.purity_percent === undefined ? 100 : x.purity_percent;
    if (!finite(p)) return cv('invalid_number');
    if (p <= 0 || p > 100) return cv('purity_out_of_range');
    if (!numeric(c, v)) return cv('invalid_number');
    if (c <= 0 || v <= 0) return cv('value_not_positive');
    const M = massInternal(formula);
    return isError(M) ? M : ok({ mass_g: c * v / 1000 * M * 100 / p });
  }

  /**
   * Example: c1=.2, v1=50 cm3, c2=.05
   * -> v2=200 cm3, water=150 cm3.
   * Inputs: c1, c2 (same concentration units), v1_cm3.
   * Outputs: v2_cm3, water_cm3.
   * Errors: cannot_concentrate_by_dilution; value_not_positive.
   */
  function dilution({ c1, v1_cm3, c2 } = {}) {
    if (!numeric(c1, v1_cm3, c2)) return cv('invalid_number');
    if (c2 > c1) return cv('cannot_concentrate_by_dilution');
    if (c1 <= 0 || v1_cm3 <= 0 || c2 <= 0) {
      return cv('value_not_positive');
    }
    const v2 = c1 * v1_cm3 / c2;
    return ok({ v2_cm3: v2, water_cm3: v2 - v1_cm3 });
  }

  /**
   * Example: c0=1, factor=10, steps=3
   * -> [1,0.1,0.01,0.001].
   * Inputs: c0 (concentration), factor (>1), steps (1..12).
   * Output: concentrations, including starting value.
   * Errors: factor_must_exceed_1; steps_out_of_range_1_12;
   * value_not_positive.
   */
  function serial_dilution({ c0, factor, steps } = {}) {
    if (!numeric(c0, factor, steps)) return cv('invalid_number');
    if (factor <= 1) return cv('factor_must_exceed_1');
    if (!whole(steps) || steps < 1 || steps > 12) {
      return cv('steps_out_of_range_1_12');
    }
    if (c0 <= 0) return cv('value_not_positive');
    const concentrations = [c0];
    for (let i = 0; i < steps; i++) {
      concentrations.push(concentrations[i] / factor);
    }
    return ok({ concentrations });
  }

  /**
   * Example: NaCl, 58.5 mg/dm3 -> 0.001 mol/dm3.
   * Inputs: value, from_unit, to_unit, optional formula.
   * Units: mol_dm3, g_dm3, mg_dm3, ppm, percent_wv.
   * Dilute aqueous solution: 1 ppm=1 mg/dm3;
   * 1% w/v=10 g/dm3.
   * Output: value in requested unit.
   * Errors: unit_not_supported; formula_required;
   * negative_amount; formula errors.
   */
  function convert_concentration({ value, from_unit, to_unit, formula } = {}) {
    const units = ['mol_dm3', 'g_dm3', 'mg_dm3', 'ppm', 'percent_wv'];
    if (!units.includes(from_unit) || !units.includes(to_unit)) {
      return ns('unit_not_supported');
    }
    if (from_unit !== to_unit &&
        (from_unit === 'mol_dm3' || to_unit === 'mol_dm3') &&
        formula === undefined) return cv('formula_required');
    if (!finite(value)) return cv('invalid_number');
    if (value < 0) return cv('negative_amount');
    if (from_unit === to_unit) return { value };
    let M = 1;
    if (from_unit === 'mol_dm3' || to_unit === 'mol_dm3') {
      M = massInternal(formula);
      if (isError(M)) return M;
    }
    const toGrams = {
      mol_dm3: M, g_dm3: 1, mg_dm3: 0.001,
      ppm: 0.001, percent_wv: 10
    };
    return ok({ value: value * toGrams[from_unit] / toGrams[to_unit] });
  }

  function gcdBig(a, b) {
    a = a < 0n ? -a : a;
    b = b < 0n ? -b : b;
    while (b !== 0n) { const t = a % b; a = b; b = t; }
    return a === 0n ? 1n : a;
  }

  function frac(n, d = 1n) {
    if (d < 0n) { n = -n; d = -d; }
    if (n === 0n) return [0n, 1n];
    const g = gcdBig(n, d);
    return [n / g, d / g];
  }

  const fadd = (a, b) =>
    frac(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
  const fneg = a => [-a[0], a[1]];
  const fsub = (a, b) => fadd(a, fneg(b));
  const fmul = (a, b) => frac(a[0] * b[0], a[1] * b[1]);
  const fdiv = (a, b) => frac(a[0] * b[1], a[1] * b[0]);
  const lcmBig = (a, b) => a / gcdBig(a, b) * b;

  /**
   * Example: FeS2 + O2 -> Fe2O3 + SO2
   * -> [4,11,2,8].
   * Inputs: reactants and products, arrays of formula strings,
   * 1–6 on each side. Output: coefficients, smallest positive
   * integers in input order. Exact rational null-space RREF.
   * Errors: species_out_of_range; no_unique_balance;
   * cannot_balance; coefficient_out_of_range; formula errors.
   */
  function balance({ reactants, products } = {}) {
    if (!Array.isArray(reactants) || !Array.isArray(products) ||
        reactants.length < 1 || reactants.length > 6 ||
        products.length < 1 || products.length > 6) {
      return cv('species_out_of_range');
    }
    const names = [...reactants, ...products];
    const maps = [];
    const symbols = [];
    for (const formula of names) {
      const map = parseInternal(formula);
      if (isError(map)) return map;
      maps.push(map);
      for (const symbol of Object.keys(map)) {
        if (!symbols.includes(symbol)) symbols.push(symbol);
      }
    }
    const n = names.length;
    const matrix = symbols.map(s => maps.map((map, j) =>
      frac(BigInt((map[s] || 0) * (j < reactants.length ? 1 : -1)))));
    const pivots = [];
    let row = 0;
    for (let col = 0; col < n && row < matrix.length; col++) {
      let chosen = row;
      while (chosen < matrix.length && matrix[chosen][col][0] === 0n) {
        chosen++;
      }
      if (chosen === matrix.length) continue;
      [matrix[row], matrix[chosen]] = [matrix[chosen], matrix[row]];
      const divisor = matrix[row][col];
      matrix[row] = matrix[row].map(x => fdiv(x, divisor));
      for (let r = 0; r < matrix.length; r++) {
        if (r === row || matrix[r][col][0] === 0n) continue;
        const factor = matrix[r][col];
        matrix[r] = matrix[r].map((x, k) =>
          fsub(x, fmul(factor, matrix[row][k])));
      }
      pivots.push(col);
      row++;
    }
    if (n - pivots.length !== 1) return me('no_unique_balance');
    const free = Array.from({ length: n }, (_, i) => i)
      .find(i => !pivots.includes(i));
    const values = Array.from({ length: n }, () => frac(0n));
    values[free] = frac(1n);
    for (let r = pivots.length - 1; r >= 0; r--) {
      let sum = frac(0n);
      for (let c = pivots[r] + 1; c < n; c++) {
        sum = fadd(sum, fmul(matrix[r][c], values[c]));
      }
      values[pivots[r]] = fneg(sum);
    }
    let denominator = 1n;
    for (const x of values) {
      denominator = lcmBig(denominator, x[1]);
    }
    let ints = values.map(x => x[0] * (denominator / x[1]));
    if (ints.some(x => x === 0n)) return me('cannot_balance');
    if (ints.every(x => x < 0n)) ints = ints.map(x => -x);
    if (!ints.every(x => x > 0n)) return me('cannot_balance');
    let divisor = ints[0];
    for (const x of ints.slice(1)) divisor = gcdBig(divisor, x);
    ints = ints.map(x => x / divisor);
    if (ints.some(x => x > BigInt(Number.MAX_SAFE_INTEGER))) {
      return cv('coefficient_out_of_range');
    }
    return { coefficients: ints.map(Number) };
  }

  /**
   * Example: 2Mg + O2 -> 2MgO, desired 2MgO -> 100%.
   * Inputs: reactants [{formula,coeff}], desired {formula,coeff}.
   * Output: percent (mass of desired product / input mass).
   * Assumes the supplied equation is balanced.
   * Errors: coefficient_not_positive_integer; species_out_of_range;
   * formula errors.
   */
  function atom_economy({ reactants, desired } = {}) {
    if (!Array.isArray(reactants) || reactants.length < 1 ||
        reactants.length > 6 || !desired) return cv('species_out_of_range');
    if ([...reactants, desired].some(x =>
      !x || !positiveInteger(x.coeff))) {
      return cv('coefficient_not_positive_integer');
    }
    let inputMass = 0;
    for (const x of reactants) {
      const M = massInternal(x.formula);
      if (isError(M)) return M;
      inputMass += M * x.coeff;
    }
    const desiredM = massInternal(desired.formula);
    if (isError(desiredM)) return desiredM;
    return ok({ percent: 100 * desired.coeff * desiredM / inputMass });
  }

  /**
   * Example: feed=10, left=4, product=4.5, both nu=1
   * -> conversion=.6, yield=.45, selectivity=.75.
   * Inputs: n_feed_mol, n_left_mol, n_product_mol (mol);
   * optional nu_reactant, nu_product (default 1).
   * Outputs: conversion, yield, selectivity as fractions.
   * Zero conversion gives selectivity:null.
   * Errors: left_exceeds_feed; value_not_positive;
   * negative_amount; coefficient_not_positive_integer.
   */
  function conversion_yield(x = {}) {
    const { n_feed_mol: feed, n_left_mol: left,
      n_product_mol: product } = x;
    const nr = x.nu_reactant === undefined ? 1 : x.nu_reactant;
    const np = x.nu_product === undefined ? 1 : x.nu_product;
    if (!numeric(feed, left, product, nr, np)) {
      return cv('invalid_number');
    }
    if (left > feed) return cv('left_exceeds_feed');
    if (feed <= 0) return cv('value_not_positive');
    if (left < 0 || product < 0) return cv('negative_amount');
    if (!positiveInteger(nr) || !positiveInteger(np)) {
      return cv('coefficient_not_positive_integer');
    }
    const conversion = (feed - left) / feed;
    const yieldValue = product * nr / np / feed;
    return ok({
      conversion, yield: yieldValue,
      selectivity: conversion === 0 ? null : yieldValue / conversion
    });
  }

  /**
   * Example: recipe {white:2,red:1}, stock {white:7,red:2}
   * -> made=2, leftover {white:3,red:0}, limiting ['red'].
   * Inputs: recipe counts >=1, stock counts >=0, safe integers.
   * Outputs: made (whole models), leftover, limiting.
   * Errors: count_not_whole_number.
   */
  function build_count({ recipe, stock } = {}) {
    if (!recipe || !stock || Array.isArray(recipe) ||
        Array.isArray(stock) || typeof recipe !== 'object' ||
        typeof stock !== 'object' || !Object.keys(recipe).length) {
      return cv('count_not_whole_number');
    }
    if (Object.values(recipe).some(x => !positiveInteger(x)) ||
        Object.values(stock).some(x => !whole(x) || x < 0)) {
      return cv('count_not_whole_number');
    }
    const made = Math.min(...Object.keys(recipe).map(s =>
      Math.floor((stock[s] || 0) / recipe[s])));
    const leftover = {};
    for (const s of [...new Set([
      ...Object.keys(recipe), ...Object.keys(stock)
    ])]) {
      leftover[s] = (stock[s] || 0) - made * (recipe[s] || 0);
    }
    const limiting = Object.keys(recipe).filter(s =>
      leftover[s] < recipe[s]);
    return { made, leftover, limiting };
  }

  /**
   * Example: 29 items in groups of 12 -> 2 groups, 5 left.
   * Inputs: count (whole >=0), group_size (whole >=1).
   * Outputs: groups, left (whole counts).
   * Errors: group_size_not_positive_integer; count_not_whole_number.
   */
  function groups({ count, group_size } = {}) {
    if (!positiveInteger(group_size)) {
      return cv('group_size_not_positive_integer');
    }
    if (!whole(count) || count < 0) return cv('count_not_whole_number');
    return {
      groups: Math.floor(count / group_size),
      left: count % group_size
    };
  }

  /**
   * Example: 2 white + 1 red per model, stock 7 white/2 red,
   * plan 2 -> used 4 white/2 red, left 3 white/0 red.
   * Inputs: recipe and stock as in build_count; models (whole >=0).
   * Outputs: used, leftover, possible, total_before, total_after.
   * Totals are bead mass units assuming equal-mass beads.
   * Errors: count_not_whole_number.
   */
  function build_plan({ recipe, stock, models } = {}) {
    const base = build_count({ recipe, stock });
    if (isError(base)) return base;
    if (!whole(models) || models < 0) return cv('count_not_whole_number');
    const used = {};
    const leftover = {};
    let total_before = 0;
    let total_after = 0;
    let possible = true;
    for (const s of [...new Set([
      ...Object.keys(recipe), ...Object.keys(stock)
    ])]) {
      const n = models * (recipe[s] || 0);
      used[s] = n;
      leftover[s] = (stock[s] || 0) - n;
      if (leftover[s] < 0) possible = false;
      total_before += stock[s] || 0;
      total_after += n + leftover[s];
    }
    return ok({ used, leftover, possible, total_before, total_after });
  }

  /**
   * Example: 5.28 g vapour, 0.12 mol -> 44 g/mol.
   * Inputs: mass_g (g, >=0), n_mol (mol, >0).
   * Output: M_g_mol. Errors: negative_mass; value_not_positive.
   */
  function molar_mass_from_sample({ mass_g, n_mol } = {}) {
    if (!numeric(mass_g, n_mol)) return cv('invalid_number');
    if (mass_g < 0) return cv('negative_mass');
    if (n_mol <= 0) return cv('value_not_positive');
    return ok({ M_g_mol: mass_g / n_mol });
  }

  /**
   * Example: acid .01 mol, 0.1 mol/dm3 alkali, 20 cm3,
   * ratio 1 -> .008 mol acid remaining.
   * Inputs: acid_initial_mol, alkali_c_mol_dm3,
   * alkali_v_cm3, acid_per_alkali.
   * Output: acid_remaining_mol, clamped at zero.
   * Errors: value_not_positive; negative_amount.
   */
  function acid_remaining(x = {}) {
    const { acid_initial_mol: acid, alkali_c_mol_dm3: c,
      alkali_v_cm3: v, acid_per_alkali: ratio } = x;
    if (!numeric(acid, c, v, ratio)) return cv('invalid_number');
    if (acid <= 0 || c <= 0 || ratio <= 0) {
      return cv('value_not_positive');
    }
    if (v < 0) return cv('negative_amount');
    return ok({
      acid_remaining_mol: Math.max(0, acid - c * v / 1000 * ratio)
    });
  }

  /**
   * Example: C2H4 feed 10 mol, O2 feed 20 mol,
   * conversion .6 and desired selectivity .75:
   * 4 mol C2H4 left, 4.5 mol C2H4O, 3 mol CO2,
   * 3 mol H2O, 13.25 mol O2 left; both sides 920 g.
   * Inputs: feed_C2H4_mol, feed_O2_mol, conversion,
   * desired_selectivity (fractions 0..1).
   * Outputs: inlet_mol, outlet_mol, inlet_masses_g,
   * outlet_masses_g, mass_in_g, mass_out_g.
   * Reactions: C2H4 + 0.5O2 -> C2H4O;
   * C2H4 + 3O2 -> 2CO2 + 2H2O.
   * Errors: value_not_positive; fraction_out_of_range;
   * insufficient_oxygen.
   */
  function reactor_streams(x = {}) {
    const { feed_C2H4_mol: feed, feed_O2_mol: oxygen,
      conversion: conv, desired_selectivity: sel } = x;
    if (!numeric(feed, oxygen, conv, sel)) return cv('invalid_number');
    if (feed <= 0 || oxygen <= 0) return cv('value_not_positive');
    if (conv < 0 || conv > 1 || sel < 0 || sel > 1) {
      return cv('fraction_out_of_range');
    }
    const used = feed * conv;
    const desired = used * sel;
    const burned = used - desired;
    const oxygenUsed = desired * 0.5 + burned * 3;
    if (oxygenUsed > oxygen + 1e-10) {
      return cv('insufficient_oxygen');
    }
    const inlet_mol = { C2H4: feed, O2: oxygen };
    const outlet_mol = {
      C2H4: feed - used, O2: Math.max(0, oxygen - oxygenUsed),
      C2H4O: desired, CO2: burned * 2, H2O: burned * 2
    };
    const inlet_masses_g = {};
    const outlet_masses_g = {};
    for (const [s, n] of Object.entries(inlet_mol)) {
      inlet_masses_g[s] = n * massInternal(s);
    }
    for (const [s, n] of Object.entries(outlet_mol)) {
      outlet_masses_g[s] = n * massInternal(s);
    }
    const mass_in_g = Object.values(inlet_masses_g)
      .reduce((a, b) => a + b, 0);
    const mass_out_g = Object.values(outlet_masses_g)
      .reduce((a, b) => a + b, 0);
    return ok({
      inlet_mol, outlet_mol, inlet_masses_g, outlet_masses_g,
      mass_in_g, mass_out_g
    });
  }

  return Object.freeze({
    API_VERSION,
    parse_formula, molar_mass, moles, mass_from_moles,
    gas_rtp, concentration, percent_composition,
    empirical_formula, molecular_formula, limiting,
    percent_yield, purity, ideal_gas, combustion,
    titration, back_titration, solution_prep, dilution,
    serial_dilution, convert_concentration, balance,
    atom_economy, conversion_yield, build_count, groups,
    build_plan, molar_mass_from_sample, acid_remaining,
    reactor_streams
  });
})();
/* FIT-CALC-END moles */

export default FITCalcMoles;
