/* FIT-CALC-BEGIN x8_algorithms */
const FITCalcX8 = (function () {
  'use strict';

  const API_VERSION = 1;
  const MAX_SAFE = Number.MAX_SAFE_INTEGER;

  function failure(error, reason) {
    return { error, reason };
  }

  function integer(n) {
    return typeof n === 'number' &&
      Number.isSafeInteger(n);
  }

  function number(n) {
    return Number(n);
  }

  function sorted(values) {
    return values.slice().sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0
    );
  }

  function validSequence(seq) {
    if (typeof seq !== 'string') {
      return failure('ConstraintViolation', 'invalid_base');
    }
    const upper = seq.toUpperCase();
    if (/[^ACGT]/.test(upper)) {
      return failure('ConstraintViolation', 'invalid_base');
    }
    if (upper.length > 300) {
      return failure('ConstraintViolation', 'bases_exceed_300');
    }
    return { seq: upper };
  }

  function graphData(graph) {
    if (!graph || typeof graph !== 'object' ||
        Array.isArray(graph)) {
      return failure('ConstraintViolation', 'invalid_graph');
    }

    const names = new Set(Object.keys(graph));
    for (const vertex of Object.keys(graph)) {
      const edges = graph[vertex];
      if (!edges || typeof edges !== 'object' ||
          Array.isArray(edges)) {
        return failure('ConstraintViolation', 'invalid_graph');
      }
      for (const neighbour of Object.keys(edges)) {
        names.add(neighbour);
        if (!integer(edges[neighbour])) {
          return failure('ConstraintViolation', 'invalid_edge_weight');
        }
        if (edges[neighbour] < 0) {
          return failure('ConstraintViolation', 'negative_edge_weight');
        }
      }
    }

    if (names.size > 10) {
      return failure('ConstraintViolation', 'vertices_exceed_10');
    }

    const vertices = sorted([...names]);
    const adjacency = {};
    for (const vertex of vertices) {
      adjacency[vertex] = graph[vertex] || {};
    }

    return { vertices, adjacency };
  }

  function gcdBig(a, b) {
    let oldR = a;
    let r = b;
    let oldS = 1n;
    let s = 0n;
    let oldT = 0n;
    let t = 1n;
    const trace = [];

    while (r !== 0n) {
      const q = oldR / r;
      const nextR = oldR - q * r;
      trace.push([
        number(oldR),
        number(q),
        number(r),
        number(nextR)
      ]);
      [oldR, r] = [r, nextR];
      [oldS, s] = [s, oldS - q * s];
      [oldT, t] = [t, oldT - q * t];
    }

    return {
      gcd: oldR,
      x: oldS,
      y: oldT,
      trace
    };
  }

  function tokensFor(formula) {
    if (typeof formula !== 'string') return null;
    const tokens = [];
    let i = 0;

    while (i < formula.length) {
      if (/\s/.test(formula[i])) {
        i++;
        continue;
      }

      if (formula.slice(i, i + 3) === '<->') {
        tokens.push('<->');
        i += 3;
      } else if (formula.slice(i, i + 2) === '->') {
        tokens.push('->');
        i += 2;
      } else if ('~&|()'.includes(formula[i])) {
        tokens.push(formula[i]);
        i++;
      } else {
        const match = /^[A-Za-z_][A-Za-z_0-9]*/
          .exec(formula.slice(i));
        if (!match) return null;
        tokens.push(match[0]);
        i += match[0].length;
      }
    }
    return tokens;
  }

  /**
   * Evaluate a propositional formula by recursive descent.
   * Input: {formula:string, vars:string[]} (Boolean, dimensionless).
   * Output: {column:number[], class:string}; optional row assignments.
   * Assumptions: ~, &, |, ->, <-> in increasing looseness;
   * implication associates right; first variable is the MSB.
   * Errors: variables_exceed_4; formula_syntax_error.
   * Hand check: P -> Q gives column [1,1,0,1], contingent.
   */
  function truth_table({ formula, vars } = {}) {
    if (!Array.isArray(vars)) {
      return failure('CompileError', 'formula_syntax_error');
    }
    if (vars.length > 4) {
      return failure('ConstraintViolation', 'variables_exceed_4');
    }
    if (new Set(vars).size !== vars.length ||
        vars.some(v => typeof v !== 'string' ||
          !/^[A-Za-z_][A-Za-z_0-9]*$/.test(v))) {
      return failure('CompileError', 'formula_syntax_error');
    }

    const tokens = tokensFor(formula);
    if (!tokens) {
      return failure('CompileError', 'formula_syntax_error');
    }

    let pos = 0;
    const allowed = new Set(vars);

    function atom() {
      const token = tokens[pos++];
      if (token === '(') {
        const value = equivalence();
        if (!value || tokens[pos++] !== ')') return null;
        return value;
      }
      if (allowed.has(token)) return ['var', token];
      return null;
    }

    function unary() {
      if (tokens[pos] === '~') {
        pos++;
        const child = unary();
        return child ? ['not', child] : null;
      }
      return atom();
    }

    function conjunction() {
      let left = unary();
      while (left && tokens[pos] === '&') {
        pos++;
        const right = unary();
        if (!right) return null;
        left = ['and', left, right];
      }
      return left;
    }

    function disjunction() {
      let left = conjunction();
      while (left && tokens[pos] === '|') {
        pos++;
        const right = conjunction();
        if (!right) return null;
        left = ['or', left, right];
      }
      return left;
    }

    function implication() {
      const left = disjunction();
      if (!left) return null;
      if (tokens[pos] === '->') {
        pos++;
        const right = implication();
        return right ? ['implies', left, right] : null;
      }
      return left;
    }

    function equivalence() {
      let left = implication();
      while (left && tokens[pos] === '<->') {
        pos++;
        const right = implication();
        if (!right) return null;
        left = ['iff', left, right];
      }
      return left;
    }

    const tree = equivalence();
    if (!tree || pos !== tokens.length) {
      return failure('CompileError', 'formula_syntax_error');
    }

    function evaluate(node, values) {
      const op = node[0];
      if (op === 'var') return values[node[1]];
      if (op === 'not') return 1 - evaluate(node[1], values);
      const a = evaluate(node[1], values);
      const b = evaluate(node[2], values);
      if (op === 'and') return a & b;
      if (op === 'or') return a | b;
      if (op === 'implies') return a === 1 && b === 0 ? 0 : 1;
      return a === b ? 1 : 0;
    }

    const column = [];
    const assignments = [];
    const count = 2 ** vars.length;

    for (let row = 0; row < count; row++) {
      const values = {};
      vars.forEach((v, j) => {
        values[v] = Math.floor(
          row / (2 ** (vars.length - j - 1))
        ) % 2;
      });
      assignments.push(values);
      column.push(evaluate(tree, values));
    }

    const ones = column.reduce((sum, value) => sum + value, 0);
    return {
      column,
      class: ones === count ? 'tautology' :
        ones === 0 ? 'contradiction' : 'contingent',
      assignments
    };
  }

  /**
   * Extended Euclidean algorithm for non-negative integers.
   * Input: {a:number,b:number}, dimensionless safe integers.
   * Output: {gcd,x,y,steps,first_step,trace}.
   * Assumption: Euclidean division, r0=a and r1=b.
   * Errors: gcd_of_zero_and_zero_undefined;
   * inputs_must_be_non_negative_integers.
   * Hand check: (240,46) gives gcd=2, x=-9, y=47;
   * first division [240,5,46,10] and five steps.
   */
  function euclid({ a, b } = {}) {
    if (!integer(a) || !integer(b) || a < 0 || b < 0) {
      return failure(
        'ConstraintViolation',
        'inputs_must_be_non_negative_integers'
      );
    }
    if (a === 0 && b === 0) {
      return failure('MathError', 'gcd_of_zero_and_zero_undefined');
    }

    const result = gcdBig(BigInt(a), BigInt(b));
    return {
      gcd: number(result.gcd),
      x: number(result.x),
      y: number(result.y),
      steps: result.trace.length,
      first_step: result.trace[0] || null,
      trace: result.trace
    };
  }

  /**
   * Modular addition, subtraction, multiplication, exponentiation
   * and multiplicative inverse.
   * Input: {op:string,a:number,b:number,m:number}, safe integers,
   * all dimensionless; b is unused for inverse.
   * Output: {r:number,trace?:object[]}, 0 <= r < m.
   * Assumptions: BigInt integer arithmetic; exponentiation uses
   * left-to-right processing of the exponent's least-significant
   * bits with repeated squaring.
   * Errors: modulus_must_be_positive, exponent_must_be_non_negative,
   * no_inverse_gcd_not_1, modular_op_not_supported;
   * invalid_integer_input.
   * Hand checks: 7^13 mod 11 = 2;
   * inverse(7,11)=8; (-3+5) mod 7=2.
   */
  function modular({ op, a, b, m } = {}) {
    if (!integer(m) || m <= 0) {
      return failure('ConstraintViolation', 'modulus_must_be_positive');
    }
    if (!['add', 'sub', 'mul', 'pow', 'inverse'].includes(op)) {
      return failure('NotSupported', 'modular_op_not_supported');
    }
    if (!integer(a) ||
        (op !== 'inverse' && !integer(b))) {
      return failure('ConstraintViolation', 'invalid_integer_input');
    }
    if (op === 'pow' && b < 0) {
      return failure(
        'ConstraintViolation',
        'exponent_must_be_non_negative'
      );
    }

    const M = BigInt(m);
    const A = BigInt(a);
    const B = op === 'inverse' ? 0n : BigInt(b);
    const residue = v => (v % M + M) % M;

    if (op === 'add') return { r: number(residue(A + B)) };
    if (op === 'sub') return { r: number(residue(A - B)) };
    if (op === 'mul') return { r: number(residue(A * B)) };

    if (op === 'inverse') {
      const extended = gcdBig(residue(A), M);
      if (extended.gcd !== 1n) {
        return failure('MathError', 'no_inverse_gcd_not_1');
      }
      return { r: number(residue(extended.x)) };
    }

    let exponent = B;
    let base = residue(A);
    let accumulator = 1n % M;
    let bit = 0;
    const trace = [];

    while (exponent > 0n) {
      if ((exponent & 1n) === 1n) {
        accumulator = residue(accumulator * base);
        if (trace.length < 200) {
          trace.push({
            action: 'multiply',
            bit,
            value: number(accumulator)
          });
        }
      }
      base = residue(base * base);
      if (trace.length < 200) {
        trace.push({
          action: 'square',
          bit,
          value: number(base)
        });
      }
      exponent >>= 1n;
      bit++;
    }

    return { r: number(accumulator), trace };
  }

  /**
   * Visit vertices using breadth-first or recursive depth-first search.
   * Input: {graph:adjacencyMap,start:string,kind:'bfs'|'dfs'}.
   * Edge weights are dimensionless and irrelevant to traversal.
   * Output: {order:string[],trace:object[]}.
   * Assumptions: directed edges; ascending neighbour labels.
   * Errors: vertices_exceed_10, unknown_vertex,
   * traversal_kind_not_supported, invalid_graph/edge_weight.
   * Hand check: A->{B,C}, B->{D}, C->{D}:
   * BFS A,B,C,D; DFS A,B,D,C.
   */
  function graph_traverse({ graph, start, kind } = {}) {
    const data = graphData(graph);
    if (data.error) return data;
    if (!data.vertices.includes(start)) {
      return failure('ConstraintViolation', 'unknown_vertex');
    }
    if (kind !== 'bfs' && kind !== 'dfs') {
      return failure(
        'NotSupported',
        'traversal_kind_not_supported'
      );
    }

    const order = [];
    const trace = [];
    const visited = new Set();

    if (kind === 'bfs') {
      const queue = [start];
      visited.add(start);
      while (queue.length) {
        const vertex = queue.shift();
        order.push(vertex);
        for (const next of sorted(
          Object.keys(data.adjacency[vertex])
        )) {
          if (!visited.has(next)) {
            visited.add(next);
            queue.push(next);
          }
        }
        trace.push({ vertex, frontier: queue.slice() });
      }
    } else {
      function visit(vertex) {
        visited.add(vertex);
        order.push(vertex);
        trace.push({ vertex, frontier: [] });
        for (const next of sorted(
          Object.keys(data.adjacency[vertex])
        )) {
          if (!visited.has(next)) visit(next);
        }
      }
      visit(start);
    }

    return { order, trace };
  }

  /**
   * Dijkstra shortest paths from a start vertex.
   * Input: {graph:adjacencyMap,start:string}; weights are
   * non-negative, dimensionless integer costs.
   * Output: {dist,paths,path_to_F,trace,settlement_order}.
   * Unreachable distances and paths are null.
   * Assumptions: directed edges, ascending-label tie-breaking;
   * predecessors change only on strict improvement.
   * Errors: negative_edge_weight, vertices_exceed_10,
   * unknown_vertex, invalid_graph/edge_weight,
   * distance_exceeds_safe_integer.
   * Hand check: A->B=2,A->C=5,B->C=1 gives
   * dist {A:0,B:2,C:3}; path to C is A,B,C.
   */
  function shortest_path({ graph, start } = {}) {
    const data = graphData(graph);
    if (data.error) return data;
    if (!data.vertices.includes(start)) {
      return failure('ConstraintViolation', 'unknown_vertex');
    }

    const distances = {};
    const previous = {};
    const settled = new Set();
    const trace = [];
    const settlement_order = [];

    for (const vertex of data.vertices) {
      distances[vertex] = null;
      previous[vertex] = null;
    }
    distances[start] = 0n;

    while (true) {
      let current = null;

      for (const vertex of data.vertices) {
        if (settled.has(vertex) || distances[vertex] === null) {
          continue;
        }
        if (current === null ||
            distances[vertex] < distances[current]) {
          current = vertex;
        }
      }
      if (current === null) break;

      settled.add(current);
      settlement_order.push(current);

      for (const next of sorted(
        Object.keys(data.adjacency[current])
      )) {
        if (settled.has(next)) continue;
        const candidate = distances[current] +
          BigInt(data.adjacency[current][next]);

        if (candidate > BigInt(MAX_SAFE)) {
          return failure(
            'RuntimeError',
            'distance_exceeds_safe_integer'
          );
        }
        if (distances[next] === null ||
            candidate < distances[next]) {
          distances[next] = candidate;
          previous[next] = current;
        }
      }

      const snapshot = {};
      for (const vertex of data.vertices) {
        snapshot[vertex] = distances[vertex] === null ?
          null : number(distances[vertex]);
      }
      trace.push({
        vertex: current,
        dist: snapshot,
        settled: settlement_order.slice()
      });
    }

    const dist = {};
    const paths = {};

    for (const vertex of data.vertices) {
      dist[vertex] = distances[vertex] === null ?
        null : number(distances[vertex]);

      if (dist[vertex] === null) {
        paths[vertex] = null;
      } else {
        const path = [];
        let at = vertex;
        while (at !== null) {
          path.unshift(at);
          at = previous[at];
        }
        paths[vertex] = path;
      }
    }

    return {
      dist,
      paths,
      path_to_F: paths.F || null,
      trace,
      settlement_order
    };
  }

  const code = Object.freeze({
    TTT:'Phe',TTC:'Phe',TTA:'Leu',TTG:'Leu',
    TCT:'Ser',TCC:'Ser',TCA:'Ser',TCG:'Ser',
    TAT:'Tyr',TAC:'Tyr',TAA:'Stop',TAG:'Stop',
    TGT:'Cys',TGC:'Cys',TGA:'Stop',TGG:'Trp',
    CTT:'Leu',CTC:'Leu',CTA:'Leu',CTG:'Leu',
    CCT:'Pro',CCC:'Pro',CCA:'Pro',CCG:'Pro',
    CAT:'His',CAC:'His',CAA:'Gln',CAG:'Gln',
    CGT:'Arg',CGC:'Arg',CGA:'Arg',CGG:'Arg',
    ATT:'Ile',ATC:'Ile',ATA:'Ile',ATG:'Met',
    ACT:'Thr',ACC:'Thr',ACA:'Thr',ACG:'Thr',
    AAT:'Asn',AAC:'Asn',AAA:'Lys',AAG:'Lys',
    AGT:'Ser',AGC:'Ser',AGA:'Arg',AGG:'Arg',
    GTT:'Val',GTC:'Val',GTA:'Val',GTG:'Val',
    GCT:'Ala',GCC:'Ala',GCA:'Ala',GCG:'Ala',
    GAT:'Asp',GAC:'Asp',GAA:'Glu',GAG:'Glu',
    GGT:'Gly',GGC:'Gly',GGA:'Gly',GGG:'Gly'
  });

  /**
   * Translate a 5'-to-3' DNA coding strand using genetic code 1.
   * Input: {seq:string}, base sequence (dimensionless).
   * Output: {protein:string[],reverse_complement:string,
   * gc_fraction:number|null}.
   * Assumptions: translation begins at the first base and
   * includes the first Stop; incomplete final codons ignored.
   * Errors: invalid_base, bases_exceed_300 (in that order).
   * Hand check: ATGGCTTAA -> [Met,Ala,Stop],
   * reverse complement TTAAGCCAT, GC fraction 3/9.
   */
  function dna({ seq } = {}) {
    const validated = validSequence(seq);
    if (validated.error) return validated;

    const s = validated.seq;
    const protein = [];

    for (let i = 0; i + 3 <= s.length; i += 3) {
      const amino = code[s.slice(i, i + 3)];
      protein.push(amino);
      if (amino === 'Stop') break;
    }

    const complement = { A:'T', T:'A', G:'C', C:'G' };
    const reverse_complement = [...s].reverse()
      .map(base => complement[base]).join('');
    const gc = [...s].filter(base =>
      base === 'G' || base === 'C'
    ).length;

    return {
      protein,
      reverse_complement,
      gc_fraction: s.length ? gc / s.length : null
    };
  }

  /**
   * Find forward-strand ATG-to-stop open reading frames.
   * Input: {seq:string,min_aa:number}; min_aa is a non-negative
   * dimensionless amino-acid count.
   * Output: {orfs:[{frame,start,end,aa}]}.
   * Positions are 1-based base indices; end includes the stop.
   * Assumptions: forward frames 1,2,3; resume after each stop;
   * nested ATGs inside a completed ORF are skipped.
   * Errors: invalid_base, bases_exceed_300,
   * min_aa_must_be_non_negative_integer.
   * Hand check: ATGAAATAA, min_aa=2 yields
   * [{frame:1,start:1,end:9,aa:2}].
   */
  function reading_frames({ seq, min_aa } = {}) {
    const validated = validSequence(seq);
    if (validated.error) return validated;
    if (!integer(min_aa) || min_aa < 0) {
      return failure(
        'ConstraintViolation',
        'min_aa_must_be_non_negative_integer'
      );
    }

    const s = validated.seq;
    const orfs = [];

    for (let frame = 0; frame < 3; frame++) {
      let i = frame;

      while (i + 3 <= s.length) {
        if (s.slice(i, i + 3) !== 'ATG') {
          i += 3;
          continue;
        }

        let stop = -1;
        for (let j = i + 3; j + 3 <= s.length; j += 3) {
          if (code[s.slice(j, j + 3)] === 'Stop') {
            stop = j;
            break;
          }
        }

        if (stop < 0) {
          i += 3;
          continue;
        }

        const aa = (stop - i) / 3;
        if (aa >= min_aa) {
          orfs.push({
            frame: frame + 1,
            start: i + 1,
            end: stop + 3,
            aa
          });
        }
        i = stop + 3;
      }
    }

    return { orfs };
  }

  return Object.freeze({
    API_VERSION,
    truth_table,
    euclid,
    modular,
    graph_traverse,
    shortest_path,
    dna,
    reading_frames
  });
})();
/* FIT-CALC-END x8_algorithms */
export default FITCalcX8;
