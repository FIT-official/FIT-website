// ecosystems family: FITCalcEco against kat_cases/families/ecosystems.json (53 cases; copied unchanged into
// tests/fixtures/kat/families/). Runs against the module AND the copy embedded in each game (between
// FIT-CALC-BEGIN/END ecosystems), because the games use their own copies. Every KAT op is a module export
// called directly with the KAT input; no adapter, no maths here. Name-keyed objects (organism -> value) must
// have exactly the expected keys; top-level results may carry extra fields. Errors exact {error, reason}.
// Add a case id to XFAIL to mark a known failure (it.fails); run with KAT_STRICT=1 to see every failure plainly.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import FITCalcEco from '../../lib/sims/families/ecosystems.calc.js'

const kat = JSON.parse(readFileSync('tests/fixtures/kat/families/ecosystems.json', 'utf8'))
const REL = kat.tolerance.rel, ABS0 = kat.tolerance.abs_when_expected_zero

function close(got, exp, path, depth = 0) {
  if (typeof exp === 'number') {
    expect(typeof got, `${path} type (got ${JSON.stringify(got)})`).toBe('number')
    expect(Number.isFinite(got), `${path} finite`).toBe(true)
    if (exp === 0) expect(Math.abs(got), path).toBeLessThanOrEqual(ABS0)
    else expect(Math.abs(got - exp) / Math.abs(exp), `${path}: got ${got}, want ${exp}`).toBeLessThanOrEqual(REL)
  } else if (Array.isArray(exp)) {
    expect(Array.isArray(got), `${path} array (got ${JSON.stringify(got)})`).toBe(true); expect(got.length, `${path} length`).toBe(exp.length)
    exp.forEach((e, k) => close(got[k], e, `${path}[${k}]`, depth + 1))
  } else if (exp && typeof exp === 'object') {
    if ('error' in exp) expect(got, path).toEqual(exp) // errors exact: {error, reason}
    else {
      expect(got && typeof got === 'object' && !Array.isArray(got), `${path} object (got ${JSON.stringify(got)})`).toBe(true)
      if (depth > 0) expect(Object.keys(got), `${path} keys`).toEqual(Object.keys(exp)) // name-keyed: exact keys, in order
      for (const k of Object.keys(exp)) close(got?.[k], exp[k], `${path}.${k}`, depth + 1)
    }
  } else expect(got, path).toEqual(exp)
}

function embedded(id) {
  const html = readFileSync(`content/sims/html/${id}.html`, 'utf8')
  const m = html.match(/\/\* FIT-CALC-BEGIN ecosystems \*\/[\s\S]*?\/\* FIT-CALC-END ecosystems \*\//)
  return m && new Function(`${m[0]}\nreturn FITCalcEco;`)()
}

export const XFAIL = {}
const STRICT = process.env.KAT_STRICT === '1'
const GAMES = ['ecosystems-p', 'ecosystems-s', 'ecosystems-jc', 'ecosystems-poly', 'ecosystems-u']
const sources = [['module', FITCalcEco], ...GAMES.map(id => [id, embedded(id)])]
const moduleBlock = readFileSync('lib/sims/families/ecosystems.calc.js', 'utf8').match(/\/\* FIT-CALC-BEGIN ecosystems \*\/[\s\S]*?\/\* FIT-CALC-END ecosystems \*\//)[0]

describe('ecosystems embedded FIT-CALC blocks', () => {
  for (const id of GAMES) it(`${id} has exactly one block, byte-identical to the module`, () => {
    const blocks = readFileSync(`content/sims/html/${id}.html`, 'utf8').match(/\/\* FIT-CALC-BEGIN ecosystems \*\/[\s\S]*?\/\* FIT-CALC-END ecosystems \*\//g) || []
    expect(blocks.length).toBe(1); expect(blocks[0] === moduleBlock).toBe(true)
  })
})

for (const [name, C] of sources) {
  describe(`FITCalcEco (${name}) vs ecosystems.json`, () => {
    it('has 53 cases, API v1 and a function for every op', () => {
      expect(C, 'embedded FIT-CALC block').toBeTruthy()
      expect(kat.cases.length).toBe(53); expect(C.API_VERSION).toBe(1)
      for (const c of kat.cases) expect(typeof C[c.op], c.op).toBe('function')
    })
    for (const c of kat.cases) {
      const fn = () => close(C[c.op](c.input), c.expected, c.id)
      if (!STRICT && XFAIL[c.id]) it.fails(`${c.id} (xfail: ${XFAIL[c.id]})`, fn)
      else it(c.id, fn)
    }
  })
}
