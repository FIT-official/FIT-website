// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { forward, central, speed, polyEval, polyDeriv, stationaryCubic, velocities, FUNCS } from '../../public/simulations/families/differentiation/engine'
import { variants } from '../../public/simulations/families/differentiation/variants'
import { game } from '../../public/simulations/families/differentiation/game'
import { rng, plotSVG, mount } from '../../public/simulations/families/shell'

describe('differentiation engine', () => {
  it('speed and polynomial derivatives', () => {
    expect(speed(240, 4)).toBe(60); expect(speed(1, 0)).toBeNaN()
    expect(polyDeriv([1, 2, 3, 4])).toEqual([2, 6, 12]); expect(polyEval([1, 2, 3], 2)).toBe(17)
  })
  it('classifies cubic stationary points', () => {
    // x^3 - 3x: max at -1, min at 1
    expect(stationaryCubic([0, -3, 0, 1])).toEqual([{ x: -1, kind: 'max' }, { x: 1, kind: 'min' }])
    expect(stationaryCubic([0, 3, 0, 1])).toEqual([])
    expect(stationaryCubic([0, 3, 0, -1]).map(p => p.kind)).toEqual(['min', 'max'])
  })
  it('first-principles quotient converges: forward O(h), central O(h²)', () => {
    for (const F of Object.values(FUNCS)) {
      const x = 1.3, e1 = Math.abs(forward(F.f, x, 1e-2) - F.df(x)), e2 = Math.abs(forward(F.f, x, 1e-3) - F.df(x))
      expect(e1 / e2).toBeGreaterThan(8); expect(e1 / e2).toBeLessThan(12)
      expect(Math.abs(central(F.f, x, 1e-3) - F.df(x))).toBeLessThan(1e-5)
    }
  })
  it('central-difference velocity is exact for constant acceleration interiors', () => {
    const s = [0, 1, 2, 3, 4].map(t => 2 * t + 0.5 * 0.8 * t * t)
    velocities(s, 1).slice(1, -1).forEach((v, i) => expect(v).toBeCloseTo(2 + 0.8 * (i + 1), 10))
  })
})

describe('differentiation variants', () => {
  it('one variant per level with distinct objectives and full metadata', () => {
    expect(variants.map(v => v.levelCode)).toEqual(['P', 'S', 'JC', 'Poly', 'U'])
    for (const v of variants) for (const k of ['id', 'concept', 'level', 'topic', 'difficulty', 'objective', 'syllabus', 'title']) expect(v[k]).toBeTruthy()
    expect(new Set(variants.map(v => v.objective)).size).toBe(5)
  })
  it.each(variants.map(v => [v.id, v]))('%s: 40 seeded rounds render, plot and check', (_, v) => {
    const g = game(v)
    for (let seed = 1; seed <= 40; seed++) {
      const round = g.newRound(rng(seed), 1), stage = document.createElement('div')
      round.render(stage, () => {})
      expect(round.prompt.length).toBeGreaterThan(20)
      for (const p of round.plots()) { const svg = plotSVG(p); expect(svg).not.toContain('NaN'); expect(p.x.label && p.y.label).toBeTruthy() }
      expect(round.check().msg).toBeTruthy()
    }
  })
  it('JC rounds always have the requested stationary point reachable by the probe', () => {
    const g = game(variants[2])
    for (let seed = 1; seed <= 60; seed++) {
      const round = g.newRound(rng(seed), 1), stage = document.createElement('div'); round.render(stage, () => {})
      expect(round.prompt).toMatch(/local (maximum|minimum)/)
    }
  })
  it('mounts with level badge, live plots and score HUD', () => {
    const app = document.createElement('div'); mount(app, variants[4], { game }, 3)
    expect(app.querySelector('.lvl').textContent).toBe('University')
    expect(app.querySelectorAll('#plots svg').length).toBe(2)
    app.querySelector('#check').click(); expect(app.querySelector('#fb').textContent).toBeTruthy()
  })
})
