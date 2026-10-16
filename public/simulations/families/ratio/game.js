import { int, pick, fmt, dial, bindDials } from '../shell.js';
import { simplify, equivalent, reaction, gears, powerLaw, fitPowerLaw } from './engine.js';

const C = { a: '#ff5c8a', b: '#5cc8ff', line: '#ffd166', you: '#2ee6a6' };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function dialRound(state, spec) {
  return {
    ...spec,
    render(stage, changed) {
      const paint = () => {
        stage.innerHTML = (spec.scene ? spec.scene(state) : '') + spec.dials(state).map(d => dial(...d)).join('');
        bindDials(stage, (k, d) => { const [lo, hi] = spec.limits[k]; state[k] = +clamp(state[k] + d, lo, hi).toFixed(4); paint(); changed(); });
      };
      paint();
    },
  };
}

const levels = {
  P(r) {
    const [ta, tb] = simplify(int(r, 1, 4), int(r, 2, 5)).map(v => v || 1);
    const mult = int(r, 2, 4), s = { red: 1, blue: 1 };
    const need = tb * mult;
    return dialRound(s, {
      prompt: `Mix red : blue in the ratio <em>${ta} : ${tb}</em>. You must use exactly <em>${need}</em> cans of blue.`,
      hint: `${tb} blue becomes ${need} blue: that is ×${mult}. Do the same to red.`,
      limits: { red: [0, 20], blue: [0, 20] },
      dials: st => [['red', 'Red cans', st.red], ['blue', 'Blue cans', st.blue]],
      scene: st => {
        const can = (c, i, n) => `<rect x="${8 + (i % 10) * 34}" y="${n + Math.floor(i / 10) * 34}" width="28" height="28" rx="7" fill="${c}"/>`;
        const mixed = st.red + st.blue ? `hsl(${(st.blue / (st.red + st.blue)) * 120 + 330} 80% 60%)` : '#333';
        return `<svg viewBox="0 0 430 190">${Array.from({ length: st.red }, (_, i) => can(C.a, i, 6)).join('')}${Array.from({ length: st.blue }, (_, i) => can(C.b, i, 80)).join('')}<circle cx="395" cy="95" r="30" fill="${mixed}" stroke="#fff" stroke-width="3"/><text x="395" y="150" fill="#9aa6cf" font-size="12" text-anchor="middle">your mix</text></svg>`;
      },
      plots: () => [{ title: 'Every equivalent ratio sits on one line', x: { label: 'Blue cans', min: 0, max: 20 }, y: { label: 'Red cans', min: 0, max: 20 },
        series: [{ name: `${ta}:${tb} line`, color: C.line, points: [[0, 0], [Math.min(20, 20 * tb / ta), Math.min(20, 20 * tb / ta) * ta / tb]], dash: true }, { name: 'equivalent', color: C.b, dotsOnly: true, points: [1, 2, 3, 4, 5, 6].map(m => [tb * m, ta * m]) }],
        marks: [{ x: s.blue, y: s.red, label: 'you', color: C.you }] }],
      figure: () => `<h3>Equivalent ratios</h3><span class="eq">${ta} : ${tb} = ${ta * mult} : ${tb * mult}</span><p>Multiply both parts by the same number and the colour stays the same.</p>`,
      check: () => s.blue !== need ? { ok: false, msg: `Use exactly ${need} blue cans.` } : equivalent(s.red, s.blue, ta, tb) ? { ok: true, msg: `Perfect colour! ${s.red} : ${s.blue} = ${ta} : ${tb}.` } : { ok: false, msg: `${s.red} : ${s.blue} simplifies to ${simplify(s.red, s.blue).join(' : ')}, not ${ta} : ${tb}.` },
    });
  },
  S(r) {
    const item = pick(r, [['eggs', 'flour', 'g', 'eggs'], ['cost', 'petrol', 'L', '$'], ['distance', 'time', 'min', 'km']]);
    const k = pick(r, [0.5, 1.5, 2, 2.5, 3, 4]), x0 = int(r, 2, 6) * 2, x1 = int(r, 7, 15);
    const s = { y: 0 };
    return dialRound(s, {
      prompt: `${item[0]} is directly proportional to ${item[1]}. When ${item[1]} = <em>${x0} ${item[2]}</em>, ${item[0]} = <em>${fmt(k * x0)} ${item[3]}</em>. Find ${item[0]} when ${item[1]} = <em>${x1} ${item[2]}</em>.`,
      hint: `Find k = ${fmt(k * x0)} ÷ ${x0} first, then multiply by ${x1}.`,
      limits: { y: [0, 80] }, dials: st => [['y', `${item[0]} (${item[3]})`, st.y, '', 0.5]],
      plots: () => [{ title: 'y = kx: a straight line through the origin', x: { label: item[1], unit: item[2], min: 0, max: 16 }, y: { label: item[0], unit: item[3], min: 0, max: 70 },
        series: [{ name: `k = ${k}`, color: C.line, points: [[0, 0], [16, 16 * k]] }, { name: 'your line', color: C.you, dash: true, points: [[0, 0], [16, 16 * s.y / x1]] }],
        marks: [{ x: x0, y: k * x0, label: 'given' }, { x: x1, y: s.y, label: 'you', color: C.you }] }],
      figure: () => `<h3>Unit rate</h3><span class="eq">k = y ÷ x = ${fmt(k * x0)} ÷ ${x0}</span><p>Your point implies k = ${fmt(s.y / x1)}. The gradient of the line is k.</p>`,
      check: () => Math.abs(s.y - k * x1) < 1e-6 ? { ok: true, msg: `Yes: k = ${k}, so y = ${k} × ${x1} = ${fmt(k * x1)}.` } : { ok: false, msg: `Your answer gives k = ${fmt(s.y / x1)}, but k = ${k}.` },
    });
  },
  JC(r) {
    const rx = pick(r, [{ eq: '2H₂ + O₂ → 2H₂O', A: 'H₂', B: 'O₂', P: 'H₂O', a: 2, b: 1, c: 2 }, { eq: 'N₂ + 3H₂ → 2NH₃', A: 'N₂', B: 'H₂', P: 'NH₃', a: 1, b: 3, c: 2 }, { eq: 'CH₄ + 2O₂ → CO₂ + 2H₂O', A: 'CH₄', B: 'O₂', P: 'CO₂', a: 1, b: 2, c: 1 }, { eq: '4Al + 3O₂ → 2Al₂O₃', A: 'Al', B: 'O₂', P: 'Al₂O₃', a: 4, b: 3, c: 2 }]);
    const nA = int(r, 2, 8) * rx.a / 2, s = { nB: 0.5 }, exact = nA * rx.b / rx.a;
    return dialRound(s, {
      prompt: `${rx.eq}. The reactor holds <em>${fmt(nA)} mol ${rx.A}</em>. Add exactly enough ${rx.B} for complete reaction with nothing left over.`,
      hint: `Mole ratio ${rx.A} : ${rx.B} = ${rx.a} : ${rx.b}, so n(${rx.B}) = ${fmt(nA)} × ${rx.b}/${rx.a}.`,
      limits: { nB: [0, 20] }, dials: st => [['nB', `${rx.B} added`, st.nB, 'mol', 0.25]],
      scene: st => { const res = reaction(rx, nA, st.nB); return `<p class="figure">Limiting reagent: <b>${res.limiting === 'none' ? 'neither (stoichiometric)' : res.limiting === 'A' ? rx.A : rx.B}</b> · left over ${rx.A} ${fmt(res.leftA)} mol, ${rx.B} ${fmt(res.leftB)} mol</p>`; },
      plots: () => { const pts = Array.from({ length: 81 }, (_, i) => [i / 4, reaction(rx, nA, i / 4).product]); return [{ title: `Yield of ${rx.P} as ${rx.B} is added`, x: { label: `n(${rx.B}) added`, unit: 'mol', min: 0, max: 20 }, y: { label: `n(${rx.P}) formed`, unit: 'mol', min: 0, max: Math.max(...pts.map(p => p[1])) * 1.15 }, series: [{ color: C.b, points: pts }], marks: [{ x: s.nB, y: reaction(rx, nA, s.nB).product, label: 'you', color: C.you }] }]; },
      figure: () => `<h3>Mole ratio</h3><span class="eq">n(${rx.B}) / n(${rx.A}) = ${rx.b} / ${rx.a}</span><p>The kink in the graph is where ${rx.B} stops being the limiting reagent.</p>`,
      check: () => Math.abs(s.nB - exact) < 1e-9 ? { ok: true, msg: `Balanced: ${fmt(exact)} mol ${rx.B}, giving ${fmt(reaction(rx, nA, exact).product)} mol ${rx.P}.` } : { ok: false, msg: s.nB < exact ? `${rx.B} is limiting: some ${rx.A} is left.` : `Excess ${rx.B} is left over.` },
    });
  },
  Poly(r) {
    const inRpm = pick(r, [1200, 1500, 1800, 2400]), driver = pick(r, [12, 16, 20, 24]), mult = pick(r, [2, 2.5, 3, 4]);
    const target = inRpm / mult, s = { driven: 20 };
    return dialRound(s, {
      prompt: `Motor: <em>${inRpm} rpm</em>, driver gear <em>${driver} teeth</em>. Pick the driven gear so the output turns at <em>${fmt(target)} rpm</em>.`,
      hint: `Gear ratio = driven/driver = input speed / output speed = ${fmt(mult)}.`,
      limits: { driven: [8, 120] }, dials: st => [['driven', 'Driven gear', st.driven, 'teeth']],
      scene: st => { const sc = Math.min(2.6, 190 / (driver + st.driven)), R1 = driver * sc, R2 = st.driven * sc; return `<svg viewBox="0 0 430 ${2 * Math.max(R1, R2) + 24}"><circle cx="${20 + R1}" cy="${Math.max(R1, R2) + 12}" r="${R1}" fill="none" stroke="${C.a}" stroke-width="10" stroke-dasharray="4 4"/><circle cx="${20 + 2 * R1 + R2}" cy="${Math.max(R1, R2) + 12}" r="${R2}" fill="none" stroke="${C.b}" stroke-width="10" stroke-dasharray="4 4"/><text x="${20 + R1}" y="${Math.max(R1, R2) + 17}" fill="#fff" text-anchor="middle" font-weight="800">${driver}T</text><text x="${Math.min(20 + 2 * R1 + R2, 400)}" y="${Math.max(R1, R2) + 17}" fill="#fff" text-anchor="middle" font-weight="800">${st.driven}T</text></svg>`; },
      plots: () => { const pts = Array.from({ length: 113 }, (_, i) => i + 8); return [{ title: 'Output speed and torque vs driven teeth', x: { label: 'Driven teeth', min: 8, max: 120 }, y: { label: 'Output speed', unit: 'rpm', min: 0, max: inRpm * 1.6 }, series: [{ name: 'speed', color: C.b, points: pts.map(t => [t, gears(inRpm, driver, t).outRpm]) }, { name: 'torque ×100 N·m', color: C.a, dash: true, points: pts.map(t => [t, gears(inRpm, driver, t, 1).outTorque * 100]) }], marks: [{ x: s.driven, y: gears(inRpm, driver, s.driven).outRpm, label: 'you', color: C.you }] }]; },
      figure: () => { const g = gears(inRpm, driver, s.driven); return `<h3>Speed–torque trade-off (ideal, input 1 N·m)</h3><span class="eq">ratio ${fmt(g.ratio)} · ${fmt(g.outRpm, 0)} rpm · ${fmt(g.outTorque)} N·m</span><p>Power is conserved in a lossless pair: slower output means more torque.</p>`; },
      check: () => Math.abs(gears(inRpm, driver, s.driven).outRpm - target) < 1e-6 ? { ok: true, msg: `Locked in: ${s.driven}T gives ratio ${fmt(mult)} and ${fmt(target)} rpm.` } : { ok: false, msg: `Output is ${fmt(gears(inRpm, driver, s.driven).outRpm, 0)} rpm.` },
    });
  },
  U(r) {
    const law = pick(r, [{ n: 0.75, k: 3.4, x: 'Body mass', xu: 'kg', y: 'Metabolic rate', yu: 'W' }, { n: 1.5, k: 0.2, x: 'Orbit radius', xu: 'AU', y: 'Period', yu: 'yr' }, { n: 2, k: 0.5, x: 'Length', xu: 'm', y: 'Area', yu: 'm²' }, { n: 0.5, k: 2.0, x: 'Pendulum length', xu: 'm', y: 'Period', yu: 's' }]);
    const k = law.n === 1.5 ? 1 : law.k;
    const data = [0.1, 0.3, 1, 3, 10, 30, 100].map(x => [x, powerLaw(k, law.n, x) * (1 + (r() - 0.5) * 0.12)]);
    const fit = fitPowerLaw(data), s = { n: 1, lk: 0 };
    return dialRound(s, {
      prompt: `Measured <em>${law.y}</em> against <em>${law.x}</em>. Fit y = k·xⁿ: set the exponent n (to ±0.05) and log₁₀k.`,
      hint: 'On log–log axes a power law is a straight line: the gradient is n and the intercept at x = 1 is k.',
      limits: { n: [-1, 3], lk: [-2, 2] }, dials: st => [['n', 'Exponent n', st.n, '', 0.05], ['lk', 'log₁₀ k', st.lk, '', 0.05]],
      plots: () => { const ys = data.map(p => p[1]), ymin = 10 ** Math.floor(Math.log10(Math.min(...ys))), ymax = 10 ** Math.ceil(Math.log10(Math.max(...ys))); return [{ title: 'Log–log plot: power laws are straight', x: { label: law.x, unit: law.xu, min: 0.1, max: 100, log: true }, y: { label: law.y, unit: law.yu, min: ymin, max: ymax, log: true }, series: [{ name: 'data', color: C.b, dotsOnly: true, points: data }, { name: 'your model', color: C.you, points: [0.1, 1, 10, 100].map(x => [x, powerLaw(10 ** s.lk, s.n, x)]) }] }]; },
      figure: () => `<h3>Linearising</h3><span class="eq">log y = log k + n · log x</span><p>Least-squares on these data: n ≈ ${fmt(fit.n)}, k ≈ ${fmt(fit.k)}. Doubling x multiplies y by 2ⁿ.</p>`,
      check: () => Math.abs(s.n - fit.n) <= 0.05 && Math.abs(s.lk - Math.log10(fit.k)) <= 0.1 ? { ok: true, msg: `Great fit: n ≈ ${fmt(fit.n)}. Doubling x scales y by ${fmt(2 ** fit.n)}.` } : { ok: false, msg: Math.abs(s.n - fit.n) > 0.05 ? 'The slope (n) doesn’t match the data yet.' : 'Slope is right; shift the line with log k.' },
    });
  },
};

export function game(variant) {
  return { rounds: 5, newRound: r => levels[variant.levelCode](r) };
}
