// Forces concept engine (pure, testable). Original FIT code. SI units, g = 9.8 m/s².
export const G = 9.8
export const netForce = forces => forces.reduce((s, f) => s + f, 0)
// Newton's second law with kinetic friction opposing motion (block starts at rest).
export function motion(F, m, mu = 0) {
  const fric = mu * m * G, net = Math.abs(F) <= fric ? 0 : F - Math.sign(F) * fric
  return { friction: Math.min(Math.abs(F), fric), net, a: net / m }
}
// Incline: force along slope (up-slope positive) for constant velocity moving up the slope.
export function inclineHold(m, deg, mu) { const t = deg * Math.PI / 180; return m * G * (Math.sin(t) + mu * Math.cos(t)) }
export function inclineParts(m, deg) { const t = deg * Math.PI / 180; return { along: m * G * Math.sin(t), normal: m * G * Math.cos(t) } }
// Beam about a pivot: sum of moments (anticlockwise positive), loads as [mass kg, distance m from pivot, side ±1].
export const moment = loads => loads.reduce((s, [m, d]) => s + m * G * d, 0)
// Damped oscillator m x'' + c x' + k x = 0, x(0)=1, x'(0)=0. Returns x(t) and the regime.
export function damped(m, c, k) {
  const w0 = Math.sqrt(k / m), z = c / (2 * Math.sqrt(k * m))
  const regime = Math.abs(z - 1) < 0.02 ? 'critical' : z < 1 ? 'under' : 'over'
  const x = t => {
    if (Math.abs(z - 1) < 1e-9) return (1 + w0 * t) * Math.exp(-w0 * t)
    if (z < 1) { const wd = w0 * Math.sqrt(1 - z * z); return Math.exp(-z * w0 * t) * (Math.cos(wd * t) + z * w0 / wd * Math.sin(wd * t)) }
    const r1 = -w0 * (z - Math.sqrt(z * z - 1)), r2 = -w0 * (z + Math.sqrt(z * z - 1)), A = r2 / (r2 - r1)
    return A * Math.exp(r1 * t) + (1 - A) * Math.exp(r2 * t)
  }
  return { w0, zeta: z, regime, x, cCrit: 2 * Math.sqrt(k * m) }
}
