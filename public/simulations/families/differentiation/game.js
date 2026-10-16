import { int, pick, fmt, dial, bindDials } from '../shell.js';
import { forward, central, speed, polyEval, polyDeriv, tangent, stationaryCubic, velocities, FUNCS } from './engine.js';

const C = { f: '#5cc8ff', d: '#ff5c8a', t: '#ffd166', you: '#2ee6a6' };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const sample = (f, lo, hi, n = 160) => Array.from({ length: n + 1 }, (_, i) => { const x = lo + (hi - lo) * i / n; return [x, f(x)]; });

function dialRound(state, spec) {
  return { ...spec, render(stage, changed) {
    const paint = () => {
      stage.innerHTML = (spec.scene ? spec.scene(state) : '') + spec.dials(state).map(d => dial(...d)).join('') + (spec.chips ? spec.chips(state) : '');
      bindDials(stage, (k, d) => { const [lo, hi] = spec.limits[k]; state[k] = +clamp(state[k] + d, lo, hi).toFixed(6); paint(); changed(); });
      stage.querySelectorAll('[data-chip]').forEach(b => { b.onclick = () => { state.chip = b.dataset.chip; paint(); changed(); }; });
    };
    paint();
  } };
}

const levels = {
  P(r) {
    const v = pick(r, [40, 50, 60, 75, 80, 90]), t = pick(r, [2, 3, 4]), dist = v * t, s = { v: 30 };
    const who = pick(r, ['A bus', 'Mr Tan’s car', 'A delivery van', 'A train']);
    return dialRound(s, {
      prompt: `${who} travels <em>${dist} km</em> in <em>${t} h</em>. Set its average speed.`,
      hint: `Speed = distance ÷ time = ${dist} ÷ ${t}.`,
      limits: { v: [0, 120] }, dials: st => [['v', 'Speed', st.v, 'km/h', 5]],
      scene: st => { const x = Math.min(1, (st.v * t) / dist); return `<svg viewBox="0 0 430 90"><rect x="10" y="52" width="410" height="14" rx="7" fill="#24305a"/><line x1="410" x2="410" y1="30" y2="74" stroke="#ffd166" stroke-width="4"/><text x="410" y="22" fill="#ffd166" font-size="12" text-anchor="end">${dist} km</text><text x="${15 + x * 380}" y="48" font-size="30">🚗</text><text x="10" y="86" fill="#9aa6cf" font-size="12">after ${t} h at your speed: ${fmt(st.v * t, 0)} km</text></svg>`; },
      plots: () => [{ title: 'Distance–time: steeper means faster', x: { label: 'Time', unit: 'h', min: 0, max: 4 }, y: { label: 'Distance', unit: 'km', min: 0, max: 400 },
        series: [{ name: 'actual', color: C.f, points: [[0, 0], [t, dist]] }, { name: 'your speed', color: C.you, dash: true, points: [[0, 0], [4, 4 * s.v]] }], marks: [{ x: t, y: dist, label: 'finish' }] }],
      figure: () => `<h3>Rate of change</h3><span class="eq">speed = ${dist} km ÷ ${t} h</span><p>Every hour the distance grows by the same amount: that amount is the speed.</p>`,
      check: () => s.v === speed(dist, t) ? { ok: true, msg: `Right! ${dist} ÷ ${t} = ${v} km/h.` } : { ok: false, msg: s.v < v ? 'Too slow: you don’t reach the finish in time.' : 'Too fast: you pass the finish early.' },
    });
  },
  S(r) {
    const a = pick(r, [0.5, 1, 1.5]), x0 = pick(r, [-2, -1, 1, 2, 3]), cst = int(r, -2, 2);
    const f = x => a * x * x + cst, g = 2 * a * x0, s = { m: 0 };
    return dialRound(s, {
      prompt: `Tilt the tangent so it just touches y = ${a === 1 ? '' : a}x² ${cst < 0 ? '−' : '+'} ${Math.abs(cst)} at <em>x = ${x0}</em>. What is the gradient there?`,
      hint: 'Zoom your eye in at the point: the tangent and the curve should look the same there, crossing nowhere else nearby.',
      limits: { m: [-10, 10] }, dials: st => [['m', 'Tangent gradient', st.m, '', 0.5]],
      plots: () => [{ title: 'Curve and your tangent', x: { label: 'x', min: -4, max: 4 }, y: { label: 'y', min: -4, max: 14 },
        series: [{ name: 'curve', color: C.f, points: sample(f, -4, 4) }, { name: 'your tangent', color: C.you, points: sample(x => f(x0) + s.m * (x - x0), -4, 4, 2) }], marks: [{ x: x0, y: f(x0), label: `(${x0}, ${fmt(f(x0))})` }] },
        { title: 'Gap between tangent and curve', x: { label: 'x', min: x0 - 1.5, max: x0 + 1.5 }, y: { label: 'curve − tangent', min: -3, max: 3 }, series: [{ color: C.d, points: sample(x => f(x) - (f(x0) + s.m * (x - x0)), x0 - 1.5, x0 + 1.5) }] }],
      figure: () => `<h3>Gradient of a curve</h3><span class="eq">rise ÷ run of the tangent = ${fmt(s.m)}</span><p>The true tangent keeps the gap graph on one side of zero, touching it only at x = ${x0}.</p>`,
      check: () => Math.abs(s.m - g) < 1e-9 ? { ok: true, msg: `Touching! Gradient at x = ${x0} is ${fmt(g)}.` } : { ok: false, msg: `Your line cuts the curve: ${s.m < g ? 'tilt it steeper' : 'tilt it less steep'}.` },
    });
  },
  JC(r) {
    // f(x) = x^3 - 3p^2 x + q style, shifted: stationary points at h ± p
    const p = pick(r, [1, 1.5, 2]), h = pick(r, [-1, -0.5, 0, 0.5, 1]), q = int(r, -2, 2), sign = pick(r, [1, -1]);
    const c = [sign * (h ** 3 * -1 + 3 * p * p * h) + q, sign * (3 * h * h - 3 * p * p), sign * (-3 * h), sign]; // sign*((x-h)^3 - 3p^2 (x-h)) + q
    const f = x => polyEval(c, x), df = x => polyEval(polyDeriv(c), x), st = stationaryCubic(c);
    const target = pick(r, ['max', 'min']), ans = st.find(o => o.kind === target);
    const X0 = h - p - 1.5, X1 = h + p + 1.5, Y = Math.ceil(Math.max(...sample(f, X0, X1).map(q2 => Math.abs(q2[1])), ...sample(df, X0, X1).map(q2 => Math.abs(q2[1])))) + 1;
    const s = { x: h, chip: '' };
    const show = v => `${fmt(v)}`;
    return dialRound(s, {
      prompt: `f(x) = ${sign < 0 ? '−' : ''}(x ${h < 0 ? '+' : '−'} ${Math.abs(h)})³ ${sign < 0 ? '+' : '−'} ${3 * p * p}(x ${h < 0 ? '+' : '−'} ${Math.abs(h)}) ${q < 0 ? '−' : '+'} ${Math.abs(q)}. Move the probe to the <em>local ${target === 'max' ? 'maximum' : 'minimum'}</em>, then classify it with f''.`,
      hint: `Solve f'(x) = 0: the stationary points are at x = ${show(h)} ± ${p}, then check the sign of f''.`,
      limits: { x: [h - p - 1.5, h + p + 1.5] }, dials: () => [['x', 'Probe x', s.x, '', 0.5]],
      chips: () => `<div class="chips" role="group" aria-label="Sign of f''(x)">${[['pos', "f''(x) > 0"], ['neg', "f''(x) < 0"]].map(([k, l]) => `<button type="button" class="chip" data-chip="${k}" aria-pressed="${s.chip === k}">${l}</button>`).join('')}</div>`,
      scene: () => `<p class="figure">f(${show(s.x)}) = ${fmt(f(s.x))} · f'(${show(s.x)}) = <b>${fmt(df(s.x))}</b></p>`,
      plots: () => [{ title: "f(x) and its derivative f'(x)", x: { label: 'x', min: X0, max: X1 }, y: { label: 'y', min: -Y, max: Y }, series: [{ name: 'f(x)', color: C.f, points: sample(f, X0, X1) }, { name: "f'(x)", color: C.d, dash: true, points: sample(df, X0, X1) }, { color: C.t, width: 1.6, points: sample(tangent(f, df, s.x), s.x - 1, s.x + 1, 2) }], marks: [{ x: s.x, y: f(s.x), label: 'probe', color: C.you }] }],
      figure: () => `<h3>Stationary points</h3><span class="eq">f'(x) = 0, then f''(x) &gt; 0 ⇒ min, &lt; 0 ⇒ max</span><p>Where the dashed f' graph crosses zero, the tangent on f is horizontal.</p>`,
      check: () => {
        if (Math.abs(s.x - ans.x) > 1e-9) return { ok: false, msg: Math.abs(df(s.x)) < 1e-9 ? "Stationary, but the other kind. Check f''." : `f'(${show(s.x)}) = ${fmt(df(s.x))} ≠ 0: not stationary.` };
        if (s.chip !== (target === 'max' ? 'neg' : 'pos')) return { ok: false, msg: "Right place! Now pick the sign of f'' that proves it." };
        return { ok: true, msg: `Local ${target} at x = ${show(ans.x)}, f = ${fmt(f(ans.x))}.` };
      },
    });
  },
  Poly(r) {
    const dt = pick(r, [0.5, 1]), a = pick(r, [0.4, 0.6, 0.8, 1.2]), u = pick(r, [0, 1, 2]);
    const ts = Array.from({ length: 9 }, (_, i) => i * dt), pos = ts.map(t => +(u * t + 0.5 * a * t * t).toFixed(2));
    const i = int(r, 2, 6), v = velocities(pos, dt), truth = +v[i].toFixed(2), s = { v: 0 };
    return dialRound(s, {
      prompt: `A lidar logs position every <em>${dt} s</em>. Estimate the velocity at <em>t = ${ts[i]} s</em> with the central difference (±0.1 m/s).`,
      hint: `v ≈ [s(t+Δt) − s(t−Δt)] / (2Δt) = (${pos[i + 1]} − ${pos[i - 1]}) / ${2 * dt}.`,
      limits: { v: [0, 20] }, dials: st => [['v', 'Velocity (coarse)', st.v, 'm/s', 1], ['v', 'Velocity (fine)', st.v, 'm/s', 0.1]],
      scene: () => `<table class="figure" style="width:100%;text-align:center"><tr><th>t (s)</th>${ts.map((t, k) => `<td style="${k === i ? 'color:#ffd166;font-weight:800' : ''}">${t}</td>`).join('')}</tr><tr><th>s (m)</th>${pos.map((p, k) => `<td style="${Math.abs(k - i) === 1 ? 'color:#2ee6a6;font-weight:800' : ''}">${p}</td>`).join('')}</tr></table>`,
      plots: () => [{ title: 'Position data and your velocity (tangent)', x: { label: 'Time', unit: 's', min: 0, max: ts.at(-1) }, y: { label: 'Position', unit: 'm', min: 0, max: Math.max(...pos) * 1.1 }, series: [{ name: 'samples', color: C.f, dots: true, points: ts.map((t, k) => [t, pos[k]]) }, { name: 'your slope', color: C.you, points: [[ts[i] - 1.5 * dt, pos[i] - 1.5 * dt * s.v], [ts[i] + 1.5 * dt, pos[i] + 1.5 * dt * s.v]] }], marks: [{ x: ts[i], y: pos[i], label: `t = ${ts[i]}` }] },
        { title: 'Velocity estimates from the data', x: { label: 'Time', unit: 's', min: 0, max: ts.at(-1) }, y: { label: 'Velocity', unit: 'm/s', min: 0, max: Math.max(...v) * 1.2 }, series: [{ color: C.d, dots: true, points: ts.map((t, k) => [t, v[k]]).filter((_, k) => k !== i) }], marks: [{ x: ts[i], y: s.v, label: 'you', color: C.you }] }],
      figure: () => `<h3>Central difference</h3><span class="eq">v(t) ≈ [s(t+Δt) − s(t−Δt)] / 2Δt</span><p>Uses points on both sides, so its error shrinks like Δt² (a forward difference only like Δt).</p>`,
      check: () => Math.abs(s.v - truth) <= 0.1 + 1e-9 ? { ok: true, msg: `Nice: v ≈ ${fmt(truth)} m/s at t = ${ts[i]} s.` } : { ok: false, msg: `Off by ${fmt(Math.abs(s.v - truth))} m/s.` },
    });
  },
  U(r) {
    const key = pick(r, ['sin', 'exp', 'cube', 'ln']), F = FUNCS[key];
    const x0 = key === 'ln' ? pick(r, [0.5, 2, 4]) : key === 'sin' ? pick(r, [0.5, 1, 1.5]) : pick(r, [-1, 0.5, 1]);
    const truth = F.df(x0), s = { lh: 0, d: 0 };
    const h = () => 10 ** s.lh;
    return dialRound(s, {
      prompt: `Find f'(${x0}) for f(x) = <em>${F.label}</em> from first principles: shrink h, watch the difference quotient settle, and lock in its limit (±0.01).`,
      hint: 'Make h tiny (10⁻³ or smaller) and read the quotient: that’s your limit.',
      limits: { lh: [-6, 0], d: [-5, 30] }, dials: st => [['lh', 'log₁₀ h', st.lh, `h = ${fmt(h(), 6)}`, 0.5], ['d', "Your f'(x₀), coarse", st.d, '', 0.1], ['d', "Your f'(x₀), fine", st.d, '', 0.01]],
      scene: () => `<p class="figure">[f(x₀+h) − f(x₀)] / h = <b>${forward(F.f, x0, h()).toFixed(6)}</b></p>`,
      plots: () => { const lo = x0 - 1.2, hi = x0 + 1.2; const ys = sample(F.f, Math.max(lo, 0.05), hi).map(p => p[1]); const ymin = Math.min(...ys), ymax = Math.max(...ys);
        return [{ title: 'Secant through x₀ and x₀ + h', x: { label: 'x', min: lo, max: hi }, y: { label: 'f(x)', min: ymin - 0.3, max: ymax + 0.3 }, series: [{ name: F.label, color: C.f, points: sample(F.f, key === 'ln' ? Math.max(lo, 0.05) : lo, hi) }, { name: 'secant', color: C.t, points: sample(x => F.f(x0) + forward(F.f, x0, h()) * (x - x0), lo, hi, 2) }], marks: [{ x: x0, y: F.f(x0), label: 'x₀' }, { x: x0 + h(), y: F.f(x0 + h()), color: C.d }] },
          { title: 'Error vs h: first-order convergence', x: { label: 'h', min: 1e-6, max: 1, log: true }, y: { label: '|quotient − limit|', min: 1e-7, max: 10, log: true }, series: [{ name: 'forward', color: C.d, dots: true, points: [0, -1, -2, -3, -4, -5, -6].map(e => [10 ** e, Math.abs(forward(F.f, x0, 10 ** e) - truth) || 1e-7]) }, { name: 'central', color: C.f, points: [0, -1, -2, -3].map(e => [10 ** e, Math.abs(central(F.f, x0, 10 ** e) - truth) || 1e-7]) }], marks: [{ x: h(), y: Math.abs(forward(F.f, x0, h()) - truth) || 1e-7, label: 'you', color: C.you }] }]; },
      figure: () => `<h3>Definition of the derivative</h3><span class="eq">f'(x₀) = lim h→0 [f(x₀+h) − f(x₀)] / h</span><p>Slope −1 on the log–log error plot means error ∝ h; the central quotient falls like h².</p>`,
      check: () => s.lh > -2 ? { ok: false, msg: 'Shrink h further first: the limit is about h → 0.' } : Math.abs(s.d - truth) <= 0.01 + 1e-9 ? { ok: true, msg: `Limit found: f'(${x0}) = ${truth.toFixed(4)}.` } : { ok: false, msg: `The quotient settles near ${forward(F.f, x0, 1e-6).toFixed(3)}.` },
    });
  },
};

export function game(variant) { return { rounds: 5, newRound: r => levels[variant.levelCode](r) }; }
