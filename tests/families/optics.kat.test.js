// Optics family: FITCalcOptics against kat_cases/families/optics.json (44 cases; copied unchanged into
// tests/fixtures/kat/families/). Runs against the module AND the copy embedded in each game (between
// FIT-CALC-BEGIN/END optics), because the games use their own copies. Every KAT op is a module export
// called directly with the KAT input; no adapter, no maths here.
// Add a case id to XFAIL to mark a known failure (it.fails); run with KAT_STRICT=1 to see every failure plainly.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import FITCalcOptics from '../../lib/sims/families/optics.calc.js'

const kat = JSON.parse(readFileSync('tests/fixtures/kat/families/optics.json', 'utf8'))
const REL = kat.tolerance.rel, ABS0 = kat.tolerance.abs

function close(got, exp, path) {
  if (typeof exp === 'number') {
    expect(typeof got, `${path} type (got ${JSON.stringify(got)})`).toBe('number')
    if (exp === 0) expect(Math.abs(got), path).toBeLessThanOrEqual(ABS0)
    else expect(Math.abs(got - exp) / Math.abs(exp), `${path}: got ${got}, want ${exp}`).toBeLessThanOrEqual(REL)
  } else if (Array.isArray(exp)) {
    expect(Array.isArray(got), `${path} array`).toBe(true); expect(got.length, `${path} length`).toBe(exp.length)
    exp.forEach((e, k) => close(got[k], e, `${path}[${k}]`))
  } else if (exp && typeof exp === 'object') {
    if ('error' in exp) expect(got, path).toEqual(exp) // errors exact: {error, reason}
    else for (const k of Object.keys(exp)) close(got?.[k], exp[k], `${path}.${k}`)
  } else expect(got, path).toEqual(exp)
}

function embedded(id) {
  const html = readFileSync(`content/sims/html/${id}.html`, 'utf8')
  const m = html.match(/\/\* FIT-CALC-BEGIN optics \*\/[\s\S]*?\/\* FIT-CALC-END optics \*\//)
  return m && new Function(`${m[0]}\nreturn FITCalcOptics;`)()
}

export const XFAIL = {}
const STRICT = process.env.KAT_STRICT === '1'
const GAMES = ['optics-p', 'optics-s', 'optics-jc', 'optics-poly', 'optics-u']
const sources = [['module', FITCalcOptics], ...GAMES.map(id => [id, embedded(id)])]

for (const [name, C] of sources) {
  describe(`FITCalcOptics (${name}) vs optics.json`, () => {
    it('has 44 cases, API v1 and a function for every op', () => {
      expect(C, 'embedded FIT-CALC block').toBeTruthy()
      expect(kat.cases.length).toBe(44); expect(C.API_VERSION).toBe(1)
      for (const c of kat.cases) expect(typeof C[c.op], c.op).toBe('function')
    })
    for (const c of kat.cases) {
      const fn = () => close(C[c.op](c.input), c.expected, c.id)
      if (!STRICT && XFAIL[c.id]) it.fails(`${c.id} (xfail: ${XFAIL[c.id]})`, fn)
      else it(c.id, fn)
    }
  })
}
