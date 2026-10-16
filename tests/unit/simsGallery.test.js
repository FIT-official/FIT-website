import { describe, expect, it } from 'vitest'
import { filterGallery, parseGalleryQuery, galleryQuery, topicKey, difficultyKey, simLevels } from '../../lib/sims/gallery'
const sims = [
  { id: 'ratio-sweets-share', level: 'Primary' }, { id: 'sampling', level: 'JC' }, { id: 'ratio-paint-mix', level: 'Primary', levels: ['Primary', 'Secondary'] },
  { id: 'forces-u', level: 'University', concept: 'forces', difficulty: 'Advanced' },
]
describe('gallery model', () => {
  it('derives topic, difficulty and levels', () => {
    expect(sims.map(topicKey)).toEqual(['ratio', 'waves', 'ratio', 'forces'])
    expect(sims.map(difficultyKey)).toEqual(['easy', 'hard', 'medium', 'hard'])
    expect(simLevels(sims[2])).toEqual(['primary', 'secondary'])
  })
  it('ORs within a row and ANDs across rows; empty rows apply no constraint', () => {
    expect(filterGallery(sims, {}).length).toBe(4)
    expect(filterGallery(sims, { level: ['secondary', 'uni'] }).map(s => s.id)).toEqual(['ratio-paint-mix', 'forces-u'])
    expect(filterGallery(sims, { level: ['primary'], difficulty: ['easy'] }).map(s => s.id)).toEqual(['ratio-sweets-share'])
    expect(filterGallery(sims, { topic: ['ratio'], difficulty: ['hard'] })).toEqual([])
  })
  it('round-trips the URL and drops unknown values', () => {
    const f = parseGalleryQuery('?level=primary,secondary,xx&topic=ratio&difficulty=easy&utm=1')
    expect(f).toEqual({ level: ['primary', 'secondary'], topic: ['ratio'], difficulty: ['easy'] })
    expect(galleryQuery(f)).toBe('?level=primary,secondary&topic=ratio&difficulty=easy')
    expect(galleryQuery({ level: [], topic: [], difficulty: [] })).toBe('')
  })
})
