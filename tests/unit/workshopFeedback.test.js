import { describe, it, expect } from 'vitest'
import { validateWorkshopFeedback } from '@/lib/workshopFeedback'
import { recordWorkshopFeedback } from '@/lib/workshopFeedbackStore'
const valid = () => ({ submissionId: '3460d8e9-6b20-4381-bda0-39c7b286544d', session: '2026-10-09', presentingGroup: 'g1', visitingGroup: 'g2', idea: '1', whatWorks: 'The wide base supports the model.', question: 'How is the axle held in place?', improvement: 'Add a removable axle retainer.' })
function fakeStores() {
    const rows = new Map(), counter = { count: 0 }
    return {
        rows,
        collection: { findOne: async q => rows.get(q._id), insertOne: async row => { if (rows.has(row._id)) throw Object.assign(Error('duplicate'), { code: 11000 }); rows.set(row._id, row) } },
        budgets: { updateOne: async (q, u) => { if (u.$inc) { if (counter.count >= 4000) return { modifiedCount: 0 }; counter.count++; } return { modifiedCount: 1 } } },
        counter,
    }
}
describe('private workshop feedback recording', () => {
    it('requires valid different group labels and exactly the approved fields', () => {
        expect(validateWorkshopFeedback(valid()).visitingGroup).toBe('g2')
        expect(() => validateWorkshopFeedback({ ...valid(), visitingGroup: 'g1' })).toThrow()
        expect(() => validateWorkshopFeedback({ ...valid(), name: 'Pupil name' })).toThrow()
    })
    it('rejects missing, excessive and contact/link content', () => {
        for (const question of ['', 'x'.repeat(601), 'person@example.com', 'https://private.invalid']) expect(() => validateWorkshopFeedback({ ...valid(), question })).toThrow()
    })
    it('stores one receipt for retried submissions, including concurrent duplicate clicks', async () => {
        const { collection, budgets, rows } = fakeStores(), p = validateWorkshopFeedback(valid()), now = new Date('2026-10-09T01:00:00Z')
        const [a, b] = await Promise.all([recordWorkshopFeedback(collection, budgets, p, now), recordWorkshopFeedback(collection, budgets, p, now)])
        expect(a).toEqual(b); expect(rows.size).toBe(1); expect(a.reviewState).toBe('awaiting review')
    })
    it('rejects reuse of a receipt with different content without altering the recorded row', async () => {
        const { collection, budgets, rows } = fakeStores(), p = validateWorkshopFeedback(valid()), now = new Date('2026-10-09T01:00:00Z')
        await recordWorkshopFeedback(collection, budgets, p, now)
        await expect(recordWorkshopFeedback(collection, budgets, { ...p, question: 'Different question' }, now)).rejects.toMatchObject({ status: 409 })
        expect(rows.get(p.submissionId).question).toBe(p.question)
    })
    it('never confirms a failed database insertion', async () => {
        const { collection, budgets } = fakeStores(); collection.insertOne = async () => { throw Error('Unavailable') }
        await expect(recordWorkshopFeedback(collection, budgets, validateWorkshopFeedback(valid()), new Date('2026-10-09T01:00:00Z'))).rejects.toThrow('Unavailable')
    })
    it('bounds event collection and closes new submissions after the workshop window', async () => {
        const { collection, budgets, counter } = fakeStores(); counter.count = 4000
        await expect(recordWorkshopFeedback(collection, budgets, validateWorkshopFeedback(valid()), new Date('2026-10-09T01:00:00Z'))).rejects.toMatchObject({ status: 429 })
        await expect(recordWorkshopFeedback(collection, budgets, validateWorkshopFeedback(valid()), new Date('2026-10-11T00:00:00Z'))).rejects.toMatchObject({ status: 410 })
    })
})
