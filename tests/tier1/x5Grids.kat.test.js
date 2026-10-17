// KAT harness for the Tier-1 X5 raster-grid calc module (ChatGPT fix1, verbatim).
// Cases: tests/fixtures/kat/tier1/raster_grid.json (copy of kat_cases/tier1/raster_grid.json, FIT Stock Strategy).
// This file only maps each KAT op onto the published FITCalcX5 API; it computes no answers and renames nothing.
// A KAT field the API does not return in the KAT's form counts as a failure. Cases in PENDING_FIX fail today
// (see FIX_REQUEST.md): they run as it.fails, so the suite stays green and an unexpected pass is flagged.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import FITCalcX5 from '../../lib/sims/tier1/x5_2d_grids.calc.js'

const kat = JSON.parse(readFileSync('tests/fixtures/kat/tier1/raster_grid.json', 'utf8'))
const REL = kat.tolerance.rel, ABS0 = kat.tolerance.abs_when_expected_zero
// Integer outputs are compared exactly (KAT tolerance note).
const EXACT = new Set(['T', 'count_on', 'binary', 'components', 'areas'])

const ops = ['convolve', 'threshold', 'otsu', 'segment', 'downsample', 'channel_mix', 'unmix']
const runWith = calc => c => calc[c.op](c.input)
const run = runWith(FITCalcX5)

function close(a, e, exact) {
  if (Array.isArray(e)) return Array.isArray(a) && a.length === e.length && e.every((x, i) => close(a[i], x, exact))
  if (typeof e !== 'number') return a === e
  if (typeof a !== 'number' || !Number.isFinite(a)) return false
  if (exact) return a === e
  return e === 0 ? Math.abs(a) <= ABS0 : Math.abs(a - e) <= REL * Math.abs(e)
}
function matches(actual, expected) {
  if (!actual || typeof actual !== 'object') return false
  if (Object.prototype.hasOwnProperty.call(expected, 'error'))
    return Object.keys(expected).every(k => actual[k] === expected[k]) && Object.keys(actual).length === Object.keys(expected).length
  if (actual.error) return false
  return Object.entries(expected).every(([k, e]) =>
    Object.prototype.hasOwnProperty.call(actual, k) && close(actual[k], e, EXACT.has(k)))
}

// Failing today, pending a ChatGPT fix (FIX_REQUEST.md). Remove ids as fixes land.
const PENDING_FIX = []

describe('Tier-1 X5 raster-grid calc module vs raster_grid.json KATs', () => {
  it('KAT file shape is as signed off (20 cases, every op in the API)', () => {
    expect(kat.cases).toHaveLength(20)
    for (const c of kat.cases) expect(ops).toContain(c.op)
    for (const op of ops) expect(typeof FITCalcX5[op]).toBe('function')
  })
  for (const c of kat.cases) {
    const t = PENDING_FIX.includes(c.id) ? it.fails : it
    t(`${c.id}: ${c.desc}`, () => {
      const actual = run(c)
      expect(matches(actual, c.expected), JSON.stringify({ actual, expected: c.expected })).toBe(true)
    })
  }
  it('never returns NaN or Infinity for any KAT input', () => {
    for (const c of kat.cases) {
      const s = JSON.stringify(run(c), (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? 'NONFINITE' : v))
      expect(s).not.toContain('NONFINITE')
    }
  })
})

describe('Tier-1 X5 games embed the module verbatim and each embed passes the KATs', () => {
  const BEGIN = '/* FIT-CALC-BEGIN x5_2d_grids */', END = '/* FIT-CALC-END x5_2d_grids */'
  const block = s => s.slice(s.indexOf(BEGIN), s.indexOf(END))
  const mod = block(readFileSync('lib/sims/tier1/x5_2d_grids.calc.js', 'utf8'))
  for (const id of ['x5-2d-grids-poly', 'x5-2d-grids-u1', 'x5-2d-grids-u2']) {
    const src = block(readFileSync(`content/sims/html/${id}.html`, 'utf8'))
    it(`${id} embeds the block byte-identical`, () => { expect(src).toBe(mod) })
    it(`${id} embedded engine passes all KATs`, () => {
      const calc = new Function(`${src}; return FITCalcX5;`)()
      for (const c of kat.cases) expect(matches(runWith(calc)(c), c.expected), c.id).toBe(true)
    })
  }
})
