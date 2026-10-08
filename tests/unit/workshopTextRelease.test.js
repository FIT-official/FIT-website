import { describe, it, expect } from 'vitest'
import { workshopGroups, workshopGroupPage, assertWorkshopImagesReady, workshopIllustrationsPending } from '@/lib/workshopPages'
describe('workshop pending illustration release', () => {
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
