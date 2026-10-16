import { describe, expect, it } from 'vitest'
import { activities } from '../public/simulations/catalog'
import { emptyProgress, formatElapsed, GAME_CHALLENGES, GAME_LEVELS, normaliseProgress, progressKey, progressSummary, readProgress, readProgressState, recordAnswer, scoreAnswer, writeProgress } from '../lib/sims/game'

const challenges = GAME_CHALLENGES.sampling

describe('Concept checkpoints and practice scoring', () => {
  it('provides three valid, distinct checkpoints for every conceptual experiment', () => {
    expect(GAME_LEVELS).toHaveLength(3)
    for (const activity of activities.filter(item => item.kind !== 'game' && item.kind !== 'family')) {
      const items = GAME_CHALLENGES[activity.id]
      expect(items).toHaveLength(3)
      expect(new Set(items.map(item => item.id)).size).toBe(3)
      for (const item of items) {
        expect(item.choices[item.answer]).toBeTruthy()
        expect(item.explanation.length).toBeGreaterThan(40)
      }
    }
  })
  it('awards points for a correct concept answer and unlocks the next level', () => {
    const next = recordAnswer(emptyProgress(), challenges, challenges[0].id, challenges[0].answer)
    expect(progressSummary(next, challenges)).toEqual({ completed: 1, total: 3, points: 100, stars: 1, next: 1 })
  })
  it('preserves practice attempts, awards one star after a retry and cannot farm points', () => {
    let progress = recordAnswer(emptyProgress(), challenges, challenges[0].id, 1)
    expect(progressSummary(progress, challenges)).toMatchObject({ next: 0, points: 0, stars: 0 })
    progress = recordAnswer(progress, challenges, challenges[0].id, 0)
    expect(progressSummary(progress, challenges)).toMatchObject({ next: 1, points: 75, stars: 1 })
    expect(recordAnswer(progress, challenges, challenges[0].id, 0)).toEqual(progress)
  })
  it('rejects locked checkpoints, unknown questions and invalid answer indices', () => {
    const progress = emptyProgress()
    for (const [id, answer] of [[challenges[2].id, challenges[2].answer], ['unknown', 0], [challenges[0].id, -1], [challenges[0].id, 50], [challenges[0].id, NaN]]) {
      expect(recordAnswer(progress, challenges, id, answer)).toEqual(progress)
    }
  })
  it('completes the full sequence at 300 points without modifying earlier state', () => {
    const initial = emptyProgress()
    const final = challenges.reduce((progress, challenge) => recordAnswer(progress, challenges, challenge.id, challenge.answer), initial)
    expect(progressSummary(final, challenges)).toEqual({ completed: 3, total: 3, points: 300, stars: 3, next: 3 })
    expect(initial).toEqual(emptyProgress())
  })
  it('keeps later correct attempts positive and does not award invalid attempts', () => {
    expect([1, 2, 3, 40].map(scoreAnswer)).toEqual([100, 75, 50, 50])
    expect([0, -1, NaN, Infinity, 1.5].map(scoreAnswer)).toEqual([0, 0, 0, 0, 0])
  })
})

describe('Browser-only progress', () => {
  it('round-trips progress under an activity-specific key and recomputes points', () => {
    const data = new Map()
    const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) }
    const progress = recordAnswer(emptyProgress(), challenges, challenges[0].id, 0)
    expect(writeProgress(storage, 'sampling', progress)).toBe(true)
    expect([...data.keys()]).toEqual([progressKey('sampling')])
    expect(readProgress(storage, 'sampling', challenges)).toEqual(progress)
    expect(readProgress(storage, 'feedback', challenges)).toEqual(emptyProgress())
    progress.challenges.alias.points = 999999
    expect(normaliseProgress(progress, challenges).challenges.alias.points).toBe(100)
  })
  it('recovers from absent, malformed, old-version and inaccessible storage', () => {
    for (const raw of [null, '{', '[]', '{"version":99,"challenges":{}}', '{"version":1,"challenges":{"alias":{"attempts":-1,"completed":true}}}']) {
      expect(readProgress({ getItem: () => raw }, 'sampling', challenges)).toEqual(emptyProgress())
    }
    const denied = { getItem() { throw new Error('denied') }, setItem() { throw new Error('quota') } }
    expect(readProgress(denied, 'sampling', challenges)).toEqual(emptyProgress())
    expect(readProgressState(denied, 'sampling', challenges).available).toBe(false)
    expect(readProgressState({ getItem: () => '{' }, 'sampling', challenges).available).toBe(true)
    expect(writeProgress(denied, 'sampling', emptyProgress())).toBe(false)
  })
  it('does not import unknown checkpoint data into progress', () => {
    expect(normaliseProgress({ version: 1, challenges: { unknown: { attempts: 1, completed: true } } }, challenges)).toEqual(emptyProgress())
  })
  it('formats an optional elapsed timer without influencing scores', () => {
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(125.9)).toBe('02:05')
    expect(formatElapsed(-3)).toBe('00:00')
    expect(formatElapsed(NaN)).toBe('00:00')
  })
})
