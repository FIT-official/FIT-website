// KAT harness for the Tier-1 X1 compartment / lumped-model calc module (ChatGPT, verbatim).
// Cases: tests/fixtures/kat/tier1/lumped_models.json (copy of kat_cases/tier1/lumped_models.json, FIT Stock Strategy).
// This file only maps each KAT op onto the published FITCalcX1 API and renames output keys; it computes no answers.
// A KAT field the API does not return counts as a failure. Cases in PENDING_FIX fail today (see FIX_REQUEST.md):
// they run as it.fails, so the suite stays green and an unexpected pass is flagged so the id can be removed.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import FITCalcX1 from '../../lib/sims/tier1/x1_compartment.calc.js'

const kat = JSON.parse(readFileSync('tests/fixtures/kat/tier1/lumped_models.json', 'utf8'))
const REL = kat.tolerance.rel, ABS0 = kat.tolerance.abs_when_expected_zero

const rename = (r, map) => {
  if (!r || r.error) return r
  const o = {}
  for (const [from, to] of Object.entries(map)) if (Object.prototype.hasOwnProperty.call(r, from)) o[to] = r[from]
  return o
}

// op -> FITCalcX1 call. fix1 exposes KAT-shaped functions; inputs pass straight through.
const run = {
  decay: i => FITCalcX1.decay(i),
  radioactive: i => rename(FITCalcX1.radioactiveDecay({ N0: i.N0, halfLife_s: i.half_life, t_s: i.t }),
    { N: 'N', lambda_per_s: 'lambda', activity_Bq: 'activity' }),
  reactor: i => FITCalcX1.reactor(i),
  lake: i => FITCalcX1.lake(i),
  tank_step: i => FITCalcX1.tankStep(i),
  growth: i => FITCalcX1.growth(i),
  monod: i => FITCalcX1.monodRate(i),
  lv_equilibrium: i => FITCalcX1.lvEquilibrium(i),
  lv_state: i => {
    const r = FITCalcX1.lotkaVolterra({ x0: i.x0, y0: i.y0, alpha: i.alpha, beta: i.beta, delta: i.delta,
      gamma: i.gamma, dt: i.h, steps: Math.round(i.t / i.h) })
    return r.error ? r : { prey: r.x.at(-1), pred: r.y.at(-1) }
  },
  stock_flow: i => FITCalcX1.stockFlow(i),
}

function matches(actual, expected) {
  if (!actual || typeof actual !== 'object') return false
  if (Object.prototype.hasOwnProperty.call(expected, 'error'))
    return Object.keys(expected).every(k => actual[k] === expected[k]) && Object.keys(actual).length === Object.keys(expected).length
  if (actual.error) return false
  return Object.entries(expected).every(([k, e]) => {
    if (!Object.prototype.hasOwnProperty.call(actual, k)) return false
    const a = actual[k]
    if (e === null || typeof e === 'boolean') return a === e
    if (typeof a !== 'number' || !Number.isFinite(a)) return false
    return e === 0 ? Math.abs(a) <= ABS0 : Math.abs(a - e) <= REL * Math.abs(e)
  })
}

// Failing today, pending a ChatGPT fix (FIX_REQUEST.md). Remove ids as fixes land. fix1: none.
const PENDING_FIX = []

describe('Tier-1 X1 compartment calc module vs lumped_models.json KATs', () => {
  it('KAT file shape is as signed off (27 cases, every op mapped)', () => {
    expect(kat.cases).toHaveLength(27)
    for (const c of kat.cases) expect(typeof run[c.op]).toBe('function')
  })
  for (const c of kat.cases) {
    const t = PENDING_FIX.includes(c.id) ? it.fails : it
    t(`${c.id}: ${c.desc}`, () => {
      const actual = run[c.op](c.input)
      expect(matches(actual, c.expected), JSON.stringify({ actual, expected: c.expected })).toBe(true)
    })
  }
  it('never returns NaN or Infinity for any KAT input', () => {
    for (const c of kat.cases) {
      const s = JSON.stringify(run[c.op](c.input), (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? 'NONFINITE' : v))
      expect(s).not.toContain('NONFINITE')
    }
  })
})

describe('Tier-1 X1 games embed the module code verbatim', () => {
  // fix1: the Poly game's embedded block carries older doc comments; code must match exactly once comments are removed.
  const block = s => s.slice(s.indexOf('/* FIT-CALC-BEGIN x1_compartment */'), s.indexOf('/* FIT-CALC-END x1_compartment */'))
  const code = s => block(s).replace(/\/\*\*[\s\S]*?\*\//g, '').split('\n').filter(l => l.trim()).join('\n')
  const mod = code(readFileSync('lib/sims/tier1/x1_compartment.calc.js', 'utf8'))
  it.each(['x1-compartment-poly', 'x1-compartment-u1', 'x1-compartment-u2'])('%s', id => {
    expect(code(readFileSync(`content/sims/html/${id}.html`, 'utf8'))).toBe(mod)
  })
})
