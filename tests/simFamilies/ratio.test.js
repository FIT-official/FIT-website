// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { gcd, simplify, equivalent, unitRate, reaction, gears, powerLaw, fitPowerLaw } from '../../public/simulations/families/ratio/engine'
import { variants } from '../../public/simulations/families/ratio/variants'
import { game } from '../../public/simulations/families/ratio/game'
import { rng, plotSVG, mount } from '../../public/simulations/families/shell'

describe('ratio engine', () => {
  it('simplifies and compares ratios', () => {
    expect(gcd(12, 18)).toBe(6); expect(simplify(12, 18)).toEqual([2, 3])
    expect(equivalent(6, 9, 2, 3)).toBe(true); expect(equivalent(6, 8, 2, 3)).toBe(false)
    expect(unitRate(4, 10)).toBe(2.5); expect(unitRate(0, 1)).toBeNaN()
  })
  it('finds limiting reagent and conserves stoichiometry', () => {
    const rx = { a: 1, b: 3, c: 2 }
    expect(reaction(rx, 2, 6)).toMatchObject({ product: 4, limiting: 'none', leftA: 0, leftB: 0 })
    expect(reaction(rx, 2, 3).limiting).toBe('B'); expect(reaction(rx, 2, 3).product).toBe(2)
    expect(reaction(rx, 1, 9)).toMatchObject({ limiting: 'A', leftB: 6 })
  })
  it('gears trade speed for torque at constant power', () => {
    const g = gears(1200, 12, 36, 2)
    expect(g.ratio).toBe(3); expect(g.outRpm).toBe(400); expect(g.outTorque).toBe(6)
    expect(g.outRpm * g.outTorque).toBeCloseTo(1200 * 2)
  })
  it('recovers an exact power law', () => {
    const fit = fitPowerLaw([1, 2, 5, 10, 50].map(x => [x, powerLaw(3.4, 0.75, x)]))
    expect(fit.n).toBeCloseTo(0.75, 10); expect(fit.k).toBeCloseTo(3.4, 10)
  })
})

describe('ratio variants', () => {
  it('has one variant per level with full metadata', () => {
    expect(variants.map(v => v.levelCode)).toEqual(['P', 'S', 'JC', 'Poly', 'U'])
    for (const v of variants) for (const key of ['id', 'concept', 'level', 'topic', 'difficulty', 'objective', 'syllabus', 'title']) expect(v[key]).toBeTruthy()
    expect(new Set(variants.map(v => v.objective)).size).toBe(5)
  })
  it.each(variants.map(v => [v.id, v]))('%s: 40 seeded rounds render, plot and check without errors', (_, v) => {
    const g = game(v)
    for (let seed = 1; seed <= 40; seed++) {
      const round = g.newRound(rng(seed), 1), stage = document.createElement('div')
      round.render(stage, () => {})
      expect(round.prompt.length).toBeGreaterThan(20); expect(round.hint).toBeTruthy()
      for (const p of round.plots()) { const svg = plotSVG(p); expect(svg).toContain('<svg'); expect(svg).not.toContain('NaN'); expect(p.x.label && p.y.label).toBeTruthy() }
      const res = round.check(); expect(typeof res.ok).toBe('boolean'); expect(res.msg).toBeTruthy()
    }
  })
  it('mounts a playable game with a level badge and score HUD', () => {
    const app = document.createElement('div')
    mount(app, variants[0], { game }, 7)
    expect(app.querySelector('.lvl').textContent).toBe('Primary')
    expect(app.querySelector('#plots svg')).toBeTruthy()
    app.querySelector('#check').click()
    expect(app.querySelector('#fb').textContent).toBeTruthy()
  })
})
