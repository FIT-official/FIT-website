import { int, pick, fmt, dial, bindDials } from '../shell.js'
import { G, motion, inclineHold, inclineParts, moment, damped } from './engine.js'

const C = { a: '#ff5c8a', b: '#5cc8ff', line: '#ffd166', you: '#2ee6a6' }
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const arrow = (x1, x2, y, c, label) => { const d = x2 > x1 ? 1 : -1; return Math.abs(x2 - x1) < 2 ? '' : `<line x1="${x1}" y1="${y}" x2="${x2 - d * 10}" y2="${y}" stroke="${c}" stroke-width="7" stroke-linecap="round"/><path d="M${x2} ${y}l${-d * 16} -10v20z" fill="${c}"/><text x="${(x1 + x2) / 2}" y="${y - 12}" fill="${c}" font-size="13" font-weight="800" text-anchor="middle">${label}</text>` }

function dialRound(state, spec) {
  return { ...spec, state, render(stage, changed) {
    const paint = () => {
      stage.innerHTML = (spec.scene ? spec.scene(state) : '') + spec.dials(state).map(d => dial(...d)).join('')
      bindDials(stage, (k, d) => { const [lo, hi] = spec.limits[k]; state[k] = +clamp(state[k] + d, lo, hi).toFixed(4); paint(); changed() })
    }
    paint()
  } }
}

const levels = {
  P(r) {
    const pull = int(r, 2, 9) * 10, s = { push: 10 }
    return dialRound(s, {
      prompt: `Your friend pulls the crate to the left with <em>${pull} N</em>. Push to the right so the crate <em>stays still</em>.`,
      hint: 'Balanced forces are equal in size and opposite in direction.',
      limits: { push: [0, 120] }, dials: st => [['push', 'Your push →', st.push, 'N', 5]],
      scene: st => { const net = st.push - pull, x = 215 + Math.max(-90, Math.min(90, net * 1.2)); return `<svg viewBox="0 0 430 170"><rect x="10" y="132" width="410" height="10" rx="5" fill="#3b4570"/><rect x="${x - 40}" y="72" width="80" height="60" rx="10" fill="#c98b4f" stroke="#fff3" stroke-width="3"/><path d="M${x - 40} 92h80M${x - 40} 112h80" stroke="#0002" stroke-width="3"/>${arrow(x - 45, x - 45 - pull, 55, C.a, `${pull} N`)}${arrow(x + 45, x + 45 + st.push, 55, C.b, `${st.push} N`)}<text x="215" y="162" fill="#9aa6cf" font-size="13" text-anchor="middle">${net === 0 ? 'Balanced: no change in motion' : `Unbalanced: ${Math.abs(net)} N to the ${net > 0 ? 'right' : 'left'}`}</text></svg>` },
      plots: () => [{ title: 'Net force as you change your push', x: { label: 'Your push', unit: 'N', min: 0, max: 120 }, y: { label: 'Net force (right +)', unit: 'N', min: -100, max: 120 }, series: [{ color: C.line, points: [[0, -pull], [120, 120 - pull]] }], marks: [{ x: s.push, y: s.push - pull, label: 'you', color: C.you }] }],
      figure: () => `<h3>Balanced forces</h3><span class="eq">net force = ${s.push} − ${pull} = ${s.push - pull} N</span><p>When the net force is zero, a still object stays still.</p>`,
      check: () => s.push === pull ? { ok: true, msg: `Balanced! ${pull} N each way, so the crate stays still.` } : { ok: false, msg: `Net force is ${Math.abs(s.push - pull)} N to the ${s.push > pull ? 'right' : 'left'}: the crate would move.` },
    })
  },
  S(r) {
    const m = pick(r, [2, 4, 5, 8, 10]), mu = pick(r, [0, 0.1, 0.2, 0.25]), a = pick(r, [0.5, 1, 1.5, 2, 3]), s = { F: 0 }
    const need = m * a + mu * m * G
    return dialRound(s, {
      prompt: `A <em>${m} kg</em> sled sits on snow with friction coefficient <em>μ = ${mu}</em>. Find the pulling force for an acceleration of <em>${a} m/s²</em>.`,
      hint: `F − μmg = ma, so F = ma + μmg = ${m}×${a} + ${mu}×${m}×9.8.`,
      limits: { F: [0, 150] }, dials: st => [['F', 'Pull F', st.F, 'N', 0.1], ['F', 'Pull F (coarse)', st.F, 'N', 5]].slice(0, 2),
      scene: st => { const mo = motion(st.F, m, mu); return `<svg viewBox="0 0 430 140"><rect x="10" y="108" width="410" height="12" rx="6" fill="#dfe9f5"/><rect x="170" y="62" width="90" height="46" rx="12" fill="#3fb6a8"/>${arrow(262, 262 + Math.min(150, st.F), 50, C.b, `F = ${fmt(st.F)} N`)}${arrow(168, 168 - Math.min(140, mo.friction * 3), 92, C.a, `friction ${fmt(mo.friction)} N`)}<text x="215" y="136" fill="#9aa6cf" font-size="13" text-anchor="middle">a = ${fmt(mo.a)} m/s²</text></svg>` },
      plots: () => { const mo = motion(s.F, m, mu); return [{ title: 'Velocity–time over 4 s', x: { label: 'time', unit: 's', min: 0, max: 4 }, y: { label: 'velocity', unit: 'm/s', min: 0, max: 14 }, series: [{ name: 'target', color: C.line, dash: true, points: [[0, 0], [4, 4 * a]] }, { name: 'yours', color: C.you, points: [[0, 0], [4, 4 * mo.a]] }] }] },
      figure: () => `<h3>Newton’s second law</h3><span class="eq">F − μmg = ma</span><p>Friction here is μmg = ${fmt(mu * m * G)} N. The gradient of the v–t line is the acceleration.</p>`,
      check: () => Math.abs(s.F - need) <= 0.15 ? { ok: true, msg: `Launch! F = ${fmt(need)} N gives a = ${a} m/s².` } : { ok: false, msg: `That gives a = ${fmt(motion(s.F, m, mu).a)} m/s², not ${a}.` },
    })
  },
  JC(r) {
    const m = pick(r, [5, 10, 12, 20]), deg = pick(r, [15, 20, 25, 30, 35]), mu = pick(r, [0.1, 0.2, 0.3]), s = { F: 0 }
    const need = inclineHold(m, deg, mu), p = inclineParts(m, deg)
    return dialRound(s, {
      prompt: `Haul a <em>${m} kg</em> crate <em>up</em> a <em>${deg}°</em> slope at constant velocity. μ = <em>${mu}</em>. What force along the slope is needed?`,
      hint: 'Constant velocity means zero resultant: F = mg sin θ + μ mg cos θ.',
      limits: { F: [0, 200] }, dials: st => [['F', 'Force along slope', st.F, 'N', 0.5], ['F', 'Coarse', st.F, 'N', 10]],
      scene: st => { const t = deg * Math.PI / 180, L = 330, x0 = 40, y0 = 150, x1 = x0 + L * Math.cos(t), y1 = y0 - L * Math.sin(t), cx = x0 + 170 * Math.cos(t), cy = y0 - 170 * Math.sin(t); const u = [Math.cos(t), -Math.sin(t)], nrm = [Math.sin(t), Math.cos(t)]; const v = (k, d, c, lab, dy) => `<line x1="${cx}" y1="${cy - 17}" x2="${cx + d[0] * k}" y2="${cy - 17 + d[1] * k}" stroke="${c}" stroke-width="5" stroke-linecap="round"/><text x="${cx + d[0] * k + (k < 0 ? -8 : 8)}" y="${cy - 17 + d[1] * k + dy}" fill="${c}" font-size="12" font-weight="700" text-anchor="${k < 0 ? 'end' : 'start'}">${lab}</text>`; return `<svg viewBox="0 0 430 170"><path d="M${x0} ${y0}L${x1} ${y0}L${x1} ${y1}Z" fill="#2a3358"/><g transform="translate(${cx} ${cy}) rotate(${-deg})"><rect x="-26" y="-34" width="52" height="34" rx="6" fill="#c98b4f"/></g>${v(Math.max(1, Math.min(120, st.F)), u, C.b, `F = ${fmt(st.F)} N`, -6)}${v(-Math.min(90, p.along), u, C.a, `mg sin θ = ${fmt(p.along)} N`, 16)}${v(Math.min(70, p.normal * 0.4), [-nrm[0], -nrm[1]], C.line, 'N', -4)}</svg>` },
      plots: () => { const pts = Array.from({ length: 61 }, (_, i) => i * 1); return [{ title: 'Force needed vs slope angle', x: { label: 'angle θ', unit: '°', min: 0, max: 60 }, y: { label: 'force along slope', unit: 'N', min: 0, max: inclineHold(m, 60, mu) * 1.05 }, series: [{ name: 'needed', color: C.line, points: pts.map(d => [d, inclineHold(m, d, mu)]) }, { name: 'mg sin θ', color: C.a, dash: true, points: pts.map(d => [d, inclineParts(m, d).along]) }], marks: [{ x: deg, y: s.F, label: 'you', color: C.you }] }] },
      figure: () => `<h3>Resolving forces</h3><span class="eq">F = mg sin θ + μ mg cos θ</span><p>mg sin θ = ${fmt(p.along)} N, friction μN = ${fmt(mu * p.normal)} N.</p>`,
      check: () => Math.abs(s.F - need) <= 0.5 ? { ok: true, msg: `Steady haul: F = ${fmt(need)} N.` } : { ok: false, msg: s.F < need ? 'The crate would decelerate: not enough force.' : 'Too much: the crate would accelerate up the slope.' },
    })
  },
  Poly(r) {
    const load = pick(r, [200, 300, 400, 500]), dl = pick(r, [2, 2.5, 3, 4]), cw = pick(r, [400, 500, 800, 1000]), s = { d: 0 }
    const need = load * dl / cw
    return dialRound(s, {
      prompt: `A crane jib holds <em>${load} kg</em> at <em>${dl} m</em> right of the pivot. Place the <em>${cw} kg</em> counterweight on the left so the jib balances.`,
      hint: 'Principle of moments: clockwise moment = anticlockwise moment, so m₁d₁ = m₂d₂.',
      limits: { d: [0, 5] }, dials: st => [['d', 'Counterweight distance', st.d, 'm', 0.05], ['d', 'Coarse', st.d, 'm', 0.5]],
      scene: st => { const net = moment([[cw, st.d], [load, -dl]]), tilt = Math.max(-12, Math.min(12, -net / 800)); return `<svg viewBox="0 0 430 170"><path d="M205 165l10 -60l10 60z" fill="#3b4570"/><g transform="rotate(${tilt} 215 100)"><rect x="25" y="94" width="380" height="12" rx="6" fill="#ffd166"/><rect x="${215 - st.d * 36 - 22}" y="106" width="44" height="34" rx="6" fill="#5cc8ff"/><text x="${215 - st.d * 36}" y="128" fill="#08203a" font-size="11" font-weight="800" text-anchor="middle">${cw}kg</text><line x1="${215 + dl * 36}" y1="106" x2="${215 + dl * 36}" y2="130" stroke="#ccc" stroke-width="2"/><rect x="${215 + dl * 36 - 18}" y="130" width="36" height="26" rx="5" fill="#ff5c8a"/><text x="${215 + dl * 36}" y="148" fill="#fff" font-size="11" font-weight="800" text-anchor="middle">${load}</text></g><text x="215" y="22" fill="#9aa6cf" font-size="13" text-anchor="middle">net moment ${fmt(net / 1000, 2)} kN·m ${Math.abs(net) < 1 ? '· balanced' : net > 0 ? '· tips left' : '· tips right'}</text></svg>` },
      plots: () => [{ title: 'Net moment about the pivot', x: { label: 'counterweight distance', unit: 'm', min: 0, max: 5 }, y: { label: 'net moment', unit: 'kN·m', min: -load * dl * G / 1000 * 1.1, max: (cw * 5 - load * dl) * G / 1000 * 1.05 }, series: [{ color: C.line, points: [[0, -load * dl * G / 1000], [5, (cw * 5 - load * dl) * G / 1000]] }], marks: [{ x: s.d, y: moment([[cw, s.d], [load, -dl]]) / 1000, label: 'you', color: C.you }] }],
      figure: () => `<h3>Principle of moments</h3><span class="eq">${cw} × d = ${load} × ${dl}</span><p>Moment = force × perpendicular distance from the pivot (g = 9.8 m/s²).</p>`,
      check: () => Math.abs(s.d - need) <= 0.026 ? { ok: true, msg: `Balanced at d = ${fmt(need)} m.` } : { ok: false, msg: `Net moment is ${fmt(moment([[cw, s.d], [load, -dl]]) / 1000)} kN·m.` },
    })
  },
  U(r) {
    const m = pick(r, [0.5, 1, 2, 4]), k = pick(r, [50, 100, 200, 400]), s = { c: 2 }
    const d0 = damped(m, 1, k), crit = d0.cCrit
    return dialRound(s, {
      prompt: `A car shock absorber: <em>m = ${m} kg</em>, <em>k = ${k} N/m</em>. Tune the damping c so the mass returns to rest as fast as possible <em>without overshooting</em>.`,
      hint: 'Critical damping: ζ = c / (2√(km)) = 1.',
      limits: { c: [0, 150] }, dials: st => [['c', 'Damping c', st.c, 'N·s/m', 0.1], ['c', 'Damping c (coarse)', st.c, 'N·s/m', 2]],
      scene: st => { const d = damped(m, st.c, k); return `<p class="figure">ζ = ${fmt(d.zeta, 3)} · regime: <b>${d.regime === 'critical' ? 'critically damped' : d.regime === 'under' ? 'underdamped (overshoots)' : 'overdamped (sluggish)'}</b> · ω₀ = ${fmt(d.w0)} rad/s</p>` },
      plots: () => { const d = damped(m, s.c, k), T = 8 / d0.w0, ts = Array.from({ length: 161 }, (_, i) => i * T / 160); return [{ title: 'Displacement after release', x: { label: 'time', unit: 's', min: 0, max: T }, y: { label: 'displacement x/x₀', min: -1, max: 1.05 }, series: [{ name: 'critical', color: C.line, dash: true, points: ts.map(t => [t, damped(m, crit, k).x(t)]) }, { name: 'yours', color: C.you, points: ts.map(t => [t, d.x(t)]) }] }] },
      figure: () => `<h3>Damping regimes</h3><span class="eq">c_crit = 2√(km) = ${fmt(crit)} N·s/m</span><p>Below c_crit the response oscillates; above it, it creeps back slowly.</p>`,
      check: () => Math.abs(s.c - crit) / crit <= 0.02 ? { ok: true, msg: `Critically damped: c ≈ ${fmt(crit)} N·s/m.` } : { ok: false, msg: s.c < crit ? 'Underdamped: it overshoots.' : 'Overdamped: it returns too slowly.' },
    })
  },
}

export function game(variant) { return { rounds: 5, newRound: r => levels[variant.levelCode](r) } }
