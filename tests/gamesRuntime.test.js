import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, within } from '@testing-library/dom'
import sweets from '../public/simulations/games/ratio-sweets-share'
import paint from '../public/simulations/games/ratio-paint-mix'
import pizza from '../public/simulations/games/fractions-pizza-party'
import frog from '../public/simulations/games/fractions-number-line-jump'
import { createSession } from '../public/simulations/games/shared'
import { mountGame } from '../public/simulations/games/runtime'

afterEach(() => document.body.replaceChildren())

describe.each([sweets, paint, pizza, frog])('$title scoring and progression', game => {
  it('gates progression, preserves retry penalties on reset, and awards each challenge once', () => {
    const session = createSession(game, 'class-7')
    expect(session.next()).toBe(false)
    expect(session.check()).toEqual({ correct: false, awarded: 0 })
    session.resetAnswer()
    expect(session.attempts).toBe(1)
    session.setAnswer(game.solution(session.challenge))
    expect(session.check()).toEqual({ correct: true, awarded: 75 })
    session.setAnswer(game.initialAnswer(session.challenge))
    expect(game.checkAnswer(session.challenge, session.answer)).toBe(true)
    expect(session.check()).toEqual({ correct: true, awarded: 0 })
    expect(session.stars).toBe(1)
    for (let level = 2; level <= 6; level++) {
      expect(session.next()).toBe(true)
      expect(session.level).toBe(level)
      expect(session.solved).toBe(false)
      expect(session.attempts).toBe(0)
      session.setAnswer(game.solution(session.challenge))
      expect(session.check()).toEqual({ correct: true, awarded: 100 })
    }
    expect(session.points).toBe(575)
    expect(session.stars).toBe(6)
    expect(session.next()).toBe(false)
    expect(session.check().awarded).toBe(0)
  })
  it('applies the later-attempt floor without granting points for incorrect answers', () => {
    const session = createSession(game)
    for (let attempt = 0; attempt < 4; attempt++) expect(session.check().awarded).toBe(0)
    session.setAnswer(game.solution(session.challenge))
    expect(session.check()).toEqual({ correct: true, awarded: 50 })
    expect(session.points).toBe(50)
  })
})

it('renders retry/success, moves focus, completes six levels and replays a fresh score', () => {
  let boardApi
  const host = document.createElement('div')
  document.body.append(host)
  const game = { ...sweets, createBoard(_host, api) { boardApi = api; return { update() {}, destroy() {} } } }
  const mounted = mountGame(host, game)
  const ui = within(host)
  fireEvent.click(ui.getByRole('button', { name: /Check answer/ }))
  expect(ui.getByRole('status')).toHaveTextContent('Try another arrangement')
  fireEvent.click(ui.getByRole('button', { name: 'Start this challenge again' }))
  for (let level = 1; level <= 6; level++) {
    boardApi.setAnswer(game.solution(boardApi.challenge))
    fireEvent.click(ui.getByRole('button', { name: /Check answer/ }))
    expect(host.querySelector('main')).toHaveAttribute('data-state', 'success')
    expect(ui.queryByRole('button', { name: /Check answer/ })).toBeNull()
    if (level < 6) {
      const next = ui.getByRole('button', { name: /Next challenge/ })
      expect(next).toHaveFocus()
      fireEvent.click(next)
      expect(host.querySelector('#game-prompt')).toHaveFocus()
    }
  }
  expect(ui.getByText('575 points')).toBeVisible()
  expect(ui.getByLabelText('6 of 6 stars')).toBeVisible()
  expect(ui.getByRole('status')).toHaveTextContent('All six challenges complete!')
  fireEvent.click(ui.getByRole('button', { name: 'Play again' }))
  expect(ui.getByText('0 points')).toBeVisible()
  expect(ui.getByLabelText('0 of 6 stars')).toBeVisible()
  expect(host.querySelector('main')).toHaveAttribute('data-level', '1')
  mounted.destroy()
  expect(host).toBeEmptyDOMElement()
})
