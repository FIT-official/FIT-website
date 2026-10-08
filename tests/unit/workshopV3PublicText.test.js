import { describe, it, expect } from 'vitest'
import groups from '@/content/designThinkingWorkshop.json'
import { workshopArticleHtml } from '@/lib/blog/designThinkingWorkshop'
describe('approved wording v2 and illustration registry v3', () => {
    it('retains twenty mapped ideas, source caveats and excludes teacher notes', () => {
        expect(groups).toHaveLength(10)
        for (const group of groups) { expect(group.ideas).toHaveLength(2); for (const [index, idea] of group.ideas.entries()) { expect(idea.pupilCopy).toMatchObject({ group: group.number, idea: index + 1 }); expect(idea.changes[0].why).toBe(idea.pupilCopy.source_caveat); expect(idea.pupilCopy.next_test.length).toBeGreaterThan(15); expect(idea).not.toHaveProperty('sourceNote'); expect(idea).not.toHaveProperty('technicalReferences') } }
        expect(groups[1].ideas[1].originalSolution).toContain('camera')
        expect(groups[3].ideas[0].originalSolution).toContain('soil probe and pump')
        expect(groups[5].ideas[1].boundary).toContain('dry model')
        expect(groups[9].ideas[0].originalSolution).toContain('volume')
        expect(workshopArticleHtml()).not.toMatch(/monetary deposit|deposit scheme|sourceNote|technicalReferences/)
    })
})
