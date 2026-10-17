// Tier-1 X3 (mass balance / balance accounting): FITCalcX3 against kat_cases/tier1/balance_accounting.json
// (copied unchanged into tests/fixtures/kat/tier1/). Runs against the module AND the copy embedded in each game
// (between FIT-CALC-BEGIN/END), because the games use their own copies. KAT-named exports (mix_temperature,
// recycle, recovery_cascade, e_factor, carbon_accounting, biomass_yield, manufacturing_yield) are called directly;
// the adapter below only renames inputs/outputs for the other ops and does no maths.
// Add a case id to XFAIL to mark a known failure (it.fails); run with KAT_STRICT=1 to see every failure plainly.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import FITCalcX3 from '../../lib/sims/tier1/x3_mass_balance.calc.js'

const kat = JSON.parse(readFileSync('tests/fixtures/kat/tier1/balance_accounting.json', 'utf8'))
const REL = kat.tolerance.rel, ABS0 = kat.tolerance.abs_when_expected_zero
const pick = (r, map) => (r && r.error ? r : Object.fromEntries(Object.entries(map).map(([k, f]) => [k, r[f]])))

const adapters = C => ({
  mix_temperature: i => pick(C.mix_temperature(i), { T_out: 'T_out', m_out: 'm_total', residual: 'residual_kg_s' }),
  mix_concentration: i => pick(C.mixConcentrations({ streams: i.streams.map(s => ({ Q_m3_s: s.Q, C_mg_L: s.C })) }), { C_out: 'C_mg_L', Q_out: 'Q_m3_s' }),
  recycle: i => C.recycle(i),
  recycle_purge: i => {
    const r = C.recyclePurge({ F_mol_s: i.fresh, yInert: 0, conversionPerPass: i.single_pass_conversion, purgeFraction: i.purge_fraction })
    return r.error ? r : { reactor_feed: r.mixer.A_mol_s, recycle: r.recycle.A_mol_s, purge: r.purge.A_mol_s, converted: r.product.P_mol_s, overall_conversion: r.overallConversion }
  },
  recovery_cascade: i => C.recovery_cascade(i),
  atom_economy: i => pick(C.atomEconomy({ product: { M_g_mol: i.M_product, coeff: 1 }, reactants: i.reactants.map(r => ({ M_g_mol: r.M, coeff: r.coeff })) }), { atom_economy_pct: 'atomEconomy_pct' }),
  e_factor: i => pick(C.e_factor(i), { E_factor: 'eFactor' }),
  carbon_accounting: i => C.carbon_accounting(i),
  mfa_balance: i => pick(C.balanceLedger({ inputs: i.inputs, outputs: i.outputs, accumulation: 0 }), { stock_change: 'residual', inputs: 'totalIn', outputs: 'totalOut' }), // residual at zero declared accumulation = stock change
  biomass_yield: i => C.biomass_yield(i),
  manufacturing_yield: i => C.manufacturing_yield(i),
})

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
  const m = html.match(/\/\* FIT-CALC-BEGIN x3_mass_balance \*\/[\s\S]*?\/\* FIT-CALC-END x3_mass_balance \*\//)
  return m && new Function(`${m[0]}\nreturn FITCalcX3;`)()
}

export const XFAIL = {}
const STRICT = process.env.KAT_STRICT === '1'
const sources = [['module', FITCalcX3], ...['x3-mass-balance-poly', 'x3-mass-balance-u1', 'x3-mass-balance-u2'].map(id => [id, embedded(id)])]

for (const [name, C] of sources) {
  describe(`FITCalcX3 (${name}) vs balance_accounting.json`, () => {
    it('has 22 cases, API v1 and an entry for every op', () => {
      expect(C, 'embedded FIT-CALC block').toBeTruthy()
      expect(kat.cases.length).toBe(22); expect(C.API_VERSION).toBe(1)
    })
    const A = C ? adapters(C) : {}
    for (const c of kat.cases) {
      const fn = () => close(A[c.op](c.input), c.expected, c.id)
      if (!STRICT && XFAIL[c.id]) it.fails(`${c.id} (xfail: ${XFAIL[c.id]})`, fn)
      else it(c.id, fn)
    }
  })
}
