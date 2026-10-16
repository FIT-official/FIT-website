// Differentiation concept engine (pure). Original FIT code.
export const forward = (f, x, h) => (f(x + h) - f(x)) / h;
export const central = (f, x, h) => (f(x + h) - f(x - h)) / (2 * h);
export const speed = (distance, time) => (time === 0 ? NaN : distance / time);
// Polynomial helpers: coefficients [c0, c1, c2, ...]
export const polyEval = (c, x) => c.reduceRight((s, k) => s * x + k, 0);
export const polyDeriv = c => c.slice(1).map((k, i) => k * (i + 1));
export const tangent = (f, df, x0) => x => f(x0) + df(x0) * (x - x0);
// Stationary points of a cubic a x^3 + b x^2 + c x + d (real roots of 3a x^2 + 2b x + c).
export function stationaryCubic([, c, b, a]) {
  const A = 3 * a, B = 2 * b, disc = B * B - 4 * A * c;
  if (A === 0) return B === 0 ? [] : [{ x: -c / B, kind: B > 0 ? 'min' : 'max' }];
  if (disc < 0) return [];
  const r = [(-B - Math.sqrt(disc)) / (2 * A), (-B + Math.sqrt(disc)) / (2 * A)].sort((p, q) => p - q);
  return r.map(x => ({ x, kind: 6 * a * x + 2 * b > 0 ? 'min' : 6 * a * x + 2 * b < 0 ? 'max' : 'inflection' }));
}
// Central-difference velocity from evenly sampled positions.
export function velocities(s, dt) { return s.map((_, i) => (i === 0 ? (s[1] - s[0]) / dt : i === s.length - 1 ? (s[i] - s[i - 1]) / dt : (s[i + 1] - s[i - 1]) / (2 * dt))); }
export const FUNCS = {
  sin: { label: 'sin x', f: Math.sin, df: Math.cos },
  exp: { label: 'eˣ', f: Math.exp, df: Math.exp },
  cube: { label: 'x³', f: x => x ** 3, df: x => 3 * x * x },
  ln: { label: 'ln x', f: Math.log, df: x => 1 / x },
};
