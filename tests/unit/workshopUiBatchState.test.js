import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { assignedTarget, PROJECT_VERSION } from '@/lib/workshopReview'
import { newGuest, guestAccess } from '@/lib/workshopGuestIdentity'
import { emptyLesson, submitClassroom, moderateClassroom, classroomView, readLesson } from '@/lib/workshopGuestClassroomStore'
import { saveWorkshopDraft, draftId, draftTopics } from '@/lib/workshopGuestDraftStore'
const now = new Date('2026-10-09T02:00:00Z'), teacher = { role: 'teacher', userId: 'test-teacher' }
const guest = (group = 'g2') => guestAccess(newGuest(group, 'Test Student', now).record, now)
function store(initial) { const rows = new Map(initial ? [[initial._id, structuredClone(initial)]] : []); return { findOne: async q => structuredClone(rows.get(q._id) || null), insertOne: async row => { if (rows.has(row._id)) throw Object.assign(Error(), { code: 11000 }); rows.set(row._id, structuredClone(row)) }, replaceOne: async (q, row) => { if (rows.get(q._id)?.version !== q.version) return { modifiedCount: 0 }; rows.set(q._id, structuredClone(row)); return { modifiedCount: 1 } } } }
const lesson = () => ({ ...emptyLesson(), feedbackOpen: true, refinementOpen: true, showFeedback: true })
const feedback = (a, target = 'g3', overrides = {}) => ({ kind: 'feedback', submissionId: randomUUID(), session: '2026-10-09', phaseVersion: 0, reviewRound: 1, projectVersion: PROJECT_VERSION, presentingGroup: target, visitingGroup: a.group, idea: '1', whatWorks: 'Easy to hold.', question: 'Will it move?', improvement: 'Make the base wider.', ...overrides })
const refinement = () => ({ kind: 'refinement', promptVersion: 2, submissionId: randomUUID(), phaseVersion: 0, expectedVersion: 0, expectedEntryVersion: 0, ideas: [1, 2].map(() => ({ change: 'Widen the base.', reason: 'It should be steadier.', test: 'Try two cardboard bases.' })) })
describe('workshop pupil and teacher state batch', () => {
    it('covers all 90 assignments without self-review and rejects invalid rounds', () => {
        for (let group = 1; group <= 10; group++) { const targets = Array.from({ length: 9 }, (_, i) => assignedTarget('g' + group, i + 1)); expect(new Set(targets).size).toBe(9); expect(targets).not.toContain('g' + group) }
        expect(Array.from({ length: 9 }, (_, i) => assignedTarget('g1', i + 1))).toEqual(['g2','g3','g4','g5','g6','g7','g8','g9','g10']); expect(assignedTarget('g10', 9)).toBe('g9')
        for (const round of [0, 10, -1, 1.5, '1']) expect(assignedTarget('g1', round)).toBe(null)
        expect(assignedTarget('x1', 1)).toBe(null)
    })
    it('requires the assigned feedback first and keeps intentional submissions distinct from retries', async () => {
        const a = guest(), db = store(lesson()), first = feedback(a)
        await expect(submitClassroom(db, a, feedback(a, 'g4'), now)).rejects.toMatchObject({ status: 409 })
        const receipt = await submitClassroom(db, a, first, now); expect(await submitClassroom(db, a, first, now)).toEqual(receipt)
        await submitClassroom(db, a, feedback(a), now); await submitClassroom(db, a, feedback(a, 'g4'), now)
        const view = classroomView(await readLesson(db), a); expect(view.reviewCompletion).toEqual({ complete: true, extraCount: 1 }); expect(view.feedback).toHaveLength(0); expect((await readLesson(db)).feedback).toHaveLength(3)
    })
    it('keeps round-specific drafts independent and rejects own-group topics', async () => {
        const a = guest(), db = store(), write = (topic, text) => saveWorkshopDraft(db, a, { seat: a.seat, topic, requestId: randomUUID(), expectedVersion: 0, content: { idea: '1', whatWorks: text, question: '', improvement: '' } }, now)
        await write('feedback-g3-idea1', 'Round one'); await write('feedback-r2-g3-idea1', 'Round two')
        expect((await db.findOne({ _id: draftId(a.seat, 'feedback-g3-idea1') })).snapshots[0].content.whatWorks).toBe('Round one')
        expect((await db.findOne({ _id: draftId(a.seat, 'feedback-r2-g3-idea1') })).snapshots[0].content.whatWorks).toBe('Round two')
        expect(draftTopics('g2')).not.toContain('feedback-r2-g2-idea1'); await expect(write('feedback-r10-g3-idea1', 'No')).rejects.toMatchObject({ status: 400 })
    })
    it('changes rounds while open with CAS and rejects stale submissions without altering old work', async () => {
        const a = guest(), db = store(lesson()), old = feedback(a); await submitClassroom(db, a, old, now)
        await moderateClassroom(db, teacher, { action: 'phase', expectedVersion: 1, phase: 'PRESENT', feedbackOpen: true, refinementOpen: true, showFeedback: true, reviewRound: 9 }, now)
        const state = await readLesson(db); expect(classroomView(state, a).assignment.target).toBe('g1'); expect(classroomView(state, a).reviewCompletion.complete).toBe(false)
        await expect(submitClassroom(db, a, feedback(a), now)).rejects.toMatchObject({ status: 409 })
        await expect(moderateClassroom(db, teacher, { action: 'phase', expectedVersion: state.version, phase: 'PRESENT', feedbackOpen: true, refinementOpen: true, showFeedback: true, reviewRound: 10 }, now)).rejects.toMatchObject({ status: 400 })
        expect((await readLesson(db)).feedback[0].id).toBe(old.submissionId)
    })
    it('locks/unlocks/relocks with a new navigation version without changing write switches', async () => {
        const db = store(lesson()), a = guest()
        const set = async (target, locked) => moderateClassroom(db, teacher, { action: 'navigation', expectedVersion: (await readLesson(db)).version, target, locked }, now)
        await set('FEEDBACK', true); await set('REFINE', true); await set('REFINE', false); await set('REFINE', true)
        const state = await readLesson(db); expect(classroomView(state, a)).toMatchObject({ navigationLocked: true, navigationTarget: 'REFINE', navigationVersion: 4, feedbackOpen: true, refinementOpen: true })
        await expect(moderateClassroom(db, a, { action: 'navigation' }, now)).rejects.toMatchObject({ status: 403 })
        await expect(moderateClassroom(db, teacher, { action: 'navigation', expectedVersion: 0, target: 'REFINE', locked: false }, now)).rejects.toMatchObject({ status: 409 })
    })
    it('accepts three new refinement answers, retains older four-answer records and retries', async () => {
        const a = guest(), b = guest(), db = store(lesson()), p = refinement(); const receipt = await submitClassroom(db, a, p, now); expect(await submitClassroom(db, a, p, now)).toEqual(receipt)
        const old = { ...refinement(), promptVersion: undefined, ideas: refinement().ideas.map(idea => ({ ...idea, feedbackUsed: 'Earlier visitor advice.' })) }; await submitClassroom(db, b, old, now)
        const rows = (await readLesson(db)).refinements; expect(rows[0].promptVersion).toBe(2); expect(rows[0].ideas[0]).not.toHaveProperty('feedbackUsed'); expect(rows[1].ideas[0].feedbackUsed).toBe('Earlier visitor advice.')
    })
    it('moves only the selected author to Trash, preserves audit and restores previous visibility', async () => {
        const a = guest(), b = guest(), db = store(lesson()), pa = feedback(a), pb = feedback(b); await submitClassroom(db, a, pa, now); await submitClassroom(db, b, pb, now); await submitClassroom(db, a, refinement(), now)
        await moderateClassroom(db, teacher, { action: 'feedback', id: pa.submissionId, expectedEntryVersion: 1, visibility: 'hidden' }, now)
        const input = { action: 'trashAuthor', seat: a.seat, group: a.group, batchId: randomUUID(), expectedVersion: (await readLesson(db)).version }
        await expect(moderateClassroom(db, a, input, now)).rejects.toMatchObject({ status: 403 }); await moderateClassroom(db, teacher, input, now); await moderateClassroom(db, teacher, input, now)
        let state = await readLesson(db); expect(state.feedback.find(row => row.id === pb.submissionId).visibility).toBe('visible'); expect(classroomView(state, a).refinements).toHaveLength(0); expect(classroomView(state, a).reviewCompletion.complete).toBe(false); expect(state.audit.filter(row => row.action === 'trashAuthor')).toHaveLength(1)
        const restore = { action: 'restoreTrashBatch', batchId: input.batchId, expectedVersion: state.version }; await moderateClassroom(db, teacher, restore, now); await moderateClassroom(db, teacher, restore, now)
        state = await readLesson(db); expect(state.feedback.find(row => row.id === pa.submissionId).visibility).toBe('hidden'); expect(state.refinements[0].visibility).toBe('visible'); expect(state.audit.filter(row => row.action === 'restoreTrashBatch')).toHaveLength(1)
        await expect(moderateClassroom(db, teacher, { action: 'feedback', id: pa.submissionId, visibility: 'deleted', expectedEntryVersion: 1 }, now)).rejects.toMatchObject({ status: 409 })
    })
})
