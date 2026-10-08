import { describe, it, expect } from 'vitest'
import { workshopGroups, workshopGroupPage, assertWorkshopImagesReady, workshopIllustrationsPending } from '@/lib/workshopPages'
import { workshopArticleHtml } from '@/lib/blog/designThinkingWorkshop'
describe('workshop approved discussion illustration release', () => {
    it('renders all twenty approved illustrations in the complete blog guide', () => {
        const article = workshopArticleHtml()
        expect(article.match(/<img /g)).toHaveLength(20)
        expect(article).not.toContain('Illustration pending review')
        expect(article).not.toContain('nygh-printed-mechanism')
        for (const item of workshopGroups) for (const image of workshopGroupPage(item.id).models) expect(article).toContain(image.src)
    })
    it('retains all original ideas while excluding superseded illustrations from every group', () => {
        expect(workshopIllustrationsPending).toBe(false)
        expect(assertWorkshopImagesReady()).toBe(true)
        expect(workshopGroups).toHaveLength(10)
        for (const item of workshopGroups) {
            const group = workshopGroupPage(item.id)
            expect(group.ideas).toHaveLength(2)
            expect(group.models).toHaveLength(2)
            for (const image of group.models) {
                expect(image.approved).toBe(true)
                expect(image.src).toMatch(/^\/workshop\/models\/g\d{2}-idea[12]-reviewed-v2-pdf-derived\.jpeg$/)
                expect(image.caption.length).toBeGreaterThan(15)
                expect(image.sourcePdfSha256).toBe('de0272d6bdde164ec6c0f4490d2e2b5243f2c761a61ffdfa30d337f5659b8cc9')
            }
            for (const idea of group.ideas) {
                expect(idea.originalProblem.length).toBeGreaterThan(5)
                expect(idea.originalSolution.length).toBeGreaterThan(5)
            }
        }
    })
})
