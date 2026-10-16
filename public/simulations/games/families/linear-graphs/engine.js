// Linear graphs concept engine (pure). Original FIT code.
export const lineY = (m, c, x) => m * x + c
export const gradient = ([x1, y1], [x2, y2]) => (x2 === x1 ? NaN : (y2 - y1) / (x2 - x1))
export const interceptOf = (p, q) => p[1] - gradient(p, q) * p[0]
export const onLine = (m, c, [x, y], tol = 1e-9) => Math.abs(m * x + c - y) <= tol
export function leastSquares(points) {
  const n = points.length, mx = points.reduce((s, p) => s + p[0], 0) / n, my = points.reduce((s, p) => s + p[1], 0) / n
  const sxx = points.reduce((s, [x]) => s + (x - mx) ** 2, 0), sxy = points.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0), syy = points.reduce((s, [, y]) => s + (y - my) ** 2, 0)
  const m = sxy / sxx
  return { m, c: my - m * mx, r: sxy / Math.sqrt(sxx * syy) }
}
export const sse = (points, m, c) => points.reduce((s, [x, y]) => s + (y - m * x - c) ** 2, 0)
// Two-point calibration: reading -> physical value
export const calibrate = (p, q, reading) => p[1] + gradient(p, q) * (reading - p[0])
// 2x2 system a1 x + b1 y = c1, a2 x + b2 y = c2 (Cramer's rule)
export function solve2([a1, b1, c1], [a2, b2, c2]) {
  const det = a1 * b2 - a2 * b1
  return det === 0 ? { det, x: NaN, y: NaN } : { det, x: (c1 * b2 - c2 * b1) / det, y: (a1 * c2 - a2 * c1) / det }
}
// Read a value from a piecewise-linear line graph
export function readLine(points, x) {
  for (let i = 1; i < points.length; i++) if (x <= points[i][0]) { const [x0, y0] = points[i - 1], [x1, y1] = points[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0) }
  return NaN
}
