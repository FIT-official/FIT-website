import { describe, it, expect } from 'vitest'
import groups from '@/content/designThinkingWorkshop.json'
import { workshopArticleHtml } from '@/lib/blog/designThinkingWorkshop'
describe('approved v3 public idea provenance', () => {
    it('retains twenty ideas, excludes teacher notes and labels refinements as proposals', () => {
        expect(groups).toHaveLength(10)
        for (const group of groups) { expect(group.ideas).toHaveLength(2); for (const idea of group.ideas) { expect(idea.changes[0].change).toBe('Recommended refinement (proposal)'); expect(idea).not.toHaveProperty('sourceNote'); expect(idea).not.toHaveProperty('technicalReferences') } }
        expect(groups[0].ideas[1].originalSolution).toBe('A four-wheel bin with a peaked lid and a smaller wheeled companion.')
        expect(groups[1].ideas[1].reviewNotice).toMatch(/No replacement option has been chosen/)
        expect(groups[4].ideas[1].reviewNotice).toMatch(/No replacement option has been chosen/)
        expect(workshopArticleHtml()).not.toMatch(/monetary deposit|deposit scheme|sourceNote|technicalReferences/)
    })
})
