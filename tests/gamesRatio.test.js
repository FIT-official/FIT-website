import { describe, expect, it } from 'vitest'
import sweets, * as sweetLogic from '../public/simulations/games/ratio-sweets-share.js'
import paint, * as paintLogic from '../public/simulations/games/ratio-paint-mix.js'
import { scoreAnswer } from '../public/simulations/games/shared.js'

describe.each([['Sweet Share', sweets], ['Paint Lab', paint]])('%s ratio challenges', (name, game) => {
  it('generates deterministic, solvable whole-number challenges for every level', () => {
    for (const seed of [0, 1, 57, 4567, 'class-a', 'class-b']) {
      for (let level = 1; level <= 6; level += 1) {
        const challenge = game.generateLevel(seed, level)
        expect(challenge).toEqual(game.generateLevel(seed, level))
        expect(challenge.level).toBe(level)
        expect(challenge.total).toBeGreaterThan(0)
        expect(challenge.total).toBeLessThanOrEqual(48)
        expect(challenge.ratio.every(part => Number.isInteger(part) && part > 0)).toBe(true)
        expect(game.checkAnswer(challenge, game.initialAnswer(challenge))).toBe(false)
        const solved = game.solution(challenge)
        expect(solved.counts.every(count => Number.isInteger(count) && count > 0)).toBe(true)
        expect(solved.counts.reduce((sum, count) => sum + count, 0)).toBe(challenge.total)
        expect(game.checkAnswer(challenge, solved)).toBe(true)
        expect(game.explain(challenge, solved)).toMatch(/ratio/i)
      }
    }
  })
  it('rejects empty, malformed, fractional, negative and non-finite allocations', () => {
    const challenge = game.generateLevel(17, 2)
    for (const answer of [null, {}, { counts: null }, { counts: [] }, { counts: [1] }, { counts: [1, 2, 3] }, { counts: [-1, challenge.total + 1] }, { counts: [NaN, 2] }, { counts: [Infinity, 2] }, { counts: ['1', 2] }, { counts: [0.5, challenge.total - 0.5] }]) {
      expect(game.checkAnswer(challenge, answer)).toBe(false)
    }
  })
  it('requires both correct proportions and the requested total', () => {
    const challenge = game.generateLevel(17, 3)
    const solved = game.solution(challenge)
    expect(game.checkAnswer(challenge, { counts: solved.counts.map(count => count * 2) })).toBe(false)
    const changed = [...solved.counts]
    changed[0] += 1
    changed[1] -= 1
    expect(game.checkAnswer(challenge, { counts: changed })).toBe(false)
    expect(game.checkAnswer(challenge, { counts: solved.counts.map(() => 0) })).toBe(false)
  })
  it('creates fresh answer and challenge arrays and preserves pure inputs', () => {
    const challenge = game.generateLevel(29, 5)
    const before = JSON.stringify(challenge)
    const answer = game.solution(challenge)
    const previous = JSON.stringify(answer)
    game.checkAnswer(challenge, answer)
    game.explain(challenge, answer)
    expect(JSON.stringify(challenge)).toBe(before)
    expect(JSON.stringify(answer)).toBe(previous)
    const fresh = game.initialAnswer(challenge)
    fresh.counts[0] = 100
    expect(game.initialAnswer(challenge).counts[0]).toBe(0)
    challenge.ratio[0] = 100
    expect(game.generateLevel(29, 5).ratio[0]).not.toBe(100)
  })
  it('varies recipes across seeds while clamping unsupported levels', () => {
    const variants = new Set(Array.from({ length: 20 }, (_, seed) => JSON.stringify(game.generateLevel(seed, 3))))
    expect(variants.size).toBeGreaterThan(1)
    expect(game.generateLevel(1, -4).level).toBe(1)
    expect(game.generateLevel(1, 99).level).toBe(6)
    expect(game.generateLevel(1, NaN).level).toBe(1)
  })
})

describe('Sweet Share progression', () => {
  it('moves from two people to three, and scales the number of sweets', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      for (let level = 1; level <= 6; level += 1) {
        const challenge = sweetLogic.generateLevel(seed, level)
        expect(challenge.ratio).toHaveLength(level < 4 ? 2 : 3)
        expect(challenge.names).toHaveLength(challenge.ratio.length)
      }
      expect(sweetLogic.generateLevel(seed, 6).total).toBeGreaterThan(sweetLogic.generateLevel(seed, 1).total)
    }
  })
  it('checks a three-part ratio by equal part sizes, not equal jar counts', () => {
    const challenge = { ratio: [1, 2, 3], total: 18 }
    expect(sweetLogic.checkAnswer(challenge, { counts: [3, 6, 9] })).toBe(true)
    expect(sweetLogic.checkAnswer(challenge, { counts: [6, 6, 6] })).toBe(false)
    expect(sweetLogic.checkAnswer(challenge, { counts: [3, 9, 6] })).toBe(false)
  })
  it('rejects a missing middle jar even when the remaining amounts have the right ratio and total', () => {
    const counts = [4, 0, 8]
    delete counts[1]
    expect(sweetLogic.checkAnswer({ ratio: [1, 1, 2], total: 12 }, { counts })).toBe(false)
  })
})

describe('Paint Lab proportions and colour model', () => {
  it('requires an equivalent ratio scaled to the requested batch size', () => {
    const challenge = { ratio: [2, 3], total: 20 }
    expect(paintLogic.checkAnswer(challenge, { counts: [8, 12] })).toBe(true)
    expect(paintLogic.checkAnswer(challenge, { counts: [2, 3] })).toBe(false)
    expect(paintLogic.checkAnswer(challenge, { counts: [7, 13] })).toBe(false)
    for (let level = 3; level <= 6; level += 1) {
      const generated = paintLogic.generateLevel(8, level)
      expect(generated.total / generated.ratio.reduce((sum, part) => sum + part, 0)).toBeGreaterThanOrEqual(2)
    }
  })
  it('uses a weighted RGB average, so equivalent ratios have identical swatches', () => {
    const paints = [{ rgb: [240, 0, 120] }, { rgb: [0, 120, 240] }]
    expect(paintLogic.mixColour(paints, [1, 2])).toBe('rgb(80, 80, 200)')
    expect(paintLogic.mixColour(paints, [3, 6])).toBe(paintLogic.mixColour(paints, [1, 2]))
    expect(paintLogic.mixColour(paints, [0, 0])).toBe('#eef0f8')
    expect(paintLogic.explain(paintLogic.generateLevel(1, 4))).toMatch(/real pigments do not mix this way/)
  })
})

describe('Ratio game scoring', () => {
  it('awards 100, 75 and 50 points for first, second and later correct attempts', () => {
    expect([1, 2, 3, 20].map(scoreAnswer)).toEqual([100, 75, 50, 50])
  })
  it('does not award points for invalid attempt counts', () => {
    expect([0, -1, 1.5, NaN, Infinity, '1', null].map(scoreAnswer)).toEqual([0, 0, 0, 0, 0, 0, 0])
  })
})
