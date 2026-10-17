// Tier-1 X6 (numerical stability + FIT Printers pendulum option): KATs from tests/fixtures/kat/tier1/
// numerics_stability.json (23 cases, FIT Stock Strategy) and x6_pendulum.json (25 cases, FIT Printers), unchanged
// copies of kat_cases/tier1/. KAT op names and inputs are the module's own: X[c.op](c.input), no adapter, no arithmetic
// on outputs. Every case runs 4 times: on lib/sims/tier1/x6_numerical_stability.calc.js and on the FIT-CALC block in
// each game. Every expected field must be present. Numbers: numerics_stability rel 1e-6 (abs 1e-9 when 0);
// x6_pendulum max(abs, rel*|want|) with per-case 'tol'. Strings, booleans, nulls exact. Errors exact {error, reason}.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import X6mod from '../../../lib/sims/tier1/x6_numerical_stability.calc.js'

const ROOT = join(__dirname, '../../..')
const kat = f => JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/kat/tier1', f), 'utf8'))
const NS = kat('numerics_stability.json'), PEN = kat('x6_pendulum.json')
const GAMES = ['x6-numerical-stability-poly', 'x6-numerical-stability-u1', 'x6-numerical-stability-u2']
const block = src => src.match(/\/\* FIT-CALC-BEGIN x6_numerical_stability \*\/[\s\S]*?\/\* FIT-CALC-END x6_numerical_stability \*\//)[0]
const load = name => new Function(block(readFileSync(join(ROOT, 'content/sims/html', name + '.html'), 'utf8')) + '\nreturn FITCalcX6;')()
const IMPLS = [['module', X6mod], ...GAMES.map(g => [g, load(g)])]

const nsTol = (want) => want === 0 ? NS.tolerance.abs_when_expected_zero : NS.tolerance.rel * Math.abs(want)
const penTol = c => want => { const t = c.tol || PEN.tolerance; return Math.max(t.abs, t.rel * Math.abs(want)) }
function near(got, want, path, tol) {
  if (want === null || typeof want === 'string' || typeof want === 'boolean') return expect(got, `${path}: got ${got}, want ${want}`).toBe(want)
  if (Array.isArray(want)) { expect(got, path).toHaveLength(want.length); return want.forEach((w, i) => near(got[i], w, `${path}[${i}]`, tol)) }
  expect(Number.isFinite(got), `${path} finite (got ${got})`).toBe(true)
  expect(Math.abs(got - want), `${path}: got ${got}, want ${want}`).toBeLessThanOrEqual(tol(want))
}
function runCase(X, c, tol) {
  const got = X[c.op](structuredClone(c.input)), e = c.expected
  if (e.error) return expect(got).toEqual({ error: e.error, reason: e.reason })
  expect(got && got.error, JSON.stringify(got)).toBeFalsy()
  for (const [k, w] of Object.entries(e)) { expect(k in got, `${c.id}: field ${k} missing`).toBe(true); near(got[k], w, `${c.id}.${k}`, tol) }
}

// XFAIL: no remaining expected failures after the corrected KAT.
const XFAIL = new Set()
describe.each(IMPLS)('numerics_stability KATs on %s', (_, X) => {
  for (const c of NS.cases) (XFAIL.has(c.id) ? it.fails : it)(XFAIL.has(c.id) ? `${c.id} (XFAIL)` : c.id, () => runCase(X, c, nsTol))
})
describe.each(IMPLS)('x6_pendulum KATs on %s', (_, X) => {
  for (const c of PEN.cases) it(c.id, () => runCase(X, c, penTol(c)))
})

describe('X6 integrity', () => {
  const lib = block(readFileSync(join(ROOT, 'lib/sims/tier1/x6_numerical_stability.calc.js'), 'utf8'))
  it.each(GAMES)('FIT-CALC block in %s is byte-identical to the module', g => {
    expect(block(readFileSync(join(ROOT, 'content/sims/html', g + '.html'), 'utf8'))).toBe(lib)
  })
})
