// Shared helpers for the generic numerical models. Every model is a pure function of its
// parameters so results are repeatable and can be checked against hand calculations.

export function normaliseParams(params, input = {}) {
  const out = {}
  for (const p of params) {
    let v = Number(input[p.id])
    if (!Number.isFinite(v)) v = p.default
    v = Math.min(p.max, Math.max(p.min, v))
    if (p.integer) v = Math.round(v)
    out[p.id] = v
  }
  return out
}

export const out = (id, label, value, unit, digits = 3) => ({
  id,
  label,
  value: Number.isFinite(value) ? value : null,
  unit,
  digits,
})

export function formatValue(value, digits = 3) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a'
  if (value === 0) return '0'
  const abs = Math.abs(value)
  if (abs >= 1e5 || abs < 1e-3) return value.toExponential(Math.max(0, digits - 1))
  return String(Number(value.toPrecision(digits)))
}

export function decimate(x, y, maxPoints = 400) {
  if (x.length <= maxPoints) return { x: Array.from(x), y: Array.from(y) }
  const step = Math.ceil(x.length / maxPoints)
  const xs = []
  const ys = []
  for (let i = 0; i < x.length; i += step) {
    xs.push(x[i])
    ys.push(y[i])
  }
  return { x: xs, y: ys }
}

export const trace = (label, x, y) => ({ label, x: Array.from(x), y: Array.from(y) })
export const chart = (id, title, xLabel, yLabel, traces) => ({ id, title, xLabel, yLabel, traces })
