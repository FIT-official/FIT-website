// FIT concept-family game shell. Original FIT code; no third-party runtime.
// A family module exports `game(variant)` -> { rounds, newRound(rng) }.
// A round is { prompt, figure?, render(stage, changed), plots() -> [plotSpec], check() -> {ok, msg}, hint }.
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; };
}
export const pick = (r, list) => list[Math.floor(r() * list.length)];
export const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export const pow10 = v => { const e = Math.round(Math.log10(v)); return e >= 0 && e <= 3 ? String(10 ** e) : `10${String(e).split('').map(c => SUP[c]).join('')}`; };
export const fmt = (v, d = 2) => Number.isFinite(v) ? (+v.toFixed(d)).toLocaleString('en') : '—';

export function niceTicks(lo, hi, n = 5) {
  const span = hi - lo || 1, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || raw;
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

// Live SVG plot: labelled axes with units, gridlines, lines, points, markers.
// spec: { title, x:{label,unit,min,max,log?}, y:{...}, series:[{name,color,points:[[x,y]],dash?,dots?}], marks:[{x,y,label,color}] }
export function plotSVG(spec, w = 420, h = 270) {
  const m = { l: 56, r: 14, t: 30, b: 46 }, W = w - m.l - m.r, H = h - m.t - m.b;
  const tr = (a, v) => a.log ? Math.log10(v) : v;
  const sx = v => m.l + (tr(spec.x, v) - tr(spec.x, spec.x.min)) / (tr(spec.x, spec.x.max) - tr(spec.x, spec.x.min)) * W;
  const sy = v => m.t + H - (tr(spec.y, v) - tr(spec.y, spec.y.min)) / (tr(spec.y, spec.y.max) - tr(spec.y, spec.y.min)) * H;
  const ticks = a => a.log ? Array.from({ length: Math.round(Math.log10(a.max / a.min)) + 1 }, (_, i) => a.min * 10 ** i) : niceTicks(a.min, a.max);
  const ok = ([x, y]) => Number.isFinite(x) && Number.isFinite(y) && (!spec.x.log || x > 0) && (!spec.y.log || y > 0);
  const clipY = y => Math.max(m.t - 4, Math.min(m.t + H + 4, y));
  let g = `<svg class="plot" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(spec.title)}: ${esc(spec.y.label)} against ${esc(spec.x.label)}"><text class="pt" x="${m.l}" y="18">${esc(spec.title)}</text>`;
  g += `<clipPath id="c${w}${h}"><rect x="${m.l}" y="${m.t}" width="${W}" height="${H}"/></clipPath>`;
  for (const t of ticks(spec.x)) g += `<line class="grid" x1="${sx(t)}" x2="${sx(t)}" y1="${m.t}" y2="${m.t + H}"/><text class="tick" x="${sx(t)}" y="${m.t + H + 15}" text-anchor="middle">${spec.x.log ? pow10(t) : fmt(t, 3)}</text>`;
  for (const t of ticks(spec.y)) g += `<line class="grid" y1="${sy(t)}" y2="${sy(t)}" x1="${m.l}" x2="${m.l + W}"/><text class="tick" x="${m.l - 6}" y="${sy(t) + 4}" text-anchor="end">${spec.y.log ? pow10(t) : fmt(t, 3)}</text>`;
  if (!spec.y.log && spec.y.min < 0 && spec.y.max > 0) g += `<line class="zero" x1="${m.l}" x2="${m.l + W}" y1="${sy(0)}" y2="${sy(0)}"/>`;
  if (!spec.x.log && spec.x.min < 0 && spec.x.max > 0) g += `<line class="zero" y1="${m.t}" y2="${m.t + H}" x1="${sx(0)}" x2="${sx(0)}"/>`;
  g += `<rect class="frame" x="${m.l}" y="${m.t}" width="${W}" height="${H}"/>`;
  g += `<g clip-path="url(#c${w}${h})">`;
  for (const s of spec.series || []) {
    const pts = s.points.filter(ok);
    if (!s.dotsOnly && pts.length > 1) g += `<polyline fill="none" stroke="${s.color}" stroke-width="${s.width || 2.6}" ${s.dash ? 'stroke-dasharray="6 5"' : ''} stroke-linecap="round" stroke-linejoin="round" points="${pts.map(([x, y]) => `${sx(x).toFixed(1)},${clipY(sy(y)).toFixed(1)}`).join(' ')}"/>`;
    if (s.dots || s.dotsOnly) for (const p of pts) g += `<circle cx="${sx(p[0])}" cy="${sy(p[1])}" r="4.5" fill="${s.color}" stroke="#0b1020" stroke-width="1.5"/>`;
  }
  for (const k of spec.marks || []) if (ok([k.x, k.y])) g += `<circle class="mark" cx="${sx(k.x)}" cy="${sy(k.y)}" r="7" fill="${k.color || '#ffd166'}"/>${k.label ? `<text class="ml" x="${sx(k.x) + 10}" y="${sy(k.y) - 10}">${esc(k.label)}</text>` : ''}`;
  g += `</g><text class="axl" x="${m.l + W / 2}" y="${h - 8}" text-anchor="middle">${esc(spec.x.label)}${spec.x.unit ? ` (${esc(spec.x.unit)})` : ''}</text>`;
  g += `<text class="axl" transform="translate(14 ${m.t + H / 2}) rotate(-90)" text-anchor="middle">${esc(spec.y.label)}${spec.y.unit ? ` (${esc(spec.y.unit)})` : ''}</text>`;
  if ((spec.series || []).filter(s => s.name).length > 1) g += `<g class="legend">${spec.series.filter(s => s.name).map((s, i) => `<rect x="${m.l + 8 + i * 110}" y="${m.t + 6}" width="12" height="4" fill="${s.color}"/><text x="${m.l + 24 + i * 110}" y="${m.t + 11}">${esc(s.name)}</text>`).join('')}</g>`;
  return g + '</svg>';
}

// Custom stepper "dial" (no default widgets). Returns html; wire with bindDials.
export function dial(key, label, value, unit = '', step = 1) {
  return `<div class="dial" data-dial="${key}" data-step="${step}"><span class="dl">${esc(label)}</span><button type="button" class="db" data-d="-1" aria-label="Decrease ${esc(label)}">−</button><output class="dv" aria-live="polite">${esc(value)}<small>${esc(unit)}</small></output><button type="button" class="db" data-d="1" aria-label="Increase ${esc(label)}">+</button></div>`;
}
export function bindDials(root, onStep) {
  root.querySelectorAll('[data-dial]').forEach(el => el.querySelectorAll('.db').forEach(b => {
    let timer;
    const go = () => onStep(el.dataset.dial, Number(b.dataset.d) * Number(el.dataset.step));
    b.addEventListener('pointerdown', e => { e.preventDefault(); go(); timer = setInterval(go, 160); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => b.addEventListener(t, () => clearInterval(timer)));
    b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  }));
}
// Drag helper for SVG handles: maps pointer to viewBox coords.
export function dragSVG(svg, handleSel, onMove) {
  svg.querySelectorAll(handleSel).forEach(h => h.addEventListener('pointerdown', e => {
    e.preventDefault(); h.setPointerCapture(e.pointerId);
    const move = ev => { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; const q = p.matrixTransform(svg.getScreenCTM().inverse()); onMove(h.dataset.h, q.x, q.y); };
    h.addEventListener('pointermove', move);
    h.addEventListener('pointerup', () => h.removeEventListener('pointermove', move), { once: true });
  }));
}

export function scoreFor(ok, streak, tries) { return ok ? Math.max(40, 100 - 30 * (tries - 1)) + 20 * Math.min(streak, 5) : 0; }
export function stars(score, rounds) { const f = score / (rounds * 140); return f >= .8 ? 3 : f >= .5 ? 2 : f > 0 ? 1 : 0; }

export function mount(app, variant, family, seed = Date.now() % 1e6) {
  const r = rng(seed), game = family.game(variant);
  let n = 0, score = 0, streak = 0, tries = 0, round, done = false;
  document.documentElement.style.setProperty('--accent', variant.accent);
  app.innerHTML = `<div class="g">
    <header class="hud"><a class="brand" href="/class/simulations">FIT<b>LAB</b></a>
      <div class="badges"><span class="lvl lvl-${variant.levelCode}">${esc(variant.level)}</span><span class="pill">${esc(variant.topic)}</span><span class="pill diff">${'●'.repeat(variant.difficulty)}${'○'.repeat(3 - variant.difficulty)}</span></div>
      <div class="score"><span id="rnd"></span><span id="pts">0</span><span id="stk"></span></div></header>
    <h1>${esc(variant.symbol)} ${esc(variant.title)}</h1>
    <p class="goal">${esc(variant.objective)}</p>
    <main class="arena"><section class="stage-card"><div id="prompt" class="prompt"></div><div id="stage" class="stage"></div>
      <div class="actions"><button id="check" class="go">Check</button><button id="hint" class="ghost">Hint</button><button id="next" class="go" hidden>Next ▸</button></div><div id="fb" class="fb" aria-live="polite"></div></section>
      <section class="figs"><div id="plots"></div><div id="figure" class="figure"></div></section></main>
    <footer class="foot">${variant.syllabus ? `Syllabus: ${esc(variant.syllabus)} · ` : ''}FIT original simulation</footer></div>`;
  const $ = s => app.querySelector(s);
  const draw = () => { $('#plots').innerHTML = round.plots().map(p => plotSVG(p)).join(''); $('#figure').innerHTML = round.figure ? round.figure() : ''; };
  const hud = () => { $('#rnd').textContent = `Round ${Math.min(n, game.rounds)}/${game.rounds}`; $('#pts').textContent = `${score} pts`; $('#stk').textContent = streak > 1 ? `🔥×${streak}` : ''; };
  const start = () => {
    n += 1; tries = 0; round = game.newRound(r, n);
    $('#prompt').innerHTML = round.prompt; $('#fb').textContent = ''; $('#fb').className = 'fb';
    $('#next').hidden = true; $('#check').hidden = false; $('#hint').hidden = false;
    round.render($('#stage'), draw); draw(); hud();
  };
  const finish = () => {
    done = true; const s = stars(score, game.rounds);
    $('#stage').innerHTML = `<div class="win"><div class="stars">${'★'.repeat(s)}<span>${'★'.repeat(3 - s)}</span></div><p>${score} points</p><button id="again" class="go">Play again</button></div>`;
    $('#prompt').textContent = 'Level complete!'; ['#check', '#hint', '#next'].forEach(k => { $(k).hidden = true; });
    $('#again').onclick = () => { n = 0; score = 0; streak = 0; done = false; start(); };
  };
  $('#check').onclick = () => {
    if (done) return; tries += 1; const res = round.check();
    $('#fb').textContent = res.msg; $('#fb').className = `fb ${res.ok ? 'ok' : 'no'}`;
    if (res.ok) { streak += 1; score += scoreFor(true, streak, tries); $('#check').hidden = true; $('#hint').hidden = true; $('#next').hidden = false; $('#next').focus(); app.querySelector('.stage-card').classList.add('pop'); setTimeout(() => app.querySelector('.stage-card').classList.remove('pop'), 500); }
    else streak = 0;
    hud();
  };
  $('#hint').onclick = () => { $('#fb').textContent = `Hint: ${round.hint}`; $('#fb').className = 'fb'; tries += 1; };
  $('#next').onclick = () => (n >= game.rounds ? finish() : start());
  start();
  return { get score() { return score; } };
}
