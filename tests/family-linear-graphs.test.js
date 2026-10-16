// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { defs } from '../public/simulations/games/families/linear-graphs/variants.js'
import { makeGame, catalogEntry, registryEntry } from '../public/simulations/games/families/adapter.js'
import { plotSVG } from '../public/simulations/games/families/plot.js'
import { mountGame } from '../public/simulations/games/runtime.js'
import { LEVEL_COUNT } from '../public/simulations/games/shared.js'
import g0 from '../public/simulations/games/linear-plant-tracker.js'
import g1 from '../public/simulations/games/linear-ramp-rescue.js'
import g2 from '../public/simulations/games/linear-best-fit.js'
import g3 from '../public/simulations/games/linear-sensor-calibration.js'
import g4 from '../public/simulations/games/linear-systems-crossing.js'

const games = [g0, g1, g2, g3, g4]
const LEVELS = ['Primary', 'Secondary', 'JC', 'Poly', 'University']

describe('linear-graphs family', () => {
  it('covers every level once with distinct objectives and complete metadata', () => {
    const metas = Object.values(defs).map(d => d.meta)
    expect(metas.map(m => m.level).sort()).toEqual([...LEVELS].sort())
    expect(new Set(metas.map(m => m.objective)).size).toBe(metas.length)
    for (const d of Object.values(defs)) {
      for (const k of ['concept', 'level', 'topic', 'difficulty', 'objective', 'syllabus', 'subject']) expect(d.meta[k]).toBeTruthy()
      expect(catalogEntry(d).kind).toBe('game'); expect(registryEntry(d).status).toBe('draft')
    }
  })
  it.each(games.map(g => [g.id, g]))('%s: deterministic, solvable, rejects bad answers, plots cleanly', (_, game) => {
    for (const seed of [0, 1, 57, 'class-a', 'class-b']) for (let level = 1; level <= LEVEL_COUNT; level++) {
      const ch = game.generateLevel(seed, level)
      expect(JSON.stringify(ch)).toBe(JSON.stringify(game.generateLevel(seed, level)))
      expect(ch.prompt.length).toBeGreaterThan(15)
      const sol = game.solution(ch)
      expect(game.checkAnswer(ch, sol)).toBe(true)
      expect(game.explain(ch, sol)).toBeTruthy(); expect(game.hint(ch, game.initialAnswer(ch))).toBeTruthy()
      for (const bad of [null, {}, { ...sol, ...Object.fromEntries(Object.keys(sol).map(k => [k, typeof sol[k] === 'number' ? NaN : 'zzz'])) }]) expect(game.checkAnswer(ch, bad)).toBe(false)
      const def = defs[game.id]
      for (const c of def.controls(ch)) if (c.type !== 'chips') { expect(sol[c.key]).toBeGreaterThanOrEqual(c.min); expect(sol[c.key]).toBeLessThanOrEqual(c.max) }
      for (const ans of [game.initialAnswer(ch), sol]) for (const p of def.plots(ch, ans)) {
        const svg = plotSVG(p); expect(svg).not.toMatch(/NaN|Infinity|undefined/); expect(p.x.label && p.y.label).toBeTruthy()
      }
    }
  })
  it.each(games.map(g => [g.id, g]))('%s: mounts in the shared runtime and plays a level', (_, game) => {
    const host = document.createElement('div'); document.body.append(host)
    const app = mountGame(host, game, { model: defs[game.id].model })
    expect(host.querySelector('.fam-plots svg')).toBeTruthy()
    host.querySelector('.fam-db, .fam-chip').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); window.dispatchEvent(new Event('pointerup'))
    host.querySelector('[data-action="check"]').click()
    expect(host.querySelector('#game-feedback').textContent.length).toBeGreaterThan(0)
    app.destroy(); host.remove()
  })
})

import { readFileSync } from 'fs'
describe('linear graphs heading', () => {
  it('runtime uses each game\'s own eyebrow instead of the fractions default', () => {
    const rt = readFileSync('public/simulations/games/runtime.js', 'utf8')
    expect(rt).toMatch(/game\.eyebrow \|\|/)
  })
})
