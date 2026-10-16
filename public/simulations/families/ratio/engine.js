// Ratio concept engine (pure, testable). Original FIT code.
export const gcd = (a, b) => { a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b)); while (b) [a, b] = [b, a % b]; return a; };
export function simplify(a, b) { const g = gcd(a, b) || 1; return [a / g, b / g]; }
export const equivalent = (a, b, c, d) => b !== 0 && d !== 0 && Math.abs(a * d - b * c) < 1e-9;
// Direct proportion y = kx
export const unitRate = (x, y) => (x === 0 ? NaN : y / x);
export const proportional = (k, x) => k * x;
// Stoichiometry aA + bB -> cC (mol). Returns limiting reagent and product moles.
export function reaction({ a, b, c }, nA, nB) {
  const extent = Math.min(nA / a, nB / b);
  const limiting = Math.abs(nA / a - nB / b) < 1e-9 ? 'none' : nA / a < nB / b ? 'A' : 'B';
  return { extent, product: c * extent, limiting, leftA: nA - a * extent, leftB: nB - b * extent };
}
// Simple gear pair: speed ratio and ideal torque (lossless).
export function gears(inRpm, driverTeeth, drivenTeeth, inTorque = 1) {
  const ratio = drivenTeeth / driverTeeth;
  return { ratio, outRpm: inRpm / ratio, outTorque: inTorque * ratio };
}
// Power-law scaling y = k x^n; least-squares fit in log-log space.
export const powerLaw = (k, n, x) => k * x ** n;
export function fitPowerLaw(points) {
  const P = points.filter(([x, y]) => x > 0 && y > 0).map(([x, y]) => [Math.log10(x), Math.log10(y)]);
  const N = P.length, mx = P.reduce((s, p) => s + p[0], 0) / N, my = P.reduce((s, p) => s + p[1], 0) / N;
  const n = P.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / P.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  return { n, k: 10 ** (my - n * mx) };
}
