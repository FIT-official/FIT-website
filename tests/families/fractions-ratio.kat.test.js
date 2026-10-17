// Fractions-ratio family: FITCalcRatio against kat_cases/families/fractions-ratio.json (74 cases; copied unchanged into
// tests/fixtures/kat/families/). Runs against the module AND the copy embedded in each game (between
// FIT-CALC-BEGIN/END fractions-ratio). Same pattern as tests/families/optics.kat.test.js; integers exact per the KAT tolerance note.
// FIT Docs vet harness (row 73), strict: no XFAIL.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import FITCalcRatio from '../../lib/sims/families/fractions-ratio.calc.js'

const kat = JSON.parse(readFileSync('tests/fixtures/kat/families/fractions-ratio.json', 'utf8'))
const REL = kat.tolerance.rel, ABS0 = kat.tolerance.abs_when_expected_zero
const INT_EXACT = new Set(['a0', 'best_index', 'convergents', 'den', 'denominators', 'gcd', 'n', 'num', 'parts', 'parts_a', 'parts_b', 'period', 'terms', 'whole'])

function close(got, exp, path, key = '') {
  if (typeof exp === 'number') {
    expect(typeof got, `${path} type (got ${JSON.stringify(got)})`).toBe('number')
    expect(Number.isFinite(got), `${path} finite`).toBe(true)
    if (INT_EXACT.has(key) && Number.isInteger(exp)) expect(got, path).toBe(exp)
    else if (exp === 0) expect(Math.abs(got), path).toBeLessThanOrEqual(ABS0)
    else expect(Math.abs(got - exp) / Math.abs(exp), `${path}: got ${got}, want ${exp}`).toBeLessThanOrEqual(REL)
  } else if (Array.isArray(exp)) {
    expect(Array.isArray(got), `${path} array`).toBe(true); expect(got.length, `${path} length`).toBe(exp.length)
    exp.forEach((e, k) => close(got[k], e, `${path}[${k}]`, key))
  } else if (exp && typeof exp === 'object') {
    if ('error' in exp) expect(got, path).toEqual(exp)
    else for (const k of Object.keys(exp)) close(got?.[k], exp[k], `${path}.${k}`, k)
  } else expect(got, path).toEqual(exp)
}

function embedded(id) {
  const html = readFileSync(`content/sims/html/${id}.html`, 'utf8')
  const m = html.match(/\/\* FIT-CALC-BEGIN fractions-ratio \*\/[\s\S]*?\/\* FIT-CALC-END fractions-ratio \*\//)
  return m && new Function(`${m[0]}\nreturn FITCalcRatio;`)()
}

const GAMES = ['fractions-ratio-p', 'fractions-ratio-s', 'fractions-ratio-jc', 'fractions-ratio-poly', 'fractions-ratio-u']
const sources = [['module', FITCalcRatio], ...GAMES.map(id => [id, embedded(id)])]

for (const [name, C] of sources) {
  describe(`FITCalcRatio (${name}) vs fractions-ratio.json`, () => {
    it('has 74 cases, API v1 and a function for every op', () => {
      expect(C, 'embedded FIT-CALC block').toBeTruthy()
      expect(kat.cases.length).toBe(74); expect(C.API_VERSION).toBe(1)
      for (const c of kat.cases) expect(typeof C[c.op], c.op).toBe('function')
    })
    for (const c of kat.cases) it(c.id, () => close(C[c.op](structuredClone(c.input)), c.expected, c.id))
  })
}
