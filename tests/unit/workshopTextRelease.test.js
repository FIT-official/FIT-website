import { describe, it, expect } from 'vitest'
import { workshopGroups, workshopGroupPage, assertWorkshopImagesReady, workshopIllustrationsPending } from '@/lib/workshopPages'
import { workshopArticleHtml } from '@/lib/blog/designThinkingWorkshop'
describe('workshop pending illustration release', () => {
    it('applies the pending illustration state to the complete blog guide as well', () => {
        const article = workshopArticleHtml()
        expect(article).not.toContain('/workshop/models/')
        expect(article).not.toContain('<img')
        expect(article.match(/Illustration pending review/g)).toHaveLength(20)
    })
    it('retains all original ideas while excluding superseded illustrations from every group', () => {
        expect(workshopIllustrationsPending).toBe(true)
        expect(assertWorkshopImagesReady()).toBe(true)
        expect(workshopGroups).toHaveLength(10)
        for (const item of workshopGroups) {
            const group = workshopGroupPage(item.id)
            expect(group.ideas).toHaveLength(2)
            expect(group.models).toEqual([null, null])
            for (const idea of group.ideas) {
                expect(idea.originalProblem.length).toBeGreaterThan(5)
                expect(idea.originalSolution.length).toBeGreaterThan(5)
            }
        }
    })
})
