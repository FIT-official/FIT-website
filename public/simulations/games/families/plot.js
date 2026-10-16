// Live SVG plotting for FIT family games. Original FIT code.
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

