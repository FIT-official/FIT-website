/* FIT-CALC-BEGIN ecosystems */
const FITCalcEco = (function () {
  'use strict';

  const err = (error, reason) => ({ error, reason });
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const allFinite = (...a) => a.every(finite);
  const whole = n => Number.isInteger(n) && n >= 0;
  const invalid = () => err('ConstraintViolation', 'invalid_number');
  const overflow = () => err('RuntimeError', 'numeric_overflow');
  const negative = kind => err('ConstraintViolation', 'negative_' + kind);
  const rateError = () => err('ConstraintViolation', 'rate_not_positive');
  const capacityError = () => err('ConstraintViolation', 'carrying_capacity_not_positive');
  const levelError = () => err('ConstraintViolation', 'levels_out_of_range_1_6');

  function analyseWeb(organisms, eats) {
    if (!Array.isArray(organisms) || organisms.length < 2 ||
        organisms.length > 12) {
      return err('ConstraintViolation', 'organisms_out_of_range_2_12');
    }
    if (organisms.some(n => typeof n !== 'string' || !n.length)) {
      return err('ConstraintViolation', 'invalid_organism');
    }
    if (new Set(organisms).size !== organisms.length) {
      return err('ConstraintViolation', 'duplicate_organism');
    }
    if (!Array.isArray(eats)) {
      return err('ConstraintViolation', 'invalid_links');
    }

    const prey = new Map(organisms.map(n => [n, []]));
    const predators = new Map(organisms.map(n => [n, []]));

    for (const link of eats) {
      if (!Array.isArray(link) || link.length !== 2) {
        return err('ConstraintViolation', 'invalid_links');
      }
      const [predator, food] = link;
      if (!prey.has(predator) || !prey.has(food)) {
        return err('ConstraintViolation', 'unknown_organism');
      }
      if (predator === food) {
        return err('ConstraintViolation', 'food_web_has_cycle');
      }
      if (!prey.get(predator).includes(food)) {
        prey.get(predator).push(food);
        predators.get(food).push(predator);
      }
    }

    const state = new Map();
    const levels = new Map();
    const paths = new Map();

    function visit(name) {
      if (state.get(name) === 1) return false;
      if (state.get(name) === 2) return true;
      state.set(name, 1);
      let level = 1;
      let chains = 0;
      const food = prey.get(name);
      for (const item of food) {
        if (!visit(item)) return false;
        level = Math.max(level, levels.get(item) + 1);
        chains += paths.get(item);
      }
      levels.set(name, level);
      paths.set(name, food.length ? chains : 1);
      state.set(name, 2);
      return true;
    }

    for (const name of organisms) {
      if (!visit(name)) {
        return err('ConstraintViolation', 'food_web_has_cycle');
      }
    }
    if (organisms.some(n => !prey.get(n).length &&
        !predators.get(n).length)) {
      return err('ConstraintViolation', 'organism_not_linked');
    }

    const producers = organisms.filter(n => !prey.get(n).length);
    const top_consumers = organisms.filter(n => !predators.get(n).length);
    const max_trophic_level = Object.fromEntries(
      organisms.map(n => [n, levels.get(n)])
    );

    return {
      producers, top_consumers, max_trophic_level, prey, predators,
      chain_count: top_consumers.reduce((s, n) => s + paths.get(n), 0),
      longest_chain: Math.max(...top_consumers.map(n => levels.get(n)))
    };
  }

  /**
   * Inputs: organisms (2–12 names), eats ([predator,prey] pairs).
   * Outputs: producers, top_consumers, chain_count, longest_chain,
   * max_trophic_level (dimensionless). Energy flows prey to predator.
   * Assumption: an acyclic food web with no isolated organisms.
   * Errors: ConstraintViolation organisms_out_of_range_2_12,
   * invalid_organism, duplicate_organism, invalid_links,
   * unknown_organism, food_web_has_cycle, organism_not_linked.
   * Hand check: grass -> rabbit -> fox has one chain, length 3,
   * and levels grass=1, rabbit=2, fox=3.
   */
  function food_web({ organisms, eats } = {}) {
    const w = analyseWeb(organisms, eats);
    if (w.error) return w;
    return {
      producers: w.producers,
      top_consumers: w.top_consumers,
      chain_count: w.chain_count,
      longest_chain: w.longest_chain,
      max_trophic_level: w.max_trophic_level
    };
  }

  /**
   * Inputs: organisms, eats as above; removed (organism name).
   * Outputs: effects (organism -> increase/decrease/unchanged),
   * starving (names in original order).
   * Assumption: first-order direct feeding effects only.
   * Errors: food_web errors; ConstraintViolation unknown_organism.
   * Hand check: remove rabbit from grass -> rabbit -> fox:
   * grass increases, fox decreases, and fox is starving.
   */
  function remove_effect({ organisms, eats, removed } = {}) {
    const w = analyseWeb(organisms, eats);
    if (w.error) return w;
    if (!w.prey.has(removed)) {
      return err('ConstraintViolation', 'unknown_organism');
    }
    const effects = {};
    const starving = [];
    for (const name of organisms) {
      if (name === removed) continue;
      let effect = 'unchanged';
      if (w.prey.get(removed).includes(name)) effect = 'increase';
      if (w.predators.get(removed).includes(name)) effect = 'decrease';
      Object.defineProperty(effects, name, {
        value: effect, enumerable: true, writable: true, configurable: true
      });
      const foods = w.prey.get(name);
      if (foods.length === 1 && foods[0] === removed) starving.push(name);
    }
    return { effects, starving };
  }

  /**
   * Inputs: energy_kJ >=0, efficiency fraction (0,1], levels 1..6.
   * Outputs: energy_by_level_kJ, total_lost_kJ.
   * Assumption: identical efficiency at successive transfers.
   * Errors: ConstraintViolation negative_energy, invalid_number,
   * efficiency_out_of_range_0_1, levels_out_of_range_1_6;
   * RuntimeError numeric_overflow.
   * Hand check: 1000 kJ at 10%, 3 levels -> [1000,100,10],
   * total lost 990 kJ.
   */
  function energy_transfer({ energy_kJ, efficiency, levels } = {}) {
    if (finite(energy_kJ) && energy_kJ < 0) return negative('energy');
    if (!allFinite(energy_kJ, efficiency)) return invalid();
    if (efficiency <= 0 || efficiency > 1) {
      return err('ConstraintViolation', 'efficiency_out_of_range_0_1');
    }
    if (!Number.isInteger(levels) || levels < 1 || levels > 6) {
      return levelError();
    }
    const energy_by_level_kJ = [energy_kJ];
    for (let i = 1; i < levels; i++) {
      const value = energy_by_level_kJ[i - 1] * efficiency;
      if (!finite(value)) return overflow();
      energy_by_level_kJ.push(value);
    }
    return {
      energy_by_level_kJ,
      total_lost_kJ: energy_kJ - energy_by_level_kJ[levels - 1]
    };
  }

  /**
   * Inputs: energy_in_kJ, energy_out_kJ.
   * Outputs: efficiency (fraction), percent (%).
   * Assumption: output energy cannot exceed input energy.
   * Errors: ConstraintViolation negative_energy, invalid_number,
   * output_exceeds_input; MathError division_by_zero.
   * Hand check: input 200 kJ, output 25 kJ -> 0.125, 12.5%.
   */
  function transfer_efficiency({ energy_in_kJ, energy_out_kJ } = {}) {
    if (finite(energy_in_kJ) && energy_in_kJ < 0 ||
        finite(energy_out_kJ) && energy_out_kJ < 0) return negative('energy');
    if (!allFinite(energy_in_kJ, energy_out_kJ)) return invalid();
    if (energy_in_kJ === 0) return err('MathError', 'division_by_zero');
    if (energy_out_kJ > energy_in_kJ) {
      return err('ConstraintViolation', 'output_exceeds_input');
    }
    const efficiency = energy_out_kJ / energy_in_kJ;
    return { efficiency, percent: efficiency * 100 };
  }

  /**
   * Inputs: numbers (whole organisms per level), mass_each_g (g each).
   * Outputs: biomass_g, numbers_shape, biomass_shape.
   * Assumption: a representative individual mass for each level.
   * Errors: ConstraintViolation levels_out_of_range_1_6,
   * length_mismatch, negative_count, invalid_number, invalid_count;
   * RuntimeError numeric_overflow.
   * Hand check: numbers [1,100,10], masses [10000,2,10] g:
   * biomass [10000,200,100] g; numbers irregular, biomass upright.
   */
  function pyramid({ numbers, mass_each_g } = {}) {
    if (!Array.isArray(numbers) || numbers.length < 1 ||
        numbers.length > 6) return levelError();
    if (!Array.isArray(mass_each_g) ||
        numbers.length !== mass_each_g.length) {
      return err('ConstraintViolation', 'length_mismatch');
    }
    if ([...numbers, ...mass_each_g].some(n => finite(n) && n < 0)) {
      return negative('count');
    }
    if ([...numbers, ...mass_each_g].some(n => !finite(n))) return invalid();
    if (numbers.some(n => !whole(n))) {
      return err('ConstraintViolation', 'invalid_count');
    }
    const biomass_g = numbers.map((n, i) => n * mass_each_g[i]);
    if (biomass_g.some(n => !finite(n))) return overflow();

    function shape(a) {
      if (a.every((n, i) => i === 0 || n <= a[i - 1])) return 'upright';
      if (a.every((n, i) => i === 0 || n >= a[i - 1])) return 'inverted';
      return 'irregular';
    }
    return {
      biomass_g,
      numbers_shape: shape(numbers),
      biomass_shape: shape(biomass_g)
    };
  }

  /**
   * Inputs: c0_ppm >=0, factor >=1, levels 1..6.
   * Outputs: concentration_ppm_by_level (ppm).
   * Assumption: constant magnification factor per feeding step.
   * Errors: ConstraintViolation negative_concentration, invalid_number,
   * factor_below_1, levels_out_of_range_1_6;
   * RuntimeError numeric_overflow.
   * Hand check: 0.02 ppm, factor 5, three levels
   * -> [0.02,0.1,0.5] ppm.
   */
  function bioaccumulation({ c0_ppm, factor, levels } = {}) {
    if (finite(c0_ppm) && c0_ppm < 0) return negative('concentration');
    if (!allFinite(c0_ppm, factor)) return invalid();
    if (factor < 1) return err('ConstraintViolation', 'factor_below_1');
    if (!Number.isInteger(levels) || levels < 1 || levels > 6) {
      return levelError();
    }
    const concentration_ppm_by_level = [c0_ppm];
    for (let i = 1; i < levels; i++) {
      const next = concentration_ppm_by_level[i - 1] * factor;
      if (!finite(next)) return overflow();
      concentration_ppm_by_level.push(next);
    }
    return { concentration_ppm_by_level };
  }

  /**
   * Inputs: N0 (individuals), r_per_year, t_years.
   * Outputs: N (individuals), doubling_time_years (null if r<=0).
   * Assumption: unrestricted growth at a fixed per-capita rate.
   * Errors: ConstraintViolation negative_population, invalid_number;
   * RuntimeError numeric_overflow.
   * Hand check: N0=100, r=ln(2)/year, t=2 years
   * -> N=400, doubling time=1 year.
   */
  function exponential({ N0, r_per_year, t_years } = {}) {
    if (finite(N0) && N0 < 0) return negative('population');
    if (!allFinite(N0, r_per_year, t_years)) return invalid();
    const N = N0 === 0 ? 0 : N0 * Math.exp(r_per_year * t_years);
    const doubling_time_years = r_per_year > 0
      ? Math.LN2 / r_per_year : null;
    if (!finite(N) || (doubling_time_years !== null &&
        !finite(doubling_time_years))) return overflow();
    return { N, doubling_time_years };
  }

  /**
   * Inputs: N0, K (individuals), r_per_year, t_years.
   * Outputs: N (individuals), dN_dt_per_year (individuals/year).
   * Assumption: closed logistic population, fixed K; N0>K allowed.
   * Errors: ConstraintViolation negative_population,
   * carrying_capacity_not_positive, invalid_number;
   * MathError population_not_defined; RuntimeError numeric_overflow.
   * Hand check: N0=20, K=100, r=ln(4), t=1 -> N=50,
   * dN/dt=25ln(4) individuals/year.
   */
  function logistic({ N0, r_per_year, K, t_years } = {}) {
    if (finite(N0) && N0 < 0) return negative('population');
    if (finite(K) && K <= 0) return capacityError();
    if (!allFinite(N0, r_per_year, K, t_years)) return invalid();
    if (N0 === 0) return { N: 0, dN_dt_per_year: 0 };
    const q = (K - N0) / N0;
    const z = -r_per_year * t_years;
    let N;
    if (z > 0) {
      const e = Math.exp(-z);
      N = K * e / (e + q);
    } else {
      N = K / (1 + q * Math.exp(z));
    }
    if (!(N >= 0) || !finite(N)) {
      return err('MathError', 'population_not_defined');
    }
    const dN_dt_per_year = r_per_year * N * (1 - N / K);
    if (!finite(dN_dt_per_year)) return overflow();
    return { N, dN_dt_per_year };
  }

  /**
   * Inputs: N0, K, N_target (individuals), r_per_year.
   * Outputs: t_years to reach target, including zero for equal target.
   * Assumption: positive finite time under exact logistic dynamics.
   * Errors: ConstraintViolation negative_population,
   * carrying_capacity_not_positive, invalid_number;
   * MathError target_not_reachable.
   * Hand check: N0=20, K=100, r=ln(4), target=50 -> 1 year.
   */
  function logistic_time({ N0, r_per_year, K, N_target } = {}) {
    if (finite(N0) && N0 < 0 ||
        finite(N_target) && N_target < 0) return negative('population');
    if (finite(K) && K <= 0) return capacityError();
    if (!allFinite(N0, r_per_year, K, N_target)) return invalid();
    if (N_target === N0) return { t_years: 0 };
    if (N0 === 0 || N0 === K || N_target <= 0 ||
        N_target === K || r_per_year === 0) {
      return err('MathError', 'target_not_reachable');
    }
    const ratio = (K / N_target - 1) / (K / N0 - 1);
    if (!(ratio > 0) || !finite(ratio)) {
      return err('MathError', 'target_not_reachable');
    }
    const t_years = -Math.log(ratio) / r_per_year;
    if (!finite(t_years) || t_years <= 0) {
      return err('MathError', 'target_not_reachable');
    }
    return { t_years };
  }

  /**
   * Inputs: r_per_year>0, K>0 (individuals), h_per_year>=0
   * (individuals/year).
   * Outputs: msy_per_year, equilibria (ascending), regime.
   * Assumption: constant quota removed from logistic production.
   * Errors: ConstraintViolation rate_not_positive,
   * carrying_capacity_not_positive, negative_harvest, invalid_number;
   * RuntimeError numeric_overflow.
   * Hand check: r=0.4, K=1000, h=75 -> MSY=100,
   * equilibria [250,750], sustainable.
   */
  function harvest({ r_per_year, K, h_per_year } = {}) {
    if (finite(r_per_year) && r_per_year <= 0) return rateError();
    if (finite(K) && K <= 0) return capacityError();
    if (finite(h_per_year) && h_per_year < 0) {
      return err('ConstraintViolation', 'negative_harvest');
    }
    if (!allFinite(r_per_year, K, h_per_year)) return invalid();
    const msy_per_year = r_per_year * K / 4;
    if (!finite(msy_per_year)) return overflow();
    const tol = 1e-9 * Math.max(1, msy_per_year);
    if (Math.abs(h_per_year - msy_per_year) <= tol) {
      return { msy_per_year, equilibria: [K / 2], regime: 'at_msy' };
    }
    if (h_per_year > msy_per_year) {
      return { msy_per_year, equilibria: [], regime: 'collapse' };
    }
    const d = Math.sqrt(Math.max(0, 1 - h_per_year / msy_per_year));
    return {
      msy_per_year,
      equilibria: [K * (1 - d) / 2, K * (1 + d) / 2],
      regime: 'sustainable'
    };
  }

  /**
   * Inputs: counts (individuals/quadrat), quadrat_area_m2,
   * total_area_m2 (positive m²).
   * Outputs: mean_per_quadrat, density_per_m2,
   * population_estimate, percent_frequency (%).
   * Assumption: representative, equal-area quadrats.
   * Errors: ConstraintViolation empty_data, negative_count,
   * invalid_count, invalid_number, area_not_positive;
   * RuntimeError numeric_overflow.
   * Hand check: [0,2,4,2], quadrat 2m², field 100m² ->
   * mean=2, density=1/m², estimate=100, frequency=75%.
   */
  function quadrat({ counts, quadrat_area_m2, total_area_m2 } = {}) {
    if (!Array.isArray(counts) || !counts.length) {
      return err('ConstraintViolation', 'empty_data');
    }
    if (counts.some(n => finite(n) && n < 0)) return negative('count');
    if (counts.some(n => !whole(n))) {
      return err('ConstraintViolation', 'invalid_count');
    }
    if (finite(quadrat_area_m2) && quadrat_area_m2 <= 0 ||
        finite(total_area_m2) && total_area_m2 <= 0) {
      return err('ConstraintViolation', 'area_not_positive');
    }
    if (!allFinite(quadrat_area_m2, total_area_m2)) return invalid();
    const mean_per_quadrat = counts.reduce((a, b) => a + b, 0) /
      counts.length;
    const density_per_m2 = mean_per_quadrat / quadrat_area_m2;
    const population_estimate = density_per_m2 * total_area_m2;
    const percent_frequency = 100 * counts.filter(n => n > 0).length /
      counts.length;
    if (!allFinite(mean_per_quadrat, density_per_m2,
      population_estimate, percent_frequency)) return overflow();
    return {
      mean_per_quadrat, density_per_m2,
      population_estimate, percent_frequency
    };
  }

  /**
   * Inputs: marked_first M, caught_second C, marked_second R
   * (whole animals); method lincoln_petersen (default) or chapman.
   * Outputs: N_estimate (animals, not rounded).
   * Assumption: closed mixed population and equal catchability.
   * Errors: NotSupported method_not_supported;
   * ConstraintViolation negative_count, invalid_count,
   * recaptures_exceed_catch; MathError no_recaptures;
   * RuntimeError numeric_overflow.
   * Hand check: M=20,C=30,R=10 -> LP=60,
   * Chapman=21*31/11-1=58.18181818.
   */
  function mark_recapture({
    marked_first, caught_second, marked_second,
    method = 'lincoln_petersen'
  } = {}) {
    if (method !== 'lincoln_petersen' && method !== 'chapman') {
      return err('NotSupported', 'method_not_supported');
    }
    const a = [marked_first, caught_second, marked_second];
    if (a.some(n => finite(n) && n < 0)) return negative('count');
    if (a.some(n => !whole(n))) {
      return err('ConstraintViolation', 'invalid_count');
    }
    if (marked_second > caught_second || marked_second > marked_first) {
      return err('ConstraintViolation', 'recaptures_exceed_catch');
    }
    if (method === 'lincoln_petersen' && marked_second === 0) {
      return err('MathError', 'no_recaptures');
    }
    const N_estimate = method === 'chapman'
      ? (marked_first + 1) * (caught_second + 1) /
        (marked_second + 1) - 1
      : marked_first * caught_second / marked_second;
    if (!finite(N_estimate)) return overflow();
    return { N_estimate };
  }

  /**
   * Inputs: counts (whole individuals for each species).
   * Outputs: N, S, simpson_D, simpson_diversity,
   * shannon_H (natural log), evenness (null if S<2).
   * Assumption: distinct species, complete sampled counts.
   * Errors: ConstraintViolation empty_data, negative_count,
   * invalid_count; MathError too_few_individuals;
   * RuntimeError numeric_overflow.
   * Hand check: [2,2] -> N=4,S=2,D=1/3,1-D=2/3,
   * H=ln(2), evenness=1.
   */
  function diversity({ counts } = {}) {
    if (!Array.isArray(counts) || !counts.length) {
      return err('ConstraintViolation', 'empty_data');
    }
    if (counts.some(n => finite(n) && n < 0)) return negative('count');
    if (counts.some(n => !whole(n))) {
      return err('ConstraintViolation', 'invalid_count');
    }
    const N = counts.reduce((a, b) => a + b, 0);
    const S = counts.filter(n => n > 0).length;
    if (N < 2) return err('MathError', 'too_few_individuals');
    const simpson_D = counts.reduce((s, n) => s + n * (n - 1), 0) /
      (N * (N - 1));
    const simpson_diversity = 1 - simpson_D;
    const shannon_H = -counts.reduce((s, n) => {
      if (!n) return s;
      const p = n / N;
      return s + p * Math.log(p);
    }, 0);
    const evenness = S < 2 ? null : shannon_H / Math.log(S);
    if (!allFinite(N, simpson_D, simpson_diversity, shannon_H) ||
        evenness !== null && !finite(evenness)) return overflow();
    return { N, S, simpson_D, simpson_diversity, shannon_H, evenness };
  }

  function validLV({ alpha, beta, gamma, delta, K }) {
    const a = [alpha, beta, gamma, delta];
    if (a.some(n => finite(n) && n <= 0)) return rateError();
    if (K !== null && K !== undefined && finite(K) && K <= 0) {
      return capacityError();
    }
    if (a.some(n => !finite(n)) ||
        K !== null && K !== undefined && !finite(K)) return invalid();
    return null;
  }

  /**
   * Inputs: alpha,gamma (1/year); beta,delta (interaction rates);
   * optional K (prey individuals, null means unlimited).
   * Outputs: prey_star, predator_star (individuals), regime.
   * Assumption: logistic prey limitation only when K is supplied.
   * Errors: ConstraintViolation rate_not_positive,
   * carrying_capacity_not_positive, invalid_number;
   * RuntimeError numeric_overflow.
   * Hand check: alpha=2,beta=.02,gamma=1,delta=.01:
   * (100,100); with K=80 -> (80,0), predator_extinct.
   */
  function lv_equilibrium({ alpha, beta, gamma, delta, K } = {}) {
    const problem = validLV({ alpha, beta, gamma, delta, K });
    if (problem) return problem;
    const x = gamma / delta;
    if (!finite(x)) return overflow();
    if (K != null && x >= K) {
      return { prey_star: K, predator_star: 0, regime: 'predator_extinct' };
    }
    const y = alpha / beta * (K == null ? 1 : 1 - x / K);
    if (!finite(y)) return overflow();
    return { prey_star: x, predator_star: y, regime: 'coexistence' };
  }

  function lvRun(args, trace) {
    const { alpha, beta, gamma, delta, K, x0, y0, dt, steps } = args;
    const problem = validLV({ alpha, beta, gamma, delta, K });
    if (problem) return problem;
    if (finite(x0) && x0 < 0 || finite(y0) && y0 < 0) {
      return negative('population');
    }
    if (!allFinite(x0, y0)) return invalid();
    if (finite(dt) && dt <= 0) {
      return err('MathError', 'dt_must_be_positive');
    }
    if (!finite(dt)) return invalid();
    if (!Number.isInteger(steps) || steps < 1 || steps > 20000) {
      return err('ConstraintViolation', 'steps_out_of_range_1_20000');
    }

    const derivative = (x, y) => ({
      x: alpha * x * (K == null ? 1 : 1 - x / K) - beta * x * y,
      y: delta * x * y - gamma * y
    });

    let x = x0, y = y0;
    let x_max = x, x_min = x, y_max = y, y_min = y;
    const points = trace ? [{ t_years: 0, x, y }] : null;

    for (let i = 1; i <= steps; i++) {
      const a = derivative(x, y);
      const b = derivative(x + dt * a.x / 2, y + dt * a.y / 2);
      const c = derivative(x + dt * b.x / 2, y + dt * b.y / 2);
      const d = derivative(x + dt * c.x, y + dt * c.y);
      x += dt * (a.x + 2 * b.x + 2 * c.x + d.x) / 6;
      y += dt * (a.y + 2 * b.y + 2 * c.y + d.y) / 6;
      if (!allFinite(x, y)) return overflow();
      x_max = Math.max(x_max, x);
      x_min = Math.min(x_min, x);
      y_max = Math.max(y_max, y);
      y_min = Math.min(y_min, y);
      if (trace) points.push({ t_years: i * dt, x, y });
    }
    const result = {
      t_final: steps * dt, x_final: x, y_final: y,
      x_max, x_min, y_max, y_min
    };
    if (trace) result.points = points;
    if (!allFinite(result.t_final, x, y, x_max, x_min, y_max, y_min)) {
      return overflow();
    }
    return result;
  }

  /**
   * Inputs: alpha,beta,gamma,delta, optional K as lv_equilibrium;
   * x0,y0 (individuals), dt (years), steps (integer 1..20000).
   * Outputs: t_final, x_final, y_final, x_max, x_min, y_max, y_min.
   * Assumption: constant-parameter classical fourth-order RK4.
   * Errors: ConstraintViolation rate_not_positive,
   * carrying_capacity_not_positive, negative_population, invalid_number,
   * steps_out_of_range_1_20000; MathError dt_must_be_positive;
   * RuntimeError numeric_overflow.
   * Hand check: alpha=1,x0=10,y0=0,dt=.1,steps=1,K=null
   * -> x_final approximately 11.0517083, y_final=0.
   */
  function lv_simulate(args = {}) {
    return lvRun(args, false);
  }

  /**
   * Inputs: identical to lv_simulate, with same units and errors.
   * Outputs: lv_simulate fields plus points [{t_years,x,y}].
   * Assumption: all RK4 points are recorded, including the start.
   * Errors: same as lv_simulate.
   * Hand check: one step at dt=.1 gives two points at 0 and .1 years.
   */
  function lv_trace(args = {}) {
    return lvRun(args, true);
  }

  /**
   * Inputs: alpha,gamma (positive per-year rates).
   * Outputs: period (years).
   * Assumption: small oscillations without a carrying capacity.
   * Errors: ConstraintViolation rate_not_positive, invalid_number;
   * RuntimeError numeric_overflow.
   * Hand check: alpha=4,gamma=1 -> period=pi years.
   */
  function lv_period({ alpha, gamma } = {}) {
    if (finite(alpha) && alpha <= 0 ||
        finite(gamma) && gamma <= 0) return rateError();
    if (!allFinite(alpha, gamma)) return invalid();
    const period = 2 * Math.PI / Math.sqrt(alpha * gamma);
    if (!finite(period)) return overflow();
    return { period };
  }

  /**
   * Inputs: alpha,beta,gamma,delta (positive model rates),
   * x,y (positive individuals).
   * Outputs: H (conserved model quantity).
   * Assumption: unrestricted prey, no carrying capacity.
   * Errors: ConstraintViolation rate_not_positive, invalid_number;
   * MathError log_of_non_positive; RuntimeError numeric_overflow.
   * Hand check: alpha=2,beta=.5,gamma=3,delta=.25,x=4,y=2:
   * H=2-3ln(4)-2ln(2).
   */
  function lv_invariant({ alpha, beta, gamma, delta, x, y } = {}) {
    const problem = validLV({ alpha, beta, gamma, delta, K: null });
    if (problem) return problem;
    if (finite(x) && x <= 0 || finite(y) && y <= 0) {
      return err('MathError', 'log_of_non_positive');
    }
    if (!allFinite(x, y)) return invalid();
    const H = delta * x - gamma * Math.log(x) +
      beta * y - alpha * Math.log(y);
    if (!finite(H)) return overflow();
    return { H };
  }

  return Object.freeze({
    API_VERSION: 1,
    food_web, remove_effect, energy_transfer, transfer_efficiency,
    pyramid, bioaccumulation, exponential, logistic, logistic_time,
    harvest, quadrat, mark_recapture, diversity, lv_equilibrium,
    lv_simulate, lv_trace, lv_period, lv_invariant
  });
})();
/* FIT-CALC-END ecosystems */
export default FITCalcEco;
