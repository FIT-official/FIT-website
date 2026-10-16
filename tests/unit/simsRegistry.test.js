import { describe, expect, it } from 'vitest'
import { activities } from '../../public/simulations/catalog'
import { simsRegistry, SIMULATION_LEVELS, getLiveSims, getLiveSim, filterSimulations, getSimulationFilterOptions } from '../../lib/sims/registry'
import { createEmbedSnippet, getEmbedPath } from '../../lib/sims/embed'

describe('Simulation registry', () => {
  it('registers every original activity with a curriculum level and lesson context', () => {
    expect(simsRegistry.map(sim => sim.id)).toEqual(activities.map(activity => activity.id))
    expect(new Set(simsRegistry.map(sim => sim.id)).size).toBe(simsRegistry.length)
    for (const sim of simsRegistry) {
      expect(SIMULATION_LEVELS).toContain(sim.level)
      expect(['live', 'draft']).toContain(sim.status)
      for (const key of ['id', 'title', 'subject', 'topic', 'approach', 'activityPrompt']) expect(sim[key].trim()).not.toBe('')
      expect(sim).toHaveProperty('syllabusRef', '')
      const merged = getLiveSim(sim.id)
      expect(merged.model).toBe(activities.find(activity => activity.id === sim.id).model)
      expect(merged.difficulty).toBe(activities.find(activity => activity.id === sim.id).level)
    }
  })
  it('hides drafts and unresolved models from lookup, discovery and filter options', () => {
    const registry = [{ ...simsRegistry[0], status: 'draft', topic: 'Hidden topic' }, simsRegistry[1], { ...simsRegistry[2], id: 'not-built', topic: 'Missing model' }]
    expect(getLiveSims(registry).map(sim => sim.id)).toEqual(['feedback'])
    expect(getLiveSim('sampling', registry)).toBeNull()
    expect(getLiveSim('../sampling')).toBeNull()
    expect(filterSimulations({}, registry).map(sim => sim.id)).toEqual(['feedback'])
    expect(getSimulationFilterOptions(registry).topics).toEqual(['Feedback and control'])
  })
  it('combines words, related subjects, learning level and exact topic', () => {
    expect(filterSimulations({ query: '  ALIASING sensor ', subject: 'Computing', level: 'JC', topic: 'Waves and sampling' }).map(sim => sim.id)).toEqual(['sampling'])
    expect(filterSimulations({ subject: 'Physics', level: 'Secondary' }).map(sim => sim.id)).toEqual(['heat-path'])
    expect(filterSimulations({ query: 'sampling', topic: 'Heat transfer' })).toEqual([])
    expect(filterSimulations({ level: 'Primary' })).toEqual([])
    expect(filterSimulations({ query: '   ' })).toHaveLength(4)
  })
})

describe('Same-origin player snippet', () => {
  it('uses the minimal embed route, a safely escaped title and the supplied origin only', () => {
    const snippet = createEmbedSnippet('base-rates', 'https://fit.example/classes/simulations?student=private#secret')
    expect(snippet).toContain('src="https://fit.example/embed/sims/base-rates"')
    expect(snippet).toContain('title="FIT: Evidence &amp; Base Rates"')
    expect(snippet).toContain('loading="lazy"')
    expect(snippet).toContain('referrerpolicy="no-referrer"')
    expect(snippet).not.toMatch(/student|private|secret/)
    expect(getEmbedPath('sampling')).toBe('/embed/sims/sampling')
  })
  it('supports local review origins and rejects unknown models or unsafe URL schemes', () => {
    expect(createEmbedSnippet('sampling', 'http://127.0.0.1:3456')).toContain('http://127.0.0.1:3456/embed/sims/sampling')
    expect(getEmbedPath('draft')).toBeNull()
    expect(() => createEmbedSnippet('../account', 'https://fit.example')).toThrow('Unknown live simulation')
    expect(() => createEmbedSnippet('sampling', 'javascript:alert(1)')).toThrow()
    expect(() => createEmbedSnippet('sampling', 'https://name:password@fit.example')).toThrow()
  })
})
