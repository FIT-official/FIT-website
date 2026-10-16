// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { G, motion, inclineHold, moment, damped } from '../../public/simulations/families/forces/engine'
import { variants } from '../../public/simulations/families/forces/variants'
import { game } from '../../public/simulations/families/forces/game'
import { rng, mount } from '../../public/simulations/families/shell'

describe('forces engine', () => {
  it('applies friction and F = ma', () => {
    expect(motion(10, 2, 0).a).toBe(5)
    expect(motion(5, 2, 0.5).a).toBe(0) // static: 5 N < μmg = 9.8 N
    expect(motion(29.6, 2, 1).a).toBeCloseTo(5)
  })
  it('incline force reduces to weight components', () => {
    expect(inclineHold(10, 0, 0.2)).toBeCloseTo(0.2 * 10 * G)
    expect(inclineHold(10, 90, 0.2)).toBeCloseTo(10 * G)
  })
  it('moments sum and damping regimes', () => {
    expect(moment([[400, 2], [200, -4]])).toBeCloseTo(0)
    const d = damped(1, 20, 100); expect(d.cCrit).toBe(20); expect(d.regime).toBe('critical'); expect(d.x(0)).toBeCloseTo(1)
    expect(damped(1, 2, 100).regime).toBe('under'); expect(damped(1, 60, 100).regime).toBe('over')
    expect(Math.abs(damped(1, 20, 100).x(2))).toBeLessThan(1e-6)
  })
})

const solve = {
  P: (round) => { const pull = +round.prompt.match(/<em>(\d+) N/)[1]; round.state.push = pull },
  S: (round) => { const [m, mu, a] = [...round.prompt.matchAll(/<em>[^0-9]*([\d.]+)/g)].map(x => +x[1]); round.state.F = +(m * a + mu * m * G).toFixed(1) },
  JC: (round) => { const [m, deg, mu] = [...round.prompt.matchAll(/<em>([\d.]+)/g)].map(x => +x[1]); round.state.F = Math.round(inclineHold(m, deg, mu) * 2) / 2 },
  Poly: (round) => { const [load, dl, cw] = [...round.prompt.matchAll(/<em>([\d.]+)/g)].map(x => +x[1]); round.state.d = Math.round(load * dl / cw / 0.05) * 0.05 },
  U: (round) => { const [m, k] = [...round.prompt.matchAll(/= ([\d.]+)/g)].map(x => +x[1]); round.state.c = +(2 * Math.sqrt(k * m)).toFixed(1) },
}

describe('forces variants', () => {
  it('one variant per level with metadata and generic university tags', () => {
    expect(variants.map(v => v.levelCode)).toEqual(['P', 'S', 'JC', 'Poly', 'U'])
    for (const v of variants) expect(v.objective.length).toBeGreaterThan(30)
    expect(variants[4].syllabus).toBe('University, Mechanics')
  })
  it.each(variants.map(v => [v.levelCode, v]))('%s rounds start unsolved and are solvable on the dial grid', (code, v) => {
    const g = game(v), r = rng(11)
    for (let i = 0; i < 40; i++) {
      const round = g.newRound(r)
      expect(round.check().ok).toBe(false)
      for (const p of round.plots()) for (const s of p.series) expect(s.points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true)
      solve[code](round)
      expect(round.check().ok).toBe(true)
    }
  })
  it('mounts with live plots and dials', () => {
    const app = document.createElement('div'); mount(app, variants[1], { game }, 5)
    expect(app.querySelector('svg.plot')).toBeTruthy(); expect(app.querySelectorAll('.dial').length).toBeGreaterThan(0)
  })
})
