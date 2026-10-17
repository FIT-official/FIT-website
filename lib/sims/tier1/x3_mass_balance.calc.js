/* FIT-CALC-BEGIN x3_mass_balance */
const FITCalcX3 = (function () {
  'use strict';

  const API_VERSION = 1;
  const EPS = 1e-9;
  const MAX_SPECIES = 5;
  const MAX_STREAMS = 10;
  const MAX_STAGES = 10;

  function finite(v) {
    return typeof v === 'number' && Number.isFinite(v);
  }

  function nonnegative(v) {
    return finite(v) && v >= 0;
  }

  function positive(v) {
    return finite(v) && v > 0;
  }

  function fraction(v) {
    return finite(v) && v >= 0 && v <= 1;
  }

  const REASONS = {
    FRACTIONS_MUST_SUM_TO_1: 'fractions_must_sum_to_1',
    INVALID_CAPACITY: 'invalid_capacity',
    INVALID_CELL_COUNT: 'invalid_cell_count',
    INVALID_COEFFICIENT: 'invalid_coefficient',
    INVALID_CONCENTRATION: 'invalid_concentration',
    INVALID_CONVERSION: 'conversion_out_of_range',
    INVALID_DURATION: 'invalid_duration',
    INVALID_FACTOR: 'invalid_factor',
    INVALID_FEED: 'invalid_feed',
    INVALID_FLOW: 'invalid_flow',
    INVALID_GROWTH_RATE: 'invalid_growth_rate',
    INVALID_HARVEST_DAY: 'invalid_harvest_day',
    INVALID_HEAT_CAPACITY: 'invalid_heat_capacity',
    INVALID_IMPURITY_REMOVAL: 'impurity_removal_out_of_range',
    INVALID_INERT_FRACTION: 'inert_fraction_out_of_range',
    INVALID_ITEMS: 'invalid_items',
    INVALID_LABEL: 'invalid_label',
    INVALID_LEDGER: 'invalid_ledger',
    INVALID_MASS: 'invalid_mass',
    INVALID_MASS_FLOW: 'invalid_mass_flow',
    INVALID_MOLAR_MASS: 'invalid_molar_mass',
    INVALID_POWER: 'invalid_power',
    INVALID_PRODUCT: 'invalid_product',
    INVALID_PURGE_FRACTION: 'purge_fraction_out_of_range',
    INVALID_QUANTITY: 'invalid_quantity',
    INVALID_REACTANTS: 'invalid_reactants',
    INVALID_RECOVERY: 'step_yield_out_of_range',
    INVALID_RECYCLE_FRACTION: 'recycle_fraction_out_of_range',
    INVALID_SPECIES: 'invalid_species',
    INVALID_STAGES: 'invalid_stages',
    INVALID_STAGE_NAME: 'invalid_stage_name',
    INVALID_STREAMS: 'invalid_streams',
    INVALID_TEMPERATURE: 'below_absolute_zero',
    INVALID_UNIT: 'invalid_unit',
    INVALID_YIELD: 'yield_out_of_range',
    PRODUCT_EXCEEDS_INPUT: 'product_exceeds_input',
    TOO_MANY_ITEMS: 'too_many_items',
    TOO_MANY_REACTANTS: 'too_many_reactants',
    TOO_MANY_SPECIES: 'too_many_species',
    TOO_MANY_STAGES: 'too_many_stages',
    TOO_MANY_STREAMS: 'too_many_streams'
  };

  /**
   * All errors follow the FIT schema:
   *
   * ConstraintViolation:
   * { error: 'ConstraintViolation', reason: 'lower_snake' }
   *
   * MathError:
   * { error: 'MathError', reason: 'lower_snake' }
   */
  function err(code, reason) {
    if (code === 'MathError') {
      return {
        error: 'MathError',
        reason: reason || 'undefined_calculation'
      };
    }

    if (Object.prototype.hasOwnProperty.call(REASONS, code)) {
      return {
        error: 'ConstraintViolation',
        reason: REASONS[code]
      };
    }

    return {
      error: 'ConstraintViolation',
      reason: String(code)
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .toLowerCase()
    };
  }

  function clean(v) {
    return Math.abs(v) < 1e-12 ? 0 : v;
  }

  function safeResult(o) {
    function scan(v) {
      if (typeof v === 'number') {
        return Number.isFinite(v);
      }

      if (Array.isArray(v)) {
        return v.every(scan);
      }

      if (v && typeof v === 'object') {
        return Object.keys(v).every(k => scan(v[k]));
      }

      return true;
    }

    return scan(o)
      ? o
      : err('MathError', 'non_finite_result');
  }

  function validArray(a, cap) {
    return Array.isArray(a) &&
      a.length > 0 &&
      a.length <= cap;
  }

  /**
   * Return the first defined value.
   *
   * Used to support the existing HTML game interface and the
   * teaching/KAT interface without changing existing outputs.
   */
  function firstDefined() {
    for (let i = 0; i < arguments.length; i++) {
      if (arguments[i] !== undefined) {
        return arguments[i];
      }
    }

    return undefined;
  }

  /**
   * Steady, adiabatic, non-reacting mixer.
   *
   * Maximum 10 streams and 5 species.
   *
   * Original inputs:
   * streams [{
   *   m_kg_s,
   *   x,
   *   T_C,
   *   cp_kJ_kgK
   * }]
   *
   * The original output fields are preserved.
   *
   * Assumptions:
   * - Steady state
   * - No chemical reaction
   * - No heat loss
   * - Constant specific heat capacities
   * - No phase change
   *
   * Temperature:
   * T_out = sum(m_i cp_i T_i) / sum(m_i cp_i)
   *
   * Example:
   * 1 kg/s at 20 C and 1 kg/s at 60 C, equal cp:
   * T_out = 40 C.
   */
  function mixStreams({ streams } = {}) {
    if (!Array.isArray(streams) || !streams.length) {
      return err('INVALID_STREAMS');
    }

    if (streams.length > MAX_STREAMS) {
      return err('TOO_MANY_STREAMS');
    }

    if (!streams.every(
      s => s && s.x && typeof s.x === 'object' &&
        !Array.isArray(s.x)
    )) {
      return err('INVALID_STREAMS');
    }

    const names = Object.keys(streams[0].x).sort();

    if (!names.length) {
      return err('INVALID_SPECIES');
    }

    if (names.length > MAX_SPECIES) {
      return err('TOO_MANY_SPECIES');
    }

    if (names.some(n => !n.trim())) {
      return err('INVALID_SPECIES');
    }

    let mass = 0;
    let heatCapacityFlow = 0;
    let enthalpyFlow = 0;

    const speciesMass = Object.fromEntries(
      names.map(n => [n, 0])
    );

    for (const s of streams) {
      if (!nonnegative(s.m_kg_s)) {
        return err('INVALID_MASS_FLOW');
      }

      if (!finite(s.T_C) || s.T_C < -273.15) {
        return err('INVALID_TEMPERATURE');
      }

      if (!positive(s.cp_kJ_kgK)) {
        return err('INVALID_HEAT_CAPACITY');
      }

      const keys = Object.keys(s.x).sort();

      if (
        keys.length !== names.length ||
        keys.some((k, i) => k !== names[i])
      ) {
        return err('INVALID_SPECIES');
      }

      if (!names.every(n => fraction(s.x[n]))) {
        return err('INVALID_SPECIES');
      }

      const sum = names.reduce(
        (a, n) => a + s.x[n],
        0
      );

      if (Math.abs(sum - 1) > EPS) {
        return err('FRACTIONS_MUST_SUM_TO_1');
      }

      mass += s.m_kg_s;

      heatCapacityFlow +=
        s.m_kg_s * s.cp_kJ_kgK;

      enthalpyFlow +=
        s.m_kg_s * s.cp_kJ_kgK * s.T_C;

      for (const n of names) {
        speciesMass[n] +=
          s.m_kg_s * s.x[n];
      }
    }

    if (heatCapacityFlow === 0) {
      return err(
        'MathError',
        'zero_total_heat_capacity_flow'
      );
    }

    const x = {};

    for (const n of names) {
      x[n] = speciesMass[n] / mass;
    }

    const out = {
      m_kg_s: mass,
      x,
      T_C: enthalpyFlow / heatCapacityFlow,
      residual_kg_s: clean(mass - mass)
    };

    return safeResult(out);
  }

  /**
   * KAT-compatible temperature mixing interface.
   *
   * Input:
   * {
   *   streams: [
   *     { m: 1, cp: 4.18, T: 20 },
   *     { m: 1, cp: 4.18, T: 60 }
   *   ]
   * }
   *
   * The original mixStreams interface remains available.
   */
  function mixTemperature({ streams } = {}) {
    if (!Array.isArray(streams) || !streams.length) {
      return err('INVALID_STREAMS');
    }

    if (streams.length > MAX_STREAMS) {
      return err('TOO_MANY_STREAMS');
    }

    const converted = [];

    for (const s of streams) {
      if (!s || typeof s !== 'object') {
        return err('INVALID_STREAMS');
      }

      const m = firstDefined(s.m, s.m_kg_s);
      const cp = firstDefined(s.cp, s.cp_kJ_kgK);
      const T = firstDefined(s.T, s.T_C);

      converted.push({
        m_kg_s: m,
        cp_kJ_kgK: cp,
        T_C: T,
        x: { mixture: 1 }
      });
    }

    const result = mixStreams({
      streams: converted
    });

    if (result.error) {
      return result;
    }

    return safeResult({
      T_mixed: result.T_C,
      T_out: result.T_C,
      T_C: result.T_C,
      m_total: result.m_kg_s,
      m_kg_s: result.m_kg_s,
      residual_kg_s: result.residual_kg_s
    });
  }

  /**
   * Steady conservative concentration mixing.
   *
   * Inputs:
   * streams [{Q_m3_s >= 0, C_mg_L >= 0}]
   *
   * Maximum 10 streams.
   *
   * Outputs:
   * Q_m3_s
   * C_mg_L
   * residual in mg/s
   *
   * 1 cubic metre = 1000 litres.
   *
   * No decay, reaction or accumulation.
   */
  function mixConcentrations({ streams } = {}) {
    if (!Array.isArray(streams) || !streams.length) {
      return err('INVALID_STREAMS');
    }

    if (streams.length > MAX_STREAMS) {
      return err('TOO_MANY_STREAMS');
    }

    let q = 0;
    let load = 0;

    for (const s of streams) {
      if (!s || !nonnegative(s.Q_m3_s)) {
        return err('INVALID_FLOW');
      }

      if (!nonnegative(s.C_mg_L)) {
        return err('INVALID_CONCENTRATION');
      }

      q += s.Q_m3_s;

      load +=
        s.Q_m3_s * s.C_mg_L * 1000;
    }

    if (!positive(q)) {
      return err('MathError', 'zero_total_flow');
    }

    const C = load / (q * 1000);

    return safeResult({
      Q_m3_s: q,
      C_mg_L: C,
      residual: clean(
        load - q * C * 1000
      )
    });
  }

  /**
   * Single-loop steady mixer/splitter mass balance.
   *
   * Inputs:
   * F_kg_s >= 0
   * 0 <= recycleFraction < 1
   *
   * M = F / (1-r)
   * R = rM
   * P = (1-r)M
   *
   * Outputs:
   * mixer_kg_s
   * recycle_kg_s
   * product_kg_s
   * residual_kg_s
   *
   * A recycle fraction >= 1 is a constraint violation.
   */
  function recycleLoop({
    F_kg_s,
    recycleFraction
  } = {}) {
    if (!nonnegative(F_kg_s)) {
      return err('INVALID_FEED');
    }

    if (
      !finite(recycleFraction) ||
      recycleFraction < 0 ||
      recycleFraction >= 1
    ) {
      return err('INVALID_RECYCLE_FRACTION');
    }

    const M = F_kg_s / (1 - recycleFraction);
    const R = M * recycleFraction;
    const P = M * (1 - recycleFraction);

    return safeResult({
      mixer_kg_s: M,
      recycle_kg_s: R,
      product_kg_s: P,
      residual_kg_s: clean(F_kg_s - P)
    });
  }

  /**
   * KAT-compatible recycle interface.
   *
   * Input:
   * {
   *   fresh: 10,
   *   recycle_fraction: 0.5
   * }
   */
  function recycle(args = {}) {
    const F = firstDefined(
      args.fresh,
      args.F_kg_s
    );

    const r = firstDefined(
      args.recycle_fraction,
      args.recycleFraction
    );

    const result = recycleLoop({
      F_kg_s: F,
      recycleFraction: r
    });

    if (result.error) {
      return result;
    }

    return safeResult({
      ...result,
      mixer: result.mixer_kg_s,
      recycle: result.recycle_kg_s,
      product: result.product_kg_s,
      residual: result.residual_kg_s
    });
  }

  /**
   * Exact steady-state recycle and purge balance.
   *
   * Single reactant A and single inert I.
   *
   * Reaction:
   * A -> P
   *
   * Molar stoichiometry:
   * 1:1
   *
   * Inputs:
   * F_mol_s >= 0
   * yInert in [0,1]
   * conversionPerPass in [0,1]
   * purgeFraction in [0,1]
   *
   * Fresh reactant:
   * Af = F(1-yInert)
   *
   * Fresh inert:
   * If = F*yInert
   *
   * Mixer reactant:
   * Am = Af / [1-(1-c)(1-p)]
   *
   * Mixer inert for p>0:
   * Im = If/p
   *
   * The separator removes all product P.
   *
   * The remaining A/I stream is divided between purge and
   * recycle.
   *
   * Product, purge and fresh feed close the external balance.
   */
  function recyclePurge({
    F_mol_s,
    yInert,
    conversionPerPass,
    purgeFraction
  } = {}) {
    if (!nonnegative(F_mol_s)) {
      return err('INVALID_FEED');
    }

    if (!fraction(yInert)) {
      return err('INVALID_INERT_FRACTION');
    }

    if (!fraction(conversionPerPass)) {
      return err('INVALID_CONVERSION');
    }

    if (!fraction(purgeFraction)) {
      return err('INVALID_PURGE_FRACTION');
    }

    const p = purgeFraction;
    const c = conversionPerPass;

    const Af = F_mol_s * (1 - yInert);
    const If = F_mol_s * yInert;

    if (p === 0 && If > 0) {
      return err(
        'MathError',
        'zero_purge_with_positive_inert_feed'
      );
    }

    const d = 1 - (1 - c) * (1 - p);

    if (d === 0 && Af > 0) {
      return err(
        'MathError',
        'undefined_reactant_steady_state'
      );
    }

    const Am = d === 0 ? 0 : Af / d;
    const Im = p === 0 ? 0 : If / p;

    const Ao = Am * (1 - c);
    const P = Am * c;

    const Ap = Ao * p;
    const Ip = Im * p;

    const Ar = Ao * (1 - p);
    const Ir = Im * (1 - p);

    function stream(A, I, product) {
      return {
        A_mol_s: A,
        I_mol_s: I,
        P_mol_s: product,
        total_mol_s: A + I + product
      };
    }

    const out = {
      mixer: stream(Am, Im, 0),
      reactorOut: stream(Ao, Im, P),
      recycle: stream(Ar, Ir, 0),
      purge: stream(Ap, Ip, 0),
      product: stream(0, 0, P),

      inertInLoopFraction:
        Am + Im === 0
          ? 0
          : Im / (Am + Im),

      overallConversion:
        Af === 0
          ? 0
          : P / Af,

      residual: clean(
        F_mol_s - P - Ap - Ip
      )
    };

    return safeResult(out);
  }

  /**
   * Sequential target-mass recovery.
   *
   * Original inputs:
   * {
   *   input_kg,
   *   stages: [
   *     {
   *       name,
   *       recovery,
   *       impurityRemoval
   *     }
   *   ],
   *   impurity_kg
   * }
   *
   * A zero-length stage list is valid.
   *
   * Empty cascade:
   * - overallYield = 1
   * - stageOut_kg = []
   * - losses_kg = []
   * - residual_kg = 0
   *
   * Existing outputs and purity calculations are preserved.
   */
  function recoveryCascade({
    input_kg,
    stages,
    impurity_kg
  } = {}) {
    if (
      !nonnegative(input_kg) ||
      (
        impurity_kg !== undefined &&
        !nonnegative(impurity_kg)
      )
    ) {
      return err('INVALID_MASS');
    }

    if (!Array.isArray(stages)) {
      return err('INVALID_STAGES');
    }

    if (stages.length > MAX_STAGES) {
      return err('TOO_MANY_STAGES');
    }

    let current = input_kg;

    let impurity =
      impurity_kg === undefined
        ? 0
        : impurity_kg;

    const stageOut_kg = [];
    const losses_kg = [];

    for (const s of stages) {
      if (
        !s ||
        typeof s.name !== 'string' ||
        !s.name.trim()
      ) {
        return err('INVALID_STAGE_NAME');
      }

      if (!fraction(s.recovery)) {
        return err('INVALID_RECOVERY');
      }

      if (
        s.impurityRemoval !== undefined &&
        !fraction(s.impurityRemoval)
      ) {
        return err('INVALID_IMPURITY_REMOVAL');
      }

      const next = current * s.recovery;

      losses_kg.push(current - next);
      stageOut_kg.push(next);

      current = next;

      impurity *= 1 - (
        s.impurityRemoval === undefined
          ? 0
          : s.impurityRemoval
      );
    }

    const yieldFraction = stages.reduce(
      (a, s) => a * s.recovery,
      1
    );

    const totalLoss = losses_kg.reduce(
      (a, b) => a + b,
      0
    );

    const out = {
      stageOut_kg,
      losses_kg,
      overallYield: yieldFraction,
      residual_kg: clean(
        input_kg - current - totalLoss
      )
    };

    if (impurity_kg !== undefined) {
      out.purity =
        current + impurity === 0
          ? 0
          : current / (current + impurity);
    }

    return safeResult(out);
  }

  /**
   * KAT-compatible recovery cascade.
   *
   * Input:
   * {
   *   mass_in: 1000,
   *   step_yields: [0.9, 0.8]
   * }
   *
   * Output includes:
   * overall_yield
   * mass_after_each
   * lost
   *
   * Original recoveryCascade output fields are retained.
   */
  function recoveryCascadeKAT(args = {}) {
    const mass = firstDefined(
      args.mass_in,
      args.input_kg
    );

    let stages;

    if (args.step_yields !== undefined) {
      if (!Array.isArray(args.step_yields)) {
        return err('INVALID_STAGES');
      }

      stages = args.step_yields.map((recovery, i) => ({
        name: 'Stage ' + (i + 1),
        recovery
      }));
    } else {
      stages = args.stages;
    }

    const result = recoveryCascade({
      input_kg: mass,
      stages,
      impurity_kg: args.impurity_kg
    });

    if (result.error) {
      return result;
    }

    const lost = result.losses_kg.reduce(
      (a, b) => a + b,
      0
    );

    return safeResult({
      overall_yield: result.overallYield,
      mass_after_each: result.stageOut_kg,
      lost,
      overallYield: result.overallYield,
      stageOut_kg: result.stageOut_kg,
      losses_kg: result.losses_kg,
      residual_kg: result.residual_kg,
      ...(result.purity === undefined
        ? {}
        : { purity: result.purity })
    });
  }

  /**
   * Stoichiometric atom economy.
   *
   * Atom economy is not isolated product yield.
   *
   * Inputs:
   * product: {M_g_mol>0, coeff>0}
   * reactants: [{M_g_mol>0, coeff>0}]
   *
   * Maximum 10 reactants.
   *
   * Atom economy (%) =
   * 100 * product stoichiometric mass /
   * total reactant stoichiometric mass.
   *
   * Assumes the supplied equation is balanced.
   */
  function atomEconomy({
    product,
    reactants
  } = {}) {
    if (!product || typeof product !== 'object') {
      return err('INVALID_PRODUCT');
    }

    if (!Array.isArray(reactants) || !reactants.length) {
      return err('INVALID_REACTANTS');
    }

    if (reactants.length > MAX_STREAMS) {
      return err('TOO_MANY_REACTANTS');
    }

    const all = [product, ...reactants];

    if (all.some(v => !v || !positive(v.M_g_mol))) {
      return err('INVALID_MOLAR_MASS');
    }

    if (all.some(v => !positive(v.coeff))) {
      return err('INVALID_COEFFICIENT');
    }

    const denominator = reactants.reduce(
      (a, v) => a + v.M_g_mol * v.coeff,
      0
    );

    if (!positive(denominator)) {
      return err(
        'MathError',
        'zero_reactant_stoichiometric_mass'
      );
    }

    return safeResult({
      atomEconomy_pct:
        100 *
        product.M_g_mol *
        product.coeff /
        denominator
    });
  }

  /**
   * Environmental factor.
   *
   * E-factor = counted waste mass / isolated product mass.
   *
   * Inputs:
   * waste_g >= 0
   * product_g >= 0
   *
   * Zero product mass is mathematically undefined.
   */
  function eFactor({
    waste_g,
    product_g
  } = {}) {
    if (
      !nonnegative(waste_g) ||
      !nonnegative(product_g)
    ) {
      return err('INVALID_MASS');
    }

    if (product_g === 0) {
      return err(
        'MathError',
        'zero_product_mass'
      );
    }

    return safeResult({
      eFactor: waste_g / product_g,
      residual_g: 0
    });
  }

  /**
   * Process mass intensity.
   *
   * PMI = total counted input mass / product mass.
   */
  function processMassIntensity({
    totalInput_g,
    product_g
  } = {}) {
    if (
      !nonnegative(totalInput_g) ||
      !nonnegative(product_g)
    ) {
      return err('INVALID_MASS');
    }

    if (product_g === 0) {
      return err(
        'MathError',
        'zero_product_mass'
      );
    }

    if (product_g > totalInput_g) {
      return err('PRODUCT_EXCEEDS_INPUT');
    }

    return safeResult({
      pmi: totalInput_g / product_g,

      residual_g: clean(
        totalInput_g -
        product_g -
        (totalInput_g - product_g)
      )
    });
  }

  /**
   * Reaction mass efficiency.
   *
   * RME (%) =
   * 100 * product mass / counted reactant mass.
   */
  function reactionMassEfficiency({
    product_g,
    reactants_g
  } = {}) {
    if (
      !nonnegative(product_g) ||
      !nonnegative(reactants_g)
    ) {
      return err('INVALID_MASS');
    }

    if (reactants_g === 0) {
      return err(
        'MathError',
        'zero_reactant_mass'
      );
    }

    if (product_g > reactants_g) {
      return err('PRODUCT_EXCEEDS_INPUT');
    }

    return safeResult({
      rme_pct: 100 * product_g / reactants_g,

      residual_g: clean(
        reactants_g -
        product_g -
        (reactants_g - product_g)
      )
    });
  }

  /**
   * Static-factor carbon inventory.
   *
   * Original input:
   * items [{
   *   label,
   *   quantity,
   *   unit,
   *   factor_kgCO2e_per_unit
   * }]
   *
   * Maximum 10 items.
   *
   * Each factor is user-supplied.
   *
   * Outputs:
   * bySource [{label,kgCO2e,share}]
   * total_kgCO2e
   * shares[]
   * residual_kgCO2e
   *
   * The share of each source is:
   * source kgCO2e / total kgCO2e.
   *
   * If total emissions are zero, each share is null.
   *
   * An empty inventory returns zero total and empty arrays.
   */
  function carbonAccounting({ items } = {}) {
    if (!Array.isArray(items)) {
      return err('INVALID_ITEMS');
    }

    if (items.length > MAX_STREAMS) {
      return err('TOO_MANY_ITEMS');
    }

    const bySource = [];

    for (const v of items) {
      if (
        !v ||
        typeof v.label !== 'string' ||
        !v.label.trim()
      ) {
        return err('INVALID_LABEL');
      }

      if (
        typeof v.unit !== 'string' ||
        !v.unit.trim()
      ) {
        return err('INVALID_UNIT');
      }

      if (!nonnegative(v.quantity)) {
        return err('INVALID_QUANTITY');
      }

      if (!nonnegative(v.factor_kgCO2e_per_unit)) {
        return err('INVALID_FACTOR');
      }

      bySource.push({
        label: v.label,
        kgCO2e:
          v.quantity *
          v.factor_kgCO2e_per_unit
      });
    }

    const total = bySource.reduce(
      (a, v) => a + v.kgCO2e,
      0
    );

    const shares = bySource.map(
      v => total === 0
        ? null
        : v.kgCO2e / total
    );

    bySource.forEach((source, i) => {
      source.share = shares[i];
    });

    return safeResult({
      bySource,
      total_kgCO2e: total,
      shares,

      residual_kgCO2e: clean(
        total -
        bySource.reduce(
          (a, v) => a + v.kgCO2e,
          0
        )
      )
    });
  }

  /**
   * KAT-compatible carbon accounting.
   *
   * Input:
   * {
   *   activities: [
   *     {name:'electricity',qty:1000,factor:0.4},
   *     {name:'diesel',qty:100,factor:2.68}
   *   ]
   * }
   *
   * Expected:
   * total = 668 kgCO2e
   * shares = [400/668,268/668]
   */
  function carbonAccountingKAT(args = {}) {
    if (args.activities === undefined) {
      return carbonAccounting(args);
    }

    if (!Array.isArray(args.activities)) {
      return err('INVALID_ITEMS');
    }

    const items = args.activities.map(v => {
      if (!v || typeof v !== 'object') {
        return null;
      }

      return {
        label: firstDefined(v.name, v.label),
        quantity: firstDefined(v.qty, v.quantity),
        unit: firstDefined(v.unit, 'activity_unit'),
        factor_kgCO2e_per_unit: firstDefined(
          v.factor,
          v.factor_kgCO2e_per_unit
        )
      };
    });

    return carbonAccounting({ items });
  }

  /**
   * Population growth followed by sequential recovery.
   *
   * Exponential model:
   * N(t) = N0 exp(rt)
   *
   * Logistic model:
   * N(t) = K/[1+(K/N0-1)exp(-rt)]
   *
   * Inputs:
   * N0 >= 0 cells
   * r_per_day >= 0
   * K optional > 0
   * harvestDay >= 0
   * stageRecoveries[]
   *
   * Original outputs are preserved.
   */
  function cellProduction({
    N0,
    r_per_day,
    K,
    harvestDay,
    stageRecoveries
  } = {}) {
    if (!nonnegative(N0)) {
      return err('INVALID_CELL_COUNT');
    }

    if (!nonnegative(r_per_day)) {
      return err('INVALID_GROWTH_RATE');
    }

    if (!nonnegative(harvestDay)) {
      return err('INVALID_HARVEST_DAY');
    }

    if (
      K !== undefined &&
      (!positive(K) || N0 > K)
    ) {
      return err('INVALID_CAPACITY');
    }

    if (
      !Array.isArray(stageRecoveries) ||
      stageRecoveries.length === 0
    ) {
      return err('INVALID_STAGES');
    }

    if (stageRecoveries.length > MAX_STAGES) {
      return err('TOO_MANY_STAGES');
    }

    if (!stageRecoveries.every(fraction)) {
      return err('INVALID_RECOVERY');
    }

    const a = r_per_day * harvestDay;

    let N;

    if (N0 === 0) {
      N = 0;
    } else if (K === undefined) {
      N = N0 * Math.exp(a);
    } else {
      const z = Math.exp(-a);

      N = K / (
        1 + (K / N0 - 1) * z
      );
    }

    const overallYield = stageRecoveries.reduce(
      (v, f) => v * f,
      1
    );

    const final = N * overallYield;

    let balance = N;
    let losses = 0;

    for (const f of stageRecoveries) {
      const next = balance * f;

      losses += balance - next;
      balance = next;
    }

    return safeResult({
      N_harvest: N,
      N_final: final,
      overallYield,

      residual_cells: clean(
        N - final - losses
      )
    });
  }

  /**
   * Generic scalar mass ledger.
   *
   * Inputs:
   * inputs[]
   * outputs[]
   * accumulation = 0
   *
   * All inputs and outputs are nonnegative.
   * Accumulation may be signed.
   *
   * residual =
   * total input - total output - accumulation.
   */
  function balanceLedger({
    inputs,
    outputs,
    accumulation = 0
  } = {}) {
    if (
      !Array.isArray(inputs) ||
      !Array.isArray(outputs) ||
      !inputs.length ||
      !outputs.length
    ) {
      return err('INVALID_LEDGER');
    }

    if (
      inputs.length > MAX_STREAMS ||
      outputs.length > MAX_STREAMS
    ) {
      return err('TOO_MANY_STREAMS');
    }

    if (
      ![...inputs, ...outputs].every(nonnegative) ||
      !finite(accumulation)
    ) {
      return err('INVALID_MASS');
    }

    const totalIn = inputs.reduce(
      (a, b) => a + b,
      0
    );

    const totalOut = outputs.reduce(
      (a, b) => a + b,
      0
    );

    return safeResult({
      totalIn,
      totalOut,
      accumulation,
      residual: clean(
        totalIn - totalOut - accumulation
      )
    });
  }

  /**
   * Workshop electricity comparison.
   *
   * All carbon factors are user-supplied.
   *
   * Energy (kWh) = power (kW) * hours (h)
   *
   * Emissions (kgCO2e) =
   * energy (kWh) * factor (kgCO2e/kWh)
   *
   * Saving = old emissions - new emissions.
   */
  function electricityComparison({
    oldPower_kW,
    newPower_kW,
    hours,
    factor_kgCO2e_per_kWh
  } = {}) {
    if (
      !nonnegative(oldPower_kW) ||
      !nonnegative(newPower_kW)
    ) {
      return err('INVALID_POWER');
    }

    if (!nonnegative(hours)) {
      return err('INVALID_DURATION');
    }

    if (!nonnegative(factor_kgCO2e_per_kWh)) {
      return err('INVALID_FACTOR');
    }

    const oldEnergy = oldPower_kW * hours;
    const newEnergy = newPower_kW * hours;

    const carbon = carbonAccounting({
      items: [
        {
          label: 'Before',
          quantity: oldEnergy,
          unit: 'kWh',
          factor_kgCO2e_per_unit:
            factor_kgCO2e_per_kWh
        },
        {
          label: 'After',
          quantity: newEnergy,
          unit: 'kWh',
          factor_kgCO2e_per_unit:
            factor_kgCO2e_per_kWh
        }
      ]
    });

    if (carbon.error) {
      return carbon;
    }

    const oldC = carbon.bySource[0].kgCO2e;
    const newC = carbon.bySource[1].kgCO2e;

    const saving = oldC - newC;

    return safeResult({
      oldEnergy_kWh: oldEnergy,
      newEnergy_kWh: newEnergy,
      old_kgCO2e: oldC,
      new_kgCO2e: newC,
      saving_kgCO2e: saving,

      residual_kgCO2e: clean(
        oldC - newC - saving
      )
    });
  }

  /**
   * Integrated product and process-waste accounting.
   *
   * Inputs:
   * reactantInput_g > 0
   * theoreticalProduct_g > 0
   * isolatedYield in [0,1]
   * countedOtherInput_g >= 0
   * product and reactants for atom economy
   *
   * Product =
   * theoretical product * isolated yield.
   *
   * Waste =
   * total counted input - product.
   *
   * Outputs:
   * product_g
   * waste_g
   * atomEconomy_pct
   * eFactor
   * pmi
   * rme_pct
   * residual_g
   */
  function processMetrics({
    reactantInput_g,
    theoreticalProduct_g,
    isolatedYield,
    countedOtherInput_g,
    product,
    reactants
  } = {}) {
    if (
      !positive(reactantInput_g) ||
      !positive(theoreticalProduct_g) ||
      !nonnegative(countedOtherInput_g)
    ) {
      return err('INVALID_MASS');
    }

    if (!fraction(isolatedYield)) {
      return err('INVALID_YIELD');
    }

    if (theoreticalProduct_g > reactantInput_g) {
      return err('PRODUCT_EXCEEDS_INPUT');
    }

    const productMass =
      theoreticalProduct_g * isolatedYield;

    const totalInput =
      reactantInput_g + countedOtherInput_g;

    const waste =
      totalInput - productMass;

    const ae = atomEconomy({
      product,
      reactants
    });

    if (ae.error) {
      return ae;
    }

    const ef = eFactor({
      waste_g: waste,
      product_g: productMass
    });

    if (ef.error) {
      return ef;
    }

    const pmi = processMassIntensity({
      totalInput_g: totalInput,
      product_g: productMass
    });

    if (pmi.error) {
      return pmi;
    }

    const rme = reactionMassEfficiency({
      product_g: productMass,
      reactants_g: reactantInput_g
    });

    if (rme.error) {
      return rme;
    }

    return safeResult({
      product_g: productMass,
      waste_g: waste,
      atomEconomy_pct: ae.atomEconomy_pct,
      eFactor: ef.eFactor,
      pmi: pmi.pmi,
      rme_pct: rme.rme_pct,

      residual_g: clean(
        totalInput - productMass - waste
      )
    });
  }

  /**
   * Cell production converted to recovered biomolecule mass.
   *
   * Inputs:
   * N0
   * r_per_day
   * K (optional)
   * harvestDay
   * stageRecoveries[]
   * massPerCell_kg
   * initialImpurity_kg
   * impurityRemovals[]
   *
   * Each model cell contributes massPerCell_kg of target.
   *
   * Stage recoveries affect wanted material.
   * Impurity removals affect impurities independently.
   *
   * Original outputs and residual fields are preserved.
   */
  function bioprocessBalance({
    N0,
    r_per_day,
    K,
    harvestDay,
    stageRecoveries,
    massPerCell_kg,
    initialImpurity_kg,
    impurityRemovals
  } = {}) {
    if (
      !positive(massPerCell_kg) ||
      !nonnegative(initialImpurity_kg)
    ) {
      return err('INVALID_MASS');
    }

    if (
      !Array.isArray(stageRecoveries) ||
      !Array.isArray(impurityRemovals) ||
      stageRecoveries.length !== impurityRemovals.length ||
      !stageRecoveries.length
    ) {
      return err('INVALID_STAGES');
    }

    if (!impurityRemovals.every(fraction)) {
      return err('INVALID_IMPURITY_REMOVAL');
    }

    const cells = cellProduction({
      N0,
      r_per_day,
      K,
      harvestDay,
      stageRecoveries
    });

    if (cells.error) {
      return cells;
    }

    const harvestMass =
      cells.N_harvest * massPerCell_kg;

    const cascade = recoveryCascade({
      input_kg: harvestMass,
      impurity_kg: initialImpurity_kg,

      stages: stageRecoveries.map(
        (recovery, i) => ({
          name: 'Stage ' + (i + 1),
          recovery,
          impurityRemoval: impurityRemovals[i]
        })
      )
    });

    if (cascade.error) {
      return cascade;
    }

    const finalMass =
      cascade.stageOut_kg[
        cascade.stageOut_kg.length - 1
      ];

    return safeResult({
      N_harvest: cells.N_harvest,
      N_final: cells.N_final,
      harvest_kg: harvestMass,
      final_kg: finalMass,
      purity: cascade.purity,
      overallYield: cascade.overallYield,
      stageOut_kg: cascade.stageOut_kg,
      losses_kg: cascade.losses_kg,
      residual_kg: cascade.residual_kg
    });
  }

  /**
   * Biomass yield from consumed substrate.
   *
   * X_formed = Y_X/S * S_consumed.
   *
   * Inputs:
   * Y_xs >= 0
   * S_consumed >= 0
   *
   * Example:
   * Y_xs = 0.5 g/g
   * S_consumed = 20 g/L
   * X_formed = 10 g/L
   *
   * For compatible dimensional units, the product has
   * the same concentration or mass basis as S_consumed.
   */
  function biomassYield(args = {}) {
    const Y = firstDefined(
      args.Y_xs,
      args.Y_XS,
      args.Y_X_per_S,
      args.Y_X_S,
      args.yield_XS
    );

    const S = firstDefined(
      args.S_consumed,
      args.substrateConsumed_g,
      args.substrate_consumed_g,
      args.substrateConsumed,
      args.S
    );

    if (!nonnegative(Y)) {
      return err('INVALID_YIELD');
    }

    if (!nonnegative(S)) {
      return err('INVALID_MASS');
    }

    const X = Y * S;

    return safeResult({
      X_formed: X,
      X_formed_g: X,
      biomass_formed_g: X,
      residual_g: clean(X - Y * S)
    });
  }

  /**
   * Sequential manufacturing yield.
   *
   * Rolled throughput yield is the product of step yields.
   *
   * overall_yield = product(step_yields)
   *
   * input_needed =
   * target_output / overall_yield
   *
   * Inputs:
   * step_yields[] with fractions in [0,1]
   * target_output >= 0
   *
   * Zero stages give overall yield 1.
   *
   * A zero-yield step produces a MathError because
   * a positive production target cannot be attained by
   * finite input under this model.
   */
  function manufacturingYield(args = {}) {
    const steps = firstDefined(
      args.step_yields,
      args.stepYields,
      args.yields
    );

    const target = firstDefined(
      args.target_output,
      args.targetOutput,
      args.target_output_g
    );

    if (!Array.isArray(steps)) {
      return err('INVALID_STAGES');
    }

    if (steps.length > MAX_STAGES) {
      return err('TOO_MANY_STAGES');
    }

    if (!steps.every(fraction)) {
      return err('INVALID_RECOVERY');
    }

    if (!nonnegative(target)) {
      return err('INVALID_MASS');
    }

    if (steps.some(v => v === 0)) {
      return err(
        'MathError',
        'zero_step_yield'
      );
    }

    const overall = steps.reduce(
      (a, v) => a * v,
      1
    );

    if (overall === 0) {
      return err(
        'MathError',
        'zero_step_yield'
      );
    }

    const input = target / overall;

    return safeResult({
      overall_yield: overall,
      overallYield: overall,
      input_needed: input,
      inputNeeded: input,
      residual: clean(
        input * overall - target
      )
    });
  }

  /**
   * Unified calculation API.
   *
   * Existing browser game methods remain unchanged.
   *
   * Additional snake_case aliases support the KAT input
   * conventions without requiring the games to change.
   */
  return Object.freeze({
    API_VERSION,

    // Original FIT game interfaces.
    mixStreams,
    mixConcentrations,
    recycleLoop,
    recyclePurge,
    recoveryCascade,
    atomEconomy,
    eFactor,
    processMassIntensity,
    reactionMassEfficiency,
    carbonAccounting,
    cellProduction,
    balanceLedger,
    electricityComparison,
    processMetrics,
    bioprocessBalance,

    // Additional calculation methods.
    biomassYield,
    manufacturingYield,

    // KAT-compatible interfaces.
    mix_temperature: mixTemperature,
    mixTemperature,

    recycle,

    recovery_cascade: recoveryCascadeKAT,
    recoveryCascadeKAT,

    e_factor: eFactor,

    carbon_accounting: carbonAccountingKAT,
    carbonAccountingKAT,

    biomass_yield: biomassYield,

    manufacturing_yield: manufacturingYield
  });
})();
/* FIT-CALC-END x3_mass_balance */

export default FITCalcX3;
