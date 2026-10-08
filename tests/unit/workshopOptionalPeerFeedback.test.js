import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { emptyLesson, submitClassroom, moderateClassroom, classroomView } from '@/lib/workshopClassroomStore'
import { PROJECT_VERSION } from '@/lib/workshopReview'
import { saveWorkshopDraft } from '@/lib/workshopDraftStore'
const now = new Date('2026-10-09T02:00:00Z'), teacher = { role: 'teacher', userId: 'synthetic-teacher' }
const access = n => ({ role: 'student', seat: 'group' + n + 'student1', group: 'g' + n })
const payload = (n, target) => ({ kind: 'feedback', submissionId: randomUUID(), session: '2026-10-09', phaseVersion: 0, reviewRound: 1, projectVersion: PROJECT_VERSION, visitingGroup: 'g' + n, presentingGroup: 'g' + target, idea: '1', whatWorks: 'Works from group ' + n, question: 'Question from group ' + n, improvement: 'Suggestion from group ' + n })
function lessonStore() { let state = { ...emptyLesson(), version: 1, phase: 'FEEDBACK', feedbackOpen: true, showFeedback: true }; return { findOne: async () => structuredClone(state), replaceOne: async (query, next) => { if (query.version !== state.version) return { modifiedCount: 0 }; state = structuredClone(next); return { modifiedCount: 1 } } } }
describe('optional peer reviews preserve ownership and incoming scope', () => {
    it('allows every home group to review another valid non-assigned peer, but never itself', async () => {
        const db = lessonStore()
        for (let n = 1; n <= 10; n++) { const target = (n + 1) % 10 + 1, post = payload(n, target); expect(await submitClassroom(db, access(n), post, now)).toMatchObject({ receipt: post.submissionId }); await expect(submitClassroom(db, access(n), payload(n, n), now)).rejects.toMatchObject({ status: 400 }) }
        expect((await db.findOne()).feedback).toHaveLength(10)
    })
    it('preserves multiple optional reviews by one author and exactly reconciles duplicate receipts', async () => {
        const db = lessonStore(), posts = [2, 3, 4, 5].map(n => payload(1, n)), receipts = []
        for (const post of posts) receipts.push(await submitClassroom(db, access(1), post, now))
        for (let i = 0; i < posts.length; i++) expect(await submitClassroom(db, access(1), posts[i], now)).toEqual(receipts[i])
        expect((await db.findOne()).feedback.map(row => ({ id: row.id, seat: row.seat, target: row.presentingGroup }))).toEqual(posts.map(post => ({ id: post.submissionId, seat: access(1).seat, target: post.presentingGroup })))
        await expect(submitClassroom(db, access(1), { ...posts[0], presentingGroup: 'g3' }, now)).rejects.toMatchObject({ status: 409 })
    })
    it('accumulates all reviewers for the target and removes exactly hidden content from the incoming view', async () => {
        const db = lessonStore(), posts = [1, 2, 10].map(n => payload(n, 3)); for (let i = 0; i < posts.length; i++) await submitClassroom(db, access([1, 2, 10][i]), posts[i], now)
        let incoming = classroomView(await db.findOne(), access(3)).feedback
        expect(incoming.map(row => row.visitingGroup)).toEqual(['g1', 'g2', 'g10']); expect(incoming.map(row => row.seat)).toEqual(['group1student1', 'group2student1', 'group10student1']); expect(classroomView(await db.findOne(), access(4)).feedback).toEqual([])
        await moderateClassroom(db, teacher, { action: 'feedback', id: posts[0].submissionId, expectedEntryVersion: 1, visibility: 'hidden' }, now)
        incoming = classroomView(await db.findOne(), access(3)).feedback; expect(incoming.map(row => row.id)).toEqual(posts.slice(1).map(row => row.submissionId)); expect(incoming.map(row => row.whatWorks)).not.toContain('Works from group 1')
        await moderateClassroom(db, teacher, { action: 'feedback', id: posts[2].submissionId, expectedEntryVersion: 1, visibility: 'hidden' }, now)
        expect(classroomView(await db.findOne(), access(3)).feedback.map(row => row.visitingGroup)).toEqual(['g2'])
    })
    it('recovers independent per-target drafts and still rejects self-review topics', async () => {
        const docs = new Map(), store = { findOne: async query => structuredClone(docs.get(query._id)), insertOne: async value => docs.set(value._id, structuredClone(value)) }
        for (const target of [2, 3, 4, 5]) { const input = { seat: access(1).seat, topic: 'feedback-g' + target + '-idea1', expectedVersion: 0, requestId: randomUUID(), content: { idea: '1', whatWorks: 'Target ' + target, question: '', improvement: '' } }; expect(await saveWorkshopDraft(store, access(1), input, now)).toMatchObject({ version: 1 }) }
        expect([...docs.values()].map(row => row.snapshots[0].content.whatWorks)).toEqual(['Target 2', 'Target 3', 'Target 4', 'Target 5'])
        await expect(saveWorkshopDraft(store, access(1), { seat: access(1).seat, topic: 'feedback-g1-idea1', expectedVersion: 0, requestId: randomUUID(), content: { idea: '1', whatWorks: '', question: '', improvement: '' } }, now)).rejects.toMatchObject({ status: 400 })
    })
})
