import { describe, expect, it } from 'vitest'
import { getEmbedPath, createEmbedSnippet } from '../lib/sims/embed'

// Deliberately unmocked: uses the real registry, including the live HTML Hamming sim.
describe('compact player / snippet path for live HTML sims', () => {
  it('points the live Hamming HTML sim at the working same-origin compact route', () => {
    expect(getEmbedPath('hamming-code-jc')).toBe('/simulations/hamming-code-jc?embed=1')
  })
  it('snippet uses the same origin-only URL with no private query', () => {
    const html = createEmbedSnippet('hamming-code-jc', 'https://fit.example/some/path?token=secret')
    expect(html).toContain('src="https://fit.example/simulations/hamming-code-jc?embed=1"')
    expect(html).not.toMatch(/token|secret|\/embed\/sims\/hamming/)
  })
  it('keeps built-in players on /embed/sims and unknown ids null', () => {
    expect(getEmbedPath('sampling')).toBe('/embed/sims/sampling')
    expect(getEmbedPath('no-such-sim')).toBeNull()
    expect(() => createEmbedSnippet('no-such-sim', 'https://fit.example')).toThrow()
  })
})
