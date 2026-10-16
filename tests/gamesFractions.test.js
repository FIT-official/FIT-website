import { describe, expect, it, vi } from 'vitest'
import pizza from '../public/simulations/games/fractions-pizza-party.js'
import frog from '../public/simulations/games/fractions-number-line-jump.js'
import { scoreAnswer } from '../public/simulations/games/shared.js'

describe.each([pizza, frog])('$title challenge generation', game => {
  it('reproduces all six levels from a seed and creates solvable varied challenges', () => {
    const variants = new Set()
    for (let seed = 0; seed < 32; seed += 1) {
      for (let level = 1; level <= 6; level += 1) {
        const challenge = game.generateLevel(seed, level)
        expect(game.generateLevel(seed, level)).toEqual(challenge)
        expect(challenge.level).toBe(level)
        expect(challenge.prompt.length).toBeGreaterThan(20)
        expect(game.checkAnswer(challenge, game.initialAnswer(challenge))).toBe(false)
        expect(game.checkAnswer(challenge, game.solution(challenge))).toBe(true)
        variants.add(JSON.stringify(challenge))
      }
    }
    expect(variants.size).toBeGreaterThan(30)
  })
  it('keeps generation within supported levels and does not mutate inputs', () => {
    expect(game.generateLevel('x', -4).level).toBe(1)
    expect(game.generateLevel('x', 50).level).toBe(6)
    const challenge = game.generateLevel('classroom', 4)
    const before = structuredClone(challenge)
    const answer = game.solution(challenge)
    const answerBefore = structuredClone(answer)
    game.checkAnswer(challenge, answer)
    game.explain(challenge, answer)
    expect(challenge).toEqual(before)
    expect(answer).toEqual(answerBefore)
  })
  it('rejects absent and malformed answers', () => {
    const challenge = game.generateLevel(15, 1)
    for (const answer of [null, undefined, {}, [], { cuts: 4, served: '1' }, { position: 1, landings: '1' }]) {
      expect(game.checkAnswer(challenge, answer)).toBe(false)
    }
  })
})

describe('Pizza fractions', () => {
  it('requires the requested equal partition and the correct fraction, in any slice order', () => {
    const challenge = { cutCount: 8, denominator: 4, targetNumerator: 3 }
    expect(pizza.checkAnswer(challenge, { cuts: 8, served: [7, 6, 4, 3, 1, 0] })).toBe(true)
    expect(pizza.checkAnswer(challenge, { cuts: 4, served: [0, 1, 2] })).toBe(false)
    expect(pizza.checkAnswer(challenge, { cuts: 8, served: [0, 1, 2] })).toBe(false)
  })
  it('rejects duplicated, out-of-range and non-integral slices', () => {
    const challenge = { cutCount: 4, denominator: 4, targetNumerator: 2 }
    for (const served of [[0, 0], [-1, 2], [0, 4], [0, 1.5], [0, NaN], ['0', 1], Array(2)]) {
      expect(pizza.checkAnswer(challenge, { cuts: 4, served })).toBe(false)
    }
    for (const cuts of [0, NaN, Infinity, -4, 4.5, '4']) {
      expect(pizza.checkAnswer(challenge, { cuts, served: [0, 1] })).toBe(false)
    }
  })
  it('scales numerator and denominator together for equivalent fractions', () => {
    for (const level of [3, 4]) {
      const challenge = pizza.generateLevel(42, level)
      const answer = pizza.solution(challenge)
      const scale = level === 3 ? 2 : 3
      expect(challenge.mode).toBe('equivalent')
      expect(answer.cuts).toBe(challenge.denominator * scale)
      expect(answer.served.length).toBe(challenge.targetNumerator * scale)
    }
  })
  it('adds like denominators without changing slice size or exceeding a whole', () => {
    for (const level of [5, 6]) {
      for (let seed = 0; seed < 16; seed += 1) {
        const challenge = pizza.generateLevel(seed, level)
        expect(challenge.mode).toBe('add')
        expect(challenge.terms).toHaveLength(2)
        expect(challenge.targetNumerator).toBe(challenge.terms[0] + challenge.terms[1])
        expect(challenge.targetNumerator).toBeLessThanOrEqual(challenge.denominator)
        expect(pizza.solution(challenge).served).toHaveLength(challenge.targetNumerator)
      }
    }
  })
})

describe('Number line fractions', () => {
  it('uses twice as many equal intervals to teach equivalent fractions', () => {
    const challenge = frog.generateLevel(41, 2)
    expect(challenge.tickDenominator).toBe(challenge.targets[0].denominator * 2)
    expect(challenge.expectedPositions[0]).toBe(challenge.targets[0].numerator * 2)
  })
  it('compares fractions by value rather than numerator or denominator alone', () => {
    for (let seed = 0; seed < 24; seed += 1) {
      const challenge = frog.generateLevel(seed, 3)
      const values = challenge.targets.map(fraction => fraction.numerator / fraction.denominator)
      const target = challenge.prompt.includes('smaller') ? Math.min(...values) : Math.max(...values)
      expect(challenge.expectedPositions[0] / challenge.tickDenominator).toBeCloseTo(target)
    }
  })
  it('requires every landing in ascending order, and rejects a reversed or incomplete journey', () => {
    const challenge = frog.generateLevel(42, 4)
    const answer = frog.solution(challenge)
    expect(answer.landings).toHaveLength(3)
    expect(answer.landings[0]).toBeLessThan(answer.landings[1])
    expect(answer.landings[1]).toBeLessThan(answer.landings[2])
    expect(frog.checkAnswer(challenge, { ...answer, landings: [...answer.landings].reverse() })).toBe(false)
    expect(frog.checkAnswer(challenge, { ...answer, landings: answer.landings.slice(1) })).toBe(false)
    expect(frog.checkAnswer(challenge, { ...answer, landings: [...answer.landings, answer.position] })).toBe(false)
  })
  it('extends beyond one whole for mixed numbers without exceeding two', () => {
    for (const level of [5, 6]) {
      const challenge = frog.generateLevel(63, level)
      expect(challenge.maxWhole).toBe(2)
      challenge.targets.forEach(fraction => {
        expect(fraction.numerator).toBeGreaterThan(fraction.denominator)
        expect(fraction.numerator).toBeLessThan(2 * fraction.denominator)
      })
      expect(frog.checkAnswer(challenge, frog.solution(challenge))).toBe(true)
    }
  })
  it('rejects invalid positions, fractional indices and unrecorded aims', () => {
    const challenge = frog.generateLevel(3, 1)
    const correct = frog.solution(challenge)
    for (const position of [-1, 50, NaN, Infinity, 0.5, '1']) {
      expect(frog.checkAnswer(challenge, { ...correct, position })).toBe(false)
    }
    expect(frog.checkAnswer(challenge, { position: correct.position, landings: [] })).toBe(false)
    expect(frog.checkAnswer(challenge, { ...correct, landings: [String(correct.position)] })).toBe(false)
    expect(frog.checkAnswer(challenge, { ...correct, landings: Array(1) })).toBe(false)
  })
})

describe('Fraction game controls', () => {
  function mount(game, level = 1) {
    const host = document.createElement('div')
    document.body.append(host)
    const challenge = game.generateLevel(12, level)
    let answer = game.initialAnswer(challenge)
    let solved = false
    let board
    const api = {
      get challenge() { return challenge }, get answer() { return answer }, get solved() { return solved },
      setAnswer(next) { if (!solved) { answer = next; board?.update() } },
    }
    const canvasSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    board = game.createBoard(host, api)
    const findButton = label => Array.from(host.querySelectorAll('button')).find(button => button.getAttribute('aria-label') === label)
    return {
      host, api, findButton,
      solve() { solved = true; board.update() },
      destroy() { board.destroy(); host.remove(); canvasSpy.mockRestore() },
    }
  }

  it('lets native slice controls cut, serve and return slices, and locks a completed plate', () => {
    const view = mount(pizza)
    try {
      view.findButton('Cut into 4 equal slices').click()
      view.findButton('Serve slice 2').click()
      expect(view.api.answer).toEqual({ cuts: 4, served: [1] })
      view.findButton('Return slice 2').click()
      expect(view.api.answer.served).toEqual([])
      view.findButton('Serve slice 1').click()
      view.findButton('Cut into 6 equal slices').click()
      expect(view.api.answer).toEqual({ cuts: 6, served: [] })
      view.solve()
      expect(Array.from(view.host.querySelectorAll('button')).every(button => button.disabled)).toBe(true)
    } finally { view.destroy() }
  })

  it('provides a reachable cut control for every seeded level, including ninths', () => {
    const view = mount(pizza)
    try {
      const generatedCounts = new Set()
      for (let seed = 0; seed < 32; seed += 1) {
        for (let level = 1; level <= 6; level += 1) {
          const challenge = pizza.generateLevel(seed, level)
          const control = view.findButton(`Cut into ${challenge.cutCount} equal slices`)
          expect(control).toBeDefined()
          control.click()
          expect(view.api.answer.cuts).toBe(challenge.cutCount)
          expect(view.api.answer.served).toEqual([])
          generatedCounts.add(challenge.cutCount)
        }
      }
      expect(generatedCounts.has(9)).toBe(true)
    } finally { view.destroy() }
  })

  it('records keyboard jumps and permits undo without silently treating an aim as a landing', () => {
    const view = mount(frog)
    try {
      const canvas = view.host.querySelector('canvas')
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
      expect(view.api.answer).toEqual({ position: 1, landings: [] })
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
      expect(view.api.answer).toEqual({ position: 1, landings: [1] })
      view.findButton('Undo the last recorded jump').click()
      expect(view.api.answer.landings).toEqual([])
      view.solve()
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
      expect(view.api.answer.position).toBe(1)
      expect(Array.from(view.host.querySelectorAll('button')).every(button => button.disabled)).toBe(true)
    } finally { view.destroy() }
  })

  it('caps an ordering journey at three jumps and enables correction with undo', () => {
    const view = mount(frog, 4)
    try {
      const jump = view.findButton('Jump to the aimed fraction')
      for (let index = 0; index < 3; index += 1) {
        view.findButton('Aim one step right').click()
        jump.click()
      }
      expect(view.api.answer.landings).toEqual([1, 2, 3])
      expect(jump.disabled).toBe(true)
      view.findButton('Undo the last recorded jump').click()
      expect(jump.disabled).toBe(false)
      view.findButton('Aim one step right').click()
      jump.click()
      expect(view.api.answer.landings).toEqual([1, 2, 4])
    } finally { view.destroy() }
  })
})

describe('Fraction challenge scoring', () => {
  it('awards 100, 75 and 50 points for correct answers on successive attempts', () => {
    for (const game of [pizza, frog]) {
      const challenge = game.generateLevel(71, 1)
      const correct = game.checkAnswer(challenge, game.solution(challenge))
      expect([1, 2, 3, 9].map(attempt => correct ? scoreAnswer(attempt) : 0)).toEqual([100, 75, 50, 50])
      expect(game.checkAnswer(challenge, game.initialAnswer(challenge)) ? scoreAnswer(1) : 0).toBe(0)
    }
  })
  it('does not award points for invalid attempt counts', () => {
    expect([0, -1, 1.5, NaN, Infinity].map(scoreAnswer)).toEqual([0, 0, 0, 0, 0])
  })
})
