import { pick, int, near, fmt } from '../adapter.js'
import { lineY, gradient, interceptOf, onLine, leastSquares, sse, calibrate, solve2, readLine } from './engine.js'

const C = { f: '#5cc8ff', d: '#ff5c8a', t: '#ffd166', you: '#2ee6a6' }
const xs = (lo, hi, n = 2) => Array.from({ length: n }, (_, i) => lo + (hi - lo) * i / (n - 1))
const sign = v => (v < 0 ? `− ${fmt(-v)}` : `+ ${fmt(v)}`)
const meta = (o) => ({ concept: 'linear-graphs', accent: '#2ec4b6', ages: o.level === 'Primary' ? '9+' : o.level === 'Secondary' ? '13+' : '16+', steps: o.steps || [], teacher: o.teacher || '', transfer: o.transfer || '', ...o })

export const defs = {
  'linear-plant-tracker': {
    id: 'linear-plant-tracker', title: 'Plant Tracker', short: 'Plant Tracker', eyebrow: 'LINE GRAPHS / READ THE STORY',
    subtitle: 'A sunflower’s height was measured every week. Read the line graph to answer each question.',
    model: 'Points are measured heights joined by straight segments. Reading between weeks assumes steady growth within that week.',
    meta: meta({ level: 'Primary', subject: 'Maths', topic: 'Line graphs', difficulty: 1, difficultyLabel: 'Introductory', symbol: '🌻', question: 'What does a line graph tell you between the dots?', tags: ['line graph', 'reading scales', 'data'],
      objective: 'Read and interpret values, increases and the steepest part of a line graph.', syllabus: 'PriMaths 2021 §P4 Tables, Line Graphs and Pie Charts 1.1–1.2, p.40' }),
    make(rng, level) {
      let h = int(rng, 2, 6); const pts = [[0, h]]
      for (let w = 1; w <= 6; w++) { h += int(rng, 1, 6) * 2; pts.push([w, h]) }
      const kind = level <= 2 ? 'value' : level <= 4 ? 'increase' : 'steepest'
      const wk = int(rng, 1, 6), a = int(rng, 0, 3), b = int(rng, 4, 6)
      const prompt = kind === 'value' ? `How tall was the sunflower in week ${wk}?` : kind === 'increase' ? `By how many cm did it grow from week ${a} to week ${b}?` : 'In which week did it grow the most? Set the week number it ended.'
      return { pts, kind, wk, a, b, prompt }
    },
    initial: () => ({ v: 0 }),
    controls: ch => [{ key: 'v', label: ch.kind === 'steepest' ? 'Week' : 'Answer', unit: ch.kind === 'steepest' ? '' : 'cm', step: 1, coarse: ch.kind === 'steepest' ? 0 : 5, min: 0, max: 60 }],
    solution(ch) {
      if (ch.kind === 'value') return { v: readLine(ch.pts, ch.wk) }
      if (ch.kind === 'increase') return { v: ch.pts[ch.b][1] - ch.pts[ch.a][1] }
      let best = 1; for (let i = 2; i <= 6; i++) if (ch.pts[i][1] - ch.pts[i - 1][1] > ch.pts[best][1] - ch.pts[best - 1][1]) best = i
      return { v: best }
    },
    check(ch, ans) { const s = this.solution(ch).v; return ch.kind === 'steepest' ? ch.pts[ans.v] && ch.pts[ans.v - 1] && ch.pts[ans.v][1] - ch.pts[ans.v - 1][1] === ch.pts[s][1] - ch.pts[s - 1][1] : ans.v === s },
    explain: ch => (ch.kind === 'steepest' ? 'The steepest segment shows the biggest growth in one week.' : 'Read across from the line to the height axis, using the scale.'),
    hint: ch => (ch.kind === 'value' ? `Find week ${ch.wk} on the bottom axis, go up to the line, then across.` : ch.kind === 'increase' ? 'Read both heights, then subtract the smaller from the larger.' : 'Look for the steepest piece of the line.'),
    plots: (ch, ans) => [{ title: 'Sunflower height each week', x: { label: 'Week', min: 0, max: 6 }, y: { label: 'Height', unit: 'cm', min: 0, max: Math.ceil(ch.pts[6][1] / 10) * 10 + 10 }, series: [{ color: C.t, dots: true, points: ch.pts }],
      marks: ch.kind === 'value' ? [{ x: ch.wk, y: ans.v, label: 'you', color: C.you }] : ch.kind === 'steepest' && ans.v >= 1 && ans.v <= 6 ? [{ x: ans.v, y: ch.pts[ans.v][1], label: 'you', color: C.you }] : [] }],
    figure: () => '<h3>Reading a line graph</h3><p>Each dot is a measurement. A steeper line means faster growth.</p>',
  },
  'linear-ramp-rescue': {
    id: 'linear-ramp-rescue', title: 'Ramp Rescue', short: 'Ramp Rescue', eyebrow: 'LINEAR GRAPHS / y = mx + c',
    subtitle: 'Tune the gradient and the y-intercept so the ramp passes through every checkpoint.',
    model: 'y = mx + c. m is the vertical change for each unit of horizontal change; c is where the line crosses the y-axis. Two points fix a straight line.',
    meta: meta({ level: 'Secondary', subject: 'Maths', topic: 'Linear graphs', difficulty: 1, difficultyLabel: 'Introductory', symbol: '📏', question: 'Which line passes through both flags?', tags: ['gradient', 'intercept', 'y = mx + c'],
      objective: 'Plot y = mx + c and interpret the gradient as vertical change over horizontal change.', syllabus: 'SecMaths G3 2020 §N6 Functions and graphs 6.1–6.5, p.18' }),
    make(rng, level) {
      const m = pick(rng, level <= 3 ? [-2, -1, 1, 2, 3] : [-1.5, -0.5, 0.5, 1.5, 2.5]), c = int(rng, -3, 4)
      const x1 = int(rng, -4, -1), x2 = int(rng, 1, 4)
      return { m, c, p: [x1, lineY(m, c, x1)], q: [x2, lineY(m, c, x2)], prompt: `Make the ramp pass through (${x1}, ${fmt(lineY(m, c, x1))}) and (${x2}, ${fmt(lineY(m, c, x2))}).` }
    },
    initial: () => ({ m: 0, c: 0 }),
    controls: () => [{ key: 'm', label: 'Gradient m', step: 0.5, min: -5, max: 5 }, { key: 'c', label: 'y-intercept c', step: 1, min: -8, max: 8 }],
    solution: ch => ({ m: ch.m, c: ch.c }),
    check: (ch, a) => onLine(a.m, a.c, ch.p) && onLine(a.m, a.c, ch.q),
    explain: ch => `Gradient = rise ÷ run = ${fmt(ch.q[1] - ch.p[1])} ÷ ${ch.q[0] - ch.p[0]} = ${fmt(ch.m)}, and the line crosses the y-axis at ${ch.c}.`,
    hint: ch => `Rise from flag to flag is ${fmt(ch.q[1] - ch.p[1])}, run is ${ch.q[0] - ch.p[0]}. Divide for m.`,
    scene: (ch, a) => `<p>Your line: <b>y = ${fmt(a.m)}x ${sign(a.c)}</b> · rise/run between flags: <b>${fmt(ch.q[1] - ch.p[1])} / ${ch.q[0] - ch.p[0]}</b></p>`,
    plots: (ch, a) => [{ title: 'Ramp through the checkpoints', x: { label: 'x', min: -5, max: 5 }, y: { label: 'y', min: -12, max: 12 }, series: [{ name: 'your ramp', color: C.you, points: xs(-5, 5).map(x => [x, lineY(a.m, a.c, x)]) }, { name: 'rise/run', color: C.t, dash: true, points: [ch.p, [ch.q[0], ch.p[1]], ch.q] }],
      marks: [{ x: ch.p[0], y: ch.p[1], label: '🚩', color: C.d }, { x: ch.q[0], y: ch.q[1], label: '🚩', color: C.d }, { x: 0, y: a.c, label: 'c', color: C.you }] }],
    figure: () => '<h3>Gradient</h3><span class="eq">m = (y₂ − y₁) / (x₂ − x₁)</span><p>Positive m climbs left to right; negative m falls.</p>',
  },
  'linear-best-fit': {
    id: 'linear-best-fit', title: 'Best-Fit Sniper', short: 'Best-Fit', eyebrow: 'REGRESSION / LEAST SQUARES',
    subtitle: 'Line up the regression line of y on x by shrinking the sum of squared residuals.',
    model: 'Least-squares line of y on x: b = Sxy/Sxx, a = ȳ − b x̄, minimising Σ(y − a − bx)². r = Sxy/√(Sxx Syy) measures linear correlation.',
    meta: meta({ level: 'JC', subject: 'Maths', topic: 'Correlation and regression', difficulty: 2, difficultyLabel: 'Intermediate', symbol: '🎯', question: 'Which line makes the squared residuals smallest?', tags: ['regression', 'least squares', 'correlation'],
      objective: 'Find the least-squares regression line of y on x and interpret r and the residuals.', syllabus: 'H2 Maths 9758 2027 §6.6 Correlation and linear regression, p.13' }),
    make(rng) {
      const m = pick(rng, [-1.2, -0.8, 0.6, 0.9, 1.4]), c = int(rng, 2, 6)
      const pts = Array.from({ length: 8 }, (_, i) => { const x = i + 1; return [x, +(m * x + c + (rng() - 0.5) * 3).toFixed(1)] })
      const fit = leastSquares(pts)
      return { pts, fit, prompt: `Set b and a (to ±0.1) for the regression line y = a + bx. Here r = ${fmt(fit.r, 3)}.` }
    },
    initial: () => ({ b: 0, a: 0 }),
    controls: () => [{ key: 'b', label: 'Gradient b', step: 0.05, coarse: 0.5, min: -3, max: 3 }, { key: 'a', label: 'Intercept a', step: 0.05, coarse: 0.5, min: -5, max: 15 }],
    solution: ch => ({ b: +ch.fit.m.toFixed(2), a: +ch.fit.c.toFixed(2) }),
    check: (ch, s) => near(s.b, ch.fit.m, 0.1) && near(s.a, ch.fit.c, 0.1),
    explain: ch => `The least-squares line is y = ${fmt(ch.fit.c)} + ${fmt(ch.fit.m)}x. No other line has a smaller sum of squared residuals.`,
    hint: ch => `Get the slope first. The line always passes through (x̄, ȳ) = (4.5, ${fmt(ch.pts.reduce((t, p) => t + p[1], 0) / 8)}).`,
    scene: (ch, s) => `<p>Σ residual² = <b>${fmt(sse(ch.pts, s.b, s.a), 2)}</b> · minimum possible <b>${fmt(sse(ch.pts, ch.fit.m, ch.fit.c), 2)}</b></p>`,
    plots: (ch, s) => {
      const lo = Math.min(...ch.pts.map(p => p[1])) - 3, hi = Math.max(...ch.pts.map(p => p[1])) + 3
      return [{ title: 'Scatter, your line and residuals', x: { label: 'x', min: 0, max: 9 }, y: { label: 'y', min: Math.floor(lo), max: Math.ceil(hi) },
        series: [{ name: 'data', color: C.f, dotsOnly: true, points: ch.pts }, { name: 'your line', color: C.you, points: xs(0, 9).map(x => [x, s.a + s.b * x]) }, ...ch.pts.map(([x, y]) => ({ color: C.d, width: 1.4, dash: true, points: [[x, y], [x, s.a + s.b * x]] }))] },
        { title: 'Squared-residual landscape (slope)', x: { label: 'Gradient b', min: ch.fit.m - 1.5, max: ch.fit.m + 1.5 }, y: { label: 'min Σ residual²', min: 0, max: sse(ch.pts, ch.fit.m + 1.5, ch.fit.c) * 1.1 + 1 },
          series: [{ color: C.t, points: xs(ch.fit.m - 1.5, ch.fit.m + 1.5, 60).map(b => [b, sse(ch.pts, b, ch.pts.reduce((t, p) => t + p[1] - b * p[0], 0) / 8)]) }], marks: [{ x: s.b, y: sse(ch.pts, s.b, ch.pts.reduce((t, p) => t + p[1] - s.b * p[0], 0) / 8), label: 'you', color: C.you }] }]
    },
    figure: () => '<h3>Least squares</h3><span class="eq">b = Sxy / Sxx,  a = ȳ − b x̄</span><p>The valley in the landscape plot is the best gradient.</p>',
  },
  'linear-sensor-calibration': {
    id: 'linear-sensor-calibration', title: 'Sensor Calibrator', short: 'Calibrator', eyebrow: 'LINEAR MODELS / CALIBRATION',
    subtitle: 'Turn raw sensor readings into real units with a two-point calibration line.',
    model: 'Assumes a linear sensor: value = v₁ + (v₂ − v₁)/(r₂ − r₁) × (reading − r₁). Real sensors are only linear over a limited range.',
    meta: meta({ level: 'Poly', subject: 'Maths', topic: 'Linear models', difficulty: 2, difficultyLabel: 'Intermediate', symbol: '🌡️', question: 'What does reading 612 really mean?', tags: ['calibration', 'interpolation', 'sensors'],
      objective: 'Build a two-point linear calibration and use it to convert sensor readings to engineering units.', syllabus: 'Poly, Engineering Mathematics (FIT mapping; e.g. NP N71 Engineering Mathematics 1: analytic geometry)' }),
    make(rng) {
      const s = pick(rng, [{ q: 'Temperature', u: '°C', v1: 0, v2: 100 }, { q: 'Pressure', u: 'kPa', v1: 0, v2: 200 }, { q: 'Distance', u: 'cm', v1: 10, v2: 50 }])
      const r1 = int(rng, 1, 3) * 100, r2 = r1 + int(rng, 4, 6) * 100, rd = r1 + int(rng, 1, 9) * (r2 - r1) / 10
      return { ...s, r1, r2, rd, prompt: `${s.q} sensor: reads ${r1} at ${s.v1} ${s.u} and ${r2} at ${s.v2} ${s.u}. What is the ${s.q.toLowerCase()} when it reads ${rd}?` }
    },
    initial: () => ({ v: 0 }),
    controls: ch => [{ key: 'v', label: ch.q, unit: ch.u, step: 1, coarse: 10, min: -50, max: 250 }],
    solution: ch => ({ v: calibrate([ch.r1, ch.v1], [ch.r2, ch.v2], ch.rd) }),
    check: (ch, a) => near(a.v, calibrate([ch.r1, ch.v1], [ch.r2, ch.v2], ch.rd), 0.5),
    explain: ch => `Sensitivity = ${fmt(gradient([ch.r1, ch.v1], [ch.r2, ch.v2]), 4)} ${ch.u} per count, so ${ch.rd} counts → ${fmt(calibrate([ch.r1, ch.v1], [ch.r2, ch.v2], ch.rd))} ${ch.u}.`,
    hint: ch => `Find ${ch.u} per count: (${ch.v2} − ${ch.v1}) ÷ (${ch.r2} − ${ch.r1}). Multiply by (${ch.rd} − ${ch.r1}) and add ${ch.v1}.`,
    plots: (ch, a) => [{ title: 'Calibration line', x: { label: 'Raw reading', unit: 'counts', min: 0, max: 1000 }, y: { label: ch.q, unit: ch.u, min: Math.min(0, ch.v1) - 20, max: ch.v2 * 1.6 },
      series: [{ name: 'calibration', color: C.f, points: xs(0, 1000).map(r => [r, calibrate([ch.r1, ch.v1], [ch.r2, ch.v2], r)]) }, { name: 'reading', color: C.t, dash: true, points: [[ch.rd, Math.min(0, ch.v1) - 20], [ch.rd, a.v], [0, a.v]] }],
      marks: [{ x: ch.r1, y: ch.v1, label: 'cal 1', color: C.d }, { x: ch.r2, y: ch.v2, label: 'cal 2', color: C.d }, { x: ch.rd, y: a.v, label: 'you', color: C.you }] }],
    figure: ch => `<h3>Two-point calibration</h3><span class="eq">value = ${ch.v1} + (${ch.v2 - ch.v1}/${ch.r2 - ch.r1})(r − ${ch.r1})</span>`,
  },
  'linear-systems-crossing': {
    id: 'linear-systems-crossing', title: 'Crossing Point', short: 'Crossing Point', eyebrow: 'LINEAR ALGEBRA / 2 × 2 SYSTEMS',
    subtitle: 'Each equation is a line. Find where they cross, and spot when a system has no single solution.',
    model: 'a₁x + b₁y = c₁, a₂x + b₂y = c₂. det = a₁b₂ − a₂b₁. det ≠ 0 gives one solution (Cramer’s rule); det = 0 means parallel or identical lines.',
    meta: meta({ level: 'University', subject: 'Maths', topic: 'Linear algebra', difficulty: 3, difficultyLabel: 'Advanced', symbol: '✖️', question: 'When does a linear system have exactly one solution?', tags: ['linear system', 'determinant', 'Cramer'],
      objective: 'Solve 2 × 2 linear systems geometrically and with determinants, and identify singular systems.', syllabus: 'University, Linear Algebra (FIT mapping)' }),
    make(rng, level) {
      const x = int(rng, -4, 4), y = int(rng, -4, 4), e1 = [int(rng, 1, 3), int(rng, -3, 3) || 1], e2 = [int(rng, -3, 3) || -1, int(rng, 1, 3)]
      if (e1[0] * e2[1] - e2[0] * e1[1] === 0) e2[1] += 1
      const singular = level >= 5
      const r1 = [...e1, e1[0] * x + e1[1] * y], r2 = singular ? [e1[0] * 2, e1[1] * 2, r1[2] * 2 + 3] : [...e2, e2[0] * x + e2[1] * y]
      const co = (k, v, first) => `${k < 0 ? (first ? '−' : '− ') : first ? '' : '+ '}${Math.abs(k) === 1 ? '' : Math.abs(k)}${v}`
      const eq = ([a, b, c]) => `${co(a, 'x', true)} ${co(b, 'y', false)} = ${c < 0 ? '−' + Math.abs(c) : c}`
      return { r1, r2, singular, prompt: singular ? `${eq(r1)} and ${eq(r2)}. Is there a solution? Choose “no single solution”, or give the crossing point.` : `Find (x, y) where ${eq(r1)} and ${eq(r2)} cross.` }
    },
    initial: () => ({ x: 0, y: 0, kind: 'point' }),
    controls: () => [{ key: 'x', label: 'x', step: 1, min: -8, max: 8 }, { key: 'y', label: 'y', step: 1, min: -8, max: 8 }, { type: 'chips', key: 'kind', label: 'Answer type', options: [['point', 'One crossing point'], ['none', 'No single solution']] }],
    solution: ch => { const s = solve2(ch.r1, ch.r2); return ch.singular ? { x: 0, y: 0, kind: 'none' } : { x: s.x, y: s.y, kind: 'point' } },
    check: (ch, a) => { if (ch.singular) return a.kind === 'none'; const s = solve2(ch.r1, ch.r2); return a.kind === 'point' && near(a.x, s.x) && near(a.y, s.y) },
    explain: ch => (ch.singular ? 'det = 0: the lines are parallel, so there is no unique solution.' : `det = ${solve2(ch.r1, ch.r2).det} ≠ 0, so the lines meet at exactly one point.`),
    hint: ch => `Compute det = a₁b₂ − a₂b₁ = ${solve2(ch.r1, ch.r2).det}. ${solve2(ch.r1, ch.r2).det === 0 ? 'What does zero mean?' : 'Substitute your point into both equations.'}`,
    scene: (ch, a) => { const s = solve2(ch.r1, ch.r2); return `<p>det = <b>${s.det}</b> · check eq 1: <b>${fmt(ch.r1[0] * a.x + ch.r1[1] * a.y)}</b> vs ${ch.r1[2]} · eq 2: <b>${fmt(ch.r2[0] * a.x + ch.r2[1] * a.y)}</b> vs ${ch.r2[2]}</p>` },
    plots: (ch, a) => {
      const line = ([p, q, r]) => (q === 0 ? [[r / p, -10], [r / p, 10]] : xs(-10, 10).map(x => [x, (r - p * x) / q]))
      return [{ title: 'Each equation is a line', x: { label: 'x', min: -10, max: 10 }, y: { label: 'y', min: -10, max: 10 }, series: [{ name: 'equation 1', color: C.f, points: line(ch.r1) }, { name: 'equation 2', color: C.d, points: line(ch.r2) }], marks: [{ x: a.x, y: a.y, label: 'you', color: C.you }] }]
    },
    figure: () => '<h3>Cramer’s rule</h3><span class="eq">x = (c₁b₂ − c₂b₁)/det,  y = (a₁c₂ − a₂c₁)/det</span>',
  },
}
