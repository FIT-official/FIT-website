/* FIT-CALC-BEGIN x10_optimisation */
const FITCalcX10 = (function () {
  'use strict';

  const EPS = 1e-9;

  function problem(error, reason) {
    throw { error, reason };
  }

  function requireNumber(x, reason = 'invalid_number') {
    if (typeof x !== 'number' || !Number.isFinite(x)) {
      problem('ConstraintViolation', reason);
    }
    return x;
  }

  function requireArray(x, reason = 'invalid_array') {
    if (!Array.isArray(x)) {
      problem('ConstraintViolation', reason);
    }
    return x;
  }

  function requireFinite(x) {
    if (!Number.isFinite(x)) {
      problem('MathError', 'non_finite_result');
    }
    return x;
  }

  function safe(fn) {
    return function (input) {
      try {
        if (!input || typeof input !== 'object' || Array.isArray(input)) {
          problem('ConstraintViolation', 'invalid_input');
        }
        return fn(input);
      } catch (e) {
        if (e && (
          e.error === 'MathError' ||
          e.error === 'ConstraintViolation' ||
          e.error === 'RuntimeError' ||
          e.error === 'NotSupported'
        )) {
          return { error: e.error, reason: e.reason };
        }
        return { error: 'RuntimeError', reason: 'invalid_structure' };
      }
    };
  }

  function probabilities(values) {
    if (!values.length) {
      problem('ConstraintViolation', 'empty_probabilities');
    }
    let total = 0;
    for (const p of values) {
      requireNumber(p, 'invalid_probability');
      if (p < 0 || p > 1) {
        problem('ConstraintViolation', 'probability_out_of_range');
      }
      total += p;
    }
    if (Math.abs(total - 1) > 1e-9) {
      problem('ConstraintViolation', 'probabilities_must_sum_to_1');
    }
  }

  /**
   * End-of-period discounted cash-flow analysis.
   * Input: {rate: decimal discount rate per period,
   *         flows: cash flows at periods 0,...,n}, n <= 10.
   * Output: {npv: money, irr: decimal rate|null,
   *          payback: periods|null, cumulative: money[],
   *          discounted: money[]}.
   * Assumptions: constant discount rate, end-of-period payments,
   * linear interpolation for undiscounted payback.
   * Errors: MathError/rate_must_exceed_minus_1;
   * ConstraintViolation/periods_exceed_10, invalid_flows;
   * MathError/non_finite_result.
   * Hand check: rate .1, flows [-100,60,60] gives
   * NPV 4.132231404958674, IRR about .1306623863,
   * payback 1 + 40/60 = 1.6666666667 periods.
   */
  function cash_flow(input) {
    const rate = requireNumber(input.rate, 'invalid_rate');
    const flows = requireArray(input.flows, 'invalid_flows');

    if (rate <= -1) {
      problem('MathError', 'rate_must_exceed_minus_1');
    }
    if (flows.length > 11) {
      problem('ConstraintViolation', 'periods_exceed_10');
    }
    if (flows.length === 0) {
      problem('ConstraintViolation', 'invalid_flows');
    }

    flows.forEach(x => requireNumber(x, 'invalid_flows'));

    function npvAt(r) {
      let sum = 0;
      let factor = 1;
      for (let t = 0; t < flows.length; t++) {
        if (t > 0) factor *= 1 + r;
        sum += flows[t] / factor;
      }
      return requireFinite(sum);
    }

    const npv = npvAt(rate);
    const cumulative = [];
    const discounted = [];
    let running = 0;
    let factor = 1;
    let payback = null;

    for (let t = 0; t < flows.length; t++) {
      const before = running;
      running = requireFinite(running + flows[t]);
      cumulative.push(running);

      if (t > 0) factor *= 1 + rate;
      discounted.push(requireFinite(flows[t] / factor));

      if (
        t > 0 &&
        payback === null &&
        before < 0 &&
        running >= 0 &&
        flows[t] > 0
      ) {
        payback = (t - 1) + (-before / flows[t]);
      }
    }

    let changes = 0;
    let previousSign = 0;

    for (const flow of flows) {
      const sign = Math.sign(flow);
      if (!sign) continue;
      if (previousSign && sign !== previousSign) changes++;
      previousSign = sign;
    }

    let irr = null;

    if (changes === 1) {
      let low = -0.99;
      let high = 10;
      let fLow = npvAt(low);
      let fHigh = npvAt(high);

      if (fLow === 0) {
        irr = low;
      } else if (fHigh === 0) {
        irr = high;
      } else if (Math.sign(fLow) !== Math.sign(fHigh)) {
        for (let k = 0; k < 180; k++) {
          const mid = (low + high) / 2;
          const fMid = npvAt(mid);

          if (fMid === 0) {
            low = mid;
            high = mid;
            break;
          }

          if (Math.sign(fMid) === Math.sign(fLow)) {
            low = mid;
            fLow = fMid;
          } else {
            high = mid;
            fHigh = fMid;
          }

          if (high - low < 1e-14) break;
        }
        irr = (low + high) / 2;
      }
    }

    return { npv, irr, payback, cumulative, discounted };
  }

  /**
   * Evaluate a finite decision/chance tree by backward induction.
   * Input: {tree}; decisions contain options keyed by names,
   * chance nodes contain branches [{p,node}], leaves contain {value}.
   * Output: {emv: money, best: chosen option names[]}.
   * Assumptions: risk-neutral decision maker; probabilities dimensionless;
   * ties resolved by alphabetical option name.
   * Errors: ConstraintViolation/probabilities_must_sum_to_1,
   * invalid_tree, invalid_probability; RuntimeError/tree_too_deep.
   * Hand check: choose between chance(.5*20 + .5*0)
   * and a certain 9; EMV 10, best ['Risky'].
   */
  function decision_tree(input) {
    function visit(node, depth) {
      if (depth > 100) {
        problem('RuntimeError', 'tree_too_deep');
      }
      if (!node || typeof node !== 'object' || Array.isArray(node)) {
        problem('ConstraintViolation', 'invalid_tree');
      }

      if (Object.prototype.hasOwnProperty.call(node, 'value')) {
        return {
          value: requireNumber(node.value, 'invalid_leaf_value'),
          best: []
        };
      }

      if (node.type === 'chance') {
        const branches = requireArray(node.branches, 'invalid_tree');
        probabilities(branches.map(b => {
          if (!b || typeof b !== 'object') {
            problem('ConstraintViolation', 'invalid_tree');
          }
          return b.p;
        }));

        let value = 0;
        for (const branch of branches) {
          value += branch.p * visit(branch.node, depth + 1).value;
        }
        return { value: requireFinite(value), best: [] };
      }

      if (node.type === 'decision') {
        const options = node.options;
        if (!options || typeof options !== 'object' ||
            Array.isArray(options)) {
          problem('ConstraintViolation', 'invalid_tree');
        }

        const names = Object.keys(options).sort();
        if (!names.length) {
          problem('ConstraintViolation', 'empty_options');
        }

        let chosen = null;
        let highest = -Infinity;
        let chosenPath = [];

        for (const name of names) {
          const result = visit(options[name], depth + 1);
          if (chosen === null || result.value > highest + EPS) {
            chosen = name;
            highest = result.value;
            chosenPath = result.best;
          }
        }

        return {
          value: requireFinite(highest),
          best: [chosen, ...chosenPath]
        };
      }

      problem('NotSupported', 'unknown_node_type');
    }

    const result = visit(input.tree, 0);
    return { emv: result.value, best: result.best };
  }

  /**
   * Expected value of perfect information for a payoff matrix.
   * Input: {payoff: [action][state] in money, prior: probabilities[]}.
   * Output: {emv, best_action, ev_perfect_info, evpi,
   *          action_emvs: money[]}.
   * Assumptions: risk-neutral action selection, all states observable
   * under perfect information; ties use the lowest action index.
   * Errors: ConstraintViolation/probabilities_must_sum_to_1,
   * invalid_payoff, invalid_probability.
   * Hand check: payoff [[10,0],[0,8]], prior [.5,.5]:
   * EMV 5, best action 0, perfect information 9, EVPI 4.
   */
  function evpi(input) {
    const payoff = requireArray(input.payoff, 'invalid_payoff');
    const prior = requireArray(input.prior, 'invalid_probability');

    probabilities(prior);

    if (!payoff.length || payoff.some(row =>
      !Array.isArray(row) || row.length !== prior.length
    )) {
      problem('ConstraintViolation', 'invalid_payoff');
    }

    payoff.forEach(row =>
      row.forEach(x => requireNumber(x, 'invalid_payoff'))
    );

    const action_emvs = payoff.map(row =>
      requireFinite(row.reduce((sum, value, s) =>
        sum + value * prior[s], 0
      ))
    );

    let best_action = 0;
    for (let a = 1; a < action_emvs.length; a++) {
      if (action_emvs[a] > action_emvs[best_action] + EPS) {
        best_action = a;
      }
    }

    const emv = action_emvs[best_action];

    let ev_perfect_info = 0;
    for (let s = 0; s < prior.length; s++) {
      let best = payoff[0][s];
      for (let a = 1; a < payoff.length; a++) {
        best = Math.max(best, payoff[a][s]);
      }
      ev_perfect_info += prior[s] * best;
    }

    ev_perfect_info = requireFinite(ev_perfect_info);
    let difference = requireFinite(ev_perfect_info - emv);
    if (Math.abs(difference) < 1e-10) difference = 0;

    return {
      emv,
      best_action,
      ev_perfect_info,
      evpi: difference,
      action_emvs
    };
  }

  /**
   * Maximise a linear objective over a two-variable feasible region.
   * Input: {c: [c1,c2] money per unit,
   *         constraints: [{a:[a1,a2],b,sense:'<='|'>='}]}.
   * Output: {status:'optimal'|'infeasible'|'unbounded',
   *          x: [x,y]|null, objective: money|null,
   *          alternative_optima: boolean,
   *          vertices: [{x:[x,y],objective}]}.
   * Assumptions: continuous non-negative x,y, linear constraints;
   * intersections enumerated exactly up to floating-point tolerances.
   * Unboundedness is determined by the recession cone, not a box.
   * Errors: ConstraintViolation/invalid_lp;
   * NotSupported/unsupported_constraint_sense.
   * Hand check: maximise 3x+2y, x+y<=4, x<=2.
   * Optimum (2,2), objective 10; no alternative optimum.
   */
  function lp2(input) {
    const c = requireArray(input.c, 'invalid_lp');
    const supplied = requireArray(input.constraints, 'invalid_lp');

    if (c.length !== 2) {
      problem('ConstraintViolation', 'variables_must_equal_2');
    }
    c.forEach(x => requireNumber(x, 'invalid_lp'));

    const constraints = supplied.map(q => {
      if (!q || typeof q !== 'object' ||
          !Array.isArray(q.a) || q.a.length !== 2) {
        problem('ConstraintViolation', 'invalid_lp');
      }
      q.a.forEach(x => requireNumber(x, 'invalid_lp'));
      requireNumber(q.b, 'invalid_lp');

      const sense = q.sense === undefined ? '<=' : q.sense;
      if (sense !== '<=' && sense !== '>=') {
        problem('NotSupported', 'unsupported_constraint_sense');
      }
      return { a: q.a, b: q.b, sense };
    });

    const lines = [
      { a: [1, 0], b: 0 },
      { a: [0, 1], b: 0 },
      ...constraints
    ];

    function feasible(x, y) {
      if (x < -EPS || y < -EPS) return false;

      return constraints.every(q => {
        const v = q.a[0] * x + q.a[1] * y;
        const slack = EPS * Math.max(
          1, Math.abs(v), Math.abs(q.b)
        );
        return q.sense === '<='
          ? v <= q.b + slack
          : v >= q.b - slack;
      });
    }

    const vertices = [];

    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        const u = lines[i];
        const v = lines[j];

        const determinant =
          u.a[0] * v.a[1] - u.a[1] * v.a[0];

        if (Math.abs(determinant) < 1e-12) continue;

        let x = (u.b * v.a[1] - u.a[1] * v.b) / determinant;
        let y = (u.a[0] * v.b - u.b * v.a[0]) / determinant;

        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (!feasible(x, y)) continue;

        if (Math.abs(x) < EPS) x = 0;
        if (Math.abs(y) < EPS) y = 0;

        if (vertices.some(p =>
          Math.abs(p.x[0] - x) < EPS &&
          Math.abs(p.x[1] - y) < EPS
        )) continue;

        vertices.push({
          x: [x, y],
          objective: requireFinite(c[0] * x + c[1] * y)
        });
      }
    }

    vertices.sort((a, b) =>
      a.x[0] - b.x[0] || a.x[1] - b.x[1]
    );

    if (!vertices.length) {
      return {
        status: 'infeasible',
        x: null,
        objective: null,
        alternative_optima: false,
        vertices: []
      };
    }

    const directions = [[1, 0], [0, 1]];

    for (const q of constraints) {
      const [a, b] = q.a;
      if (Math.abs(a) + Math.abs(b) < 1e-14) continue;

      const magnitude = Math.max(Math.abs(a), Math.abs(b));
      directions.push([-b / magnitude, a / magnitude]);
      directions.push([b / magnitude, -a / magnitude]);
    }

    function feasibleRay(d) {
      if (d[0] < -EPS || d[1] < -EPS) return false;

      return constraints.every(q => {
        const dot = q.a[0] * d[0] + q.a[1] * d[1];
        const tol = EPS * Math.max(
          1, Math.abs(q.a[0]), Math.abs(q.a[1])
        );
        return q.sense === '<='
          ? dot <= tol
          : dot >= -tol;
      });
    }

    const rays = directions.filter(feasibleRay);

    if (rays.some(d => c[0] * d[0] + c[1] * d[1] > EPS)) {
      return {
        status: 'unbounded',
        x: null,
        objective: null,
        alternative_optima: false,
        vertices
      };
    }

    let bestValue = -Infinity;

    for (const vertex of vertices) {
      if (vertex.objective > bestValue) {
        bestValue = vertex.objective;
      }
    }

    const tol = EPS * Math.max(1, Math.abs(bestValue));
    const optimisers = vertices.filter(p =>
      Math.abs(p.objective - bestValue) <= tol
    );

    const optimum = optimisers[0];

    const flatRay = rays.some(d =>
      Math.abs(c[0] * d[0] + c[1] * d[1]) <= EPS &&
      Math.abs(d[0]) + Math.abs(d[1]) > EPS
    );

    return {
      status: 'optimal',
      x: optimum.x.slice(),
      objective: requireFinite(bestValue),
      alternative_optima: optimisers.length > 1 || flatRay,
      vertices
    };
  }

  /**
   * Pure and completely mixed Nash equilibria of a small bimatrix game.
   * Input: {A: row-player payoff matrix, B: column-player payoff matrix,
   *         q_col1?: probability of column 0 for payoff plotting}.
   * Output: {pure: [[row,col],...],
   *          mixed: {p_row1,q_col1}|null,
   *          row_expected: number[]|null}.
   * Payoffs are in utility points; probabilities are dimensionless.
   * Assumptions: simultaneous play, weak best responses count.
   * A mixed equilibrium is reported only for a 2x2 game with no
   * pure equilibrium and a strictly interior solution.
   * Errors: ConstraintViolation/strategies_exceed_3,
   * invalid_payoff, invalid_probability.
   * Hand check: matching pennies A=[[1,-1],[-1,1]], B=-A
   * has no pure equilibrium and p_row1=q_col1=.5.
   */
  function nash(input) {
    const A = requireArray(input.A, 'invalid_payoff');
    const B = requireArray(input.B, 'invalid_payoff');

    const rows = A.length;
    const cols = rows && Array.isArray(A[0]) ? A[0].length : 0;

    if (rows > 3 || cols > 3 || B.length > 3 ||
        B.some(row => Array.isArray(row) && row.length > 3)) {
      problem('ConstraintViolation', 'strategies_exceed_3');
    }

    if (
      rows < 1 || cols < 1 ||
      A.some(row => !Array.isArray(row) || row.length !== cols) ||
      B.length !== rows ||
      B.some(row => !Array.isArray(row) || row.length !== cols)
    ) {
      problem('ConstraintViolation', 'invalid_payoff');
    }

    for (const matrix of [A, B]) {
      matrix.forEach(row =>
        row.forEach(x => requireNumber(x, 'invalid_payoff'))
      );
    }

    const pure = [];

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const rowBest = A.every(row =>
          A[i][j] >= row[j] - EPS
        );

        const colBest = B[i].every(value =>
          B[i][j] >= value - EPS
        );

        if (rowBest && colBest) pure.push([i, j]);
      }
    }

    let mixed = null;

    if (rows === 2 && cols === 2 && pure.length === 0) {
      const denomP =
        B[0][0] - B[0][1] - B[1][0] + B[1][1];

      const denomQ =
        A[0][0] - A[0][1] - A[1][0] + A[1][1];

      if (Math.abs(denomP) > 1e-14 &&
          Math.abs(denomQ) > 1e-14) {
        const p = (B[1][1] - B[1][0]) / denomP;
        const q = (A[1][1] - A[0][1]) / denomQ;

        if (p > 0 && p < 1 && q > 0 && q < 1) {
          mixed = { p_row1: p, q_col1: q };
        }
      }
    }

    let row_expected = null;

    if (Object.prototype.hasOwnProperty.call(input, 'q_col1')) {
      const q = requireNumber(input.q_col1, 'invalid_probability');

      if (q < 0 || q > 1) {
        problem('ConstraintViolation', 'probability_out_of_range');
      }

      if (cols === 2) {
        row_expected = A.map(row =>
          requireFinite(q * row[0] + (1 - q) * row[1])
        );
      }
    }

    return { pure, mixed, row_expected };
  }

  /**
   * Left-to-right alpha-beta minimax on nested arrays.
   * Input: {tree: nested arrays with finite numeric leaves}.
   * Output: {value: utility points, leaves_evaluated: integer,
   *          leaves_pruned: integer, visited_leaf_ids: integer[],
   *          pruned_leaf_ids: integer[], leaf_values: number[]}.
   * Assumptions: MAX at root; alternating MIN/MAX on each edge;
   * depth counted as edges from root to deepest leaf.
   * Errors: ConstraintViolation/tree_depth_exceeds_4,
   * invalid_tree; MathError/non_finite_result.
   * Hand check: [[3,5],[2,9]] has value 3;
   * three leaves evaluated and the final leaf pruned.
   */
  function minimax(input) {
    const leaf_values = [];

    function inspect(node, depth) {
      if (depth > 4) {
        problem('ConstraintViolation', 'tree_depth_exceeds_4');
      }

      if (typeof node === 'number') {
        requireNumber(node, 'invalid_leaf_value');
        leaf_values.push(node);
        return 1;
      }

      if (!Array.isArray(node) || node.length === 0) {
        problem('ConstraintViolation', 'invalid_tree');
      }

      let count = 0;
      for (const child of node) {
        count += inspect(child, depth + 1);
      }
      return count;
    }

    inspect(input.tree, 0);

    const visited_leaf_ids = [];

    function countLeaves(node) {
      if (typeof node === 'number') return 1;
      let total = 0;
      for (const child of node) total += countLeaves(child);
      return total;
    }

    function search(node, maximizing, alpha, beta, offset) {
      if (typeof node === 'number') {
        visited_leaf_ids.push(offset);
        return node;
      }

      let value = maximizing ? -Infinity : Infinity;
      let nextOffset = offset;

      for (const child of node) {
        const result = search(
          child, !maximizing, alpha, beta, nextOffset
        );

        if (maximizing) {
          value = Math.max(value, result);
          alpha = Math.max(alpha, value);
        } else {
          value = Math.min(value, result);
          beta = Math.min(beta, value);
        }

        nextOffset += countLeaves(child);

        if (alpha >= beta) break;
      }

      return requireFinite(value);
    }

    const value = search(input.tree, true, -Infinity, Infinity, 0);
    const visited = new Set(visited_leaf_ids);
    const pruned_leaf_ids = [];

    for (let i = 0; i < leaf_values.length; i++) {
      if (!visited.has(i)) pruned_leaf_ids.push(i);
    }

    return {
      value,
      leaves_evaluated: visited_leaf_ids.length,
      leaves_pruned: pruned_leaf_ids.length,
      visited_leaf_ids,
      pruned_leaf_ids,
      leaf_values
    };
  }

  /**
   * Deterministic, synchronous Bellman value iteration on a grid.
   * Input: {grid:{rows,cols,gamma,step_reward?,
   *               terminals:[[row,col,reward],...],
   *               walls?:[[row,col],...]},horizon?:integer}.
   * Output: {V: number|null [rows][cols],
   *          policy: {'row,col':'N'|'E'|'S'|'W'},
   *          sweeps: integer, delta_history: number[]}.
   * Rewards are utility points per move; gamma is dimensionless;
   * coordinates are zero-based grid indices.
   * Assumptions: deterministic moves, N/E/S/W tie priority,
   * bumps leave the agent in place, terminal V=0 and the
   * terminal reward is received upon entry.
   * Without a horizon, the sup-norm convergence threshold is 1e-13.
   * Errors: ConstraintViolation/grid_exceeds_16_states,
   * gamma_must_be_below_1, invalid_grid, invalid_horizon;
   * RuntimeError/iteration_cap_reached.
   * Hand check: 1x2 grid, right cell terminal reward 5,
   * gamma .9, step reward 0: V=[[5,0]], policy {'0,0':'E'}.
   */
  function value_iteration(input) {
    const grid = input.grid;

    if (!grid || typeof grid !== 'object') {
      problem('ConstraintViolation', 'invalid_grid');
    }

    const { rows, cols } = grid;
    const gamma = requireNumber(grid.gamma, 'invalid_gamma');
    const step = grid.step_reward === undefined
      ? 0
      : requireNumber(grid.step_reward, 'invalid_step_reward');

    if (!Number.isInteger(rows) || !Number.isInteger(cols) ||
        rows < 1 || cols < 1) {
      problem('ConstraintViolation', 'invalid_grid');
    }

    if (rows * cols > 16) {
      problem('ConstraintViolation', 'grid_exceeds_16_states');
    }

    const hasHorizon = input.horizon !== undefined;

    if (gamma < 0) {
      problem('ConstraintViolation', 'invalid_gamma');
    }

    if (!hasHorizon && gamma >= 1) {
      problem('ConstraintViolation', 'gamma_must_be_below_1');
    }

    if (hasHorizon &&
        (!Number.isInteger(input.horizon) ||
         input.horizon < 0 || input.horizon > 10000)) {
      problem('ConstraintViolation', 'invalid_horizon');
    }

    const terminals = requireArray(grid.terminals, 'invalid_grid');
    const wallList = grid.walls === undefined
      ? []
      : requireArray(grid.walls, 'invalid_grid');

    const rewards = new Map();
    const walls = new Set();

    function key(r, c) {
      return r + ',' + c;
    }

    function coordinate(r, c) {
      if (!Number.isInteger(r) || !Number.isInteger(c) ||
          r < 0 || r >= rows || c < 0 || c >= cols) {
        problem('ConstraintViolation', 'invalid_grid_coordinate');
      }
    }

    for (const wall of wallList) {
      if (!Array.isArray(wall) || wall.length !== 2) {
        problem('ConstraintViolation', 'invalid_grid');
      }
      coordinate(wall[0], wall[1]);
      walls.add(key(wall[0], wall[1]));
    }

    for (const terminal of terminals) {
      if (!Array.isArray(terminal) || terminal.length !== 3) {
        problem('ConstraintViolation', 'invalid_grid');
      }
      coordinate(terminal[0], terminal[1]);

      const k = key(terminal[0], terminal[1]);
      if (walls.has(k) || rewards.has(k)) {
        problem('ConstraintViolation', 'overlapping_grid_cells');
      }

      rewards.set(
        k, requireNumber(terminal[2], 'invalid_terminal_reward')
      );
    }

    const moves = [
      ['N', -1, 0],
      ['E', 0, 1],
      ['S', 1, 0],
      ['W', 0, -1]
    ];

    function nextCell(r, c, dr, dc) {
      const nr = r + dr;
      const nc = c + dc;

      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols ||
          walls.has(key(nr, nc))) {
        return [r, c];
      }
      return [nr, nc];
    }

    function actionValue(r, c, move, V) {
      const [nr, nc] = nextCell(r, c, move[1], move[2]);
      const terminalReward = rewards.get(key(nr, nc)) || 0;
      return requireFinite(
        step + terminalReward + gamma * V[nr][nc]
      );
    }

    let V = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) =>
        walls.has(key(r, c)) ? null : 0
      )
    );

    const delta_history = [];
    let sweeps = 0;
    const limit = hasHorizon ? input.horizon : 100000;

    while (sweeps < limit) {
      const next = V.map(row => row.slice());
      let delta = 0;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const k = key(r, c);

          if (walls.has(k) || rewards.has(k)) continue;

          let best = -Infinity;
          for (const move of moves) {
            best = Math.max(best, actionValue(r, c, move, V));
          }

          next[r][c] = requireFinite(best);
          delta = Math.max(delta, Math.abs(best - V[r][c]));
        }
      }

      V = next;
      sweeps++;

      if (delta_history.length < 200) {
        delta_history.push(delta);
      }

      if (!hasHorizon && delta < 1e-13) break;
    }

    if (!hasHorizon && sweeps === limit &&
        delta_history[delta_history.length - 1] >= 1e-13) {
      problem('RuntimeError', 'iteration_cap_reached');
    }

    const policy = {};

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = key(r, c);
        if (walls.has(k) || rewards.has(k)) continue;

        let best = -Infinity;
        let chosen = 'N';

        for (const move of moves) {
          const value = actionValue(r, c, move, V);
          if (value > best + 1e-12) {
            best = value;
            chosen = move[0];
          }
        }

        policy[k] = chosen;
      }
    }

    return { V, policy, sweeps, delta_history };
  }

  return Object.freeze({
    API_VERSION: 1,
    cash_flow: safe(cash_flow),
    decision_tree: safe(decision_tree),
    evpi: safe(evpi),
    lp2: safe(lp2),
    nash: safe(nash),
    minimax: safe(minimax),
    value_iteration: safe(value_iteration)
  });
})();
/* FIT-CALC-END x10_optimisation */
export default FITCalcX10;
