import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { assignedTarget, PROJECT_VERSION } from '@/lib/workshopReview'
import { emptyLesson, submitClassroom, moderateClassroom, classroomView } from '@/lib/workshopClassroomStore'
const now = new Date('2026-10-09T02:00:00Z'), teacher = { role: 'teacher', userId: 'test-admin' }
function store(initial) { let state = structuredClone(initial); return { findOne: async () => structuredClone(state), replaceOne: async (query, next) => { if (query.version !== state.version) return { modifiedCount: 0 }; state = structuredClone(next); return { modifiedCount: 1 } } } }
const access = n => ({ role: 'student', seat: 'group1student' + n, group: 'g1' })
const feedback = () => ({ kind: 'feedback', submissionId: randomUUID(), session: '2026-10-09', phaseVersion: 0, reviewRound: 1, projectVersion: PROJECT_VERSION, presentingGroup: 'g2', visitingGroup: 'g1', idea: '1', whatWorks: 'The wide base supports the model.', question: 'How is the hinge retained?', improvement: 'Compare a removable stop.' })
const refinement = () => ({ kind: 'refinement', submissionId: randomUUID(), phaseVersion: 0, expectedVersion: 0, expectedEntryVersion: 0, ideas: [1, 2].map(() => ({ feedbackUsed: 'The visitor asked about retention.', change: 'Add a stop.', reason: 'Keep the hinge aligned.', test: 'Compare five safe movements.' })) })
describe('individual additive round-robin classroom', () => {
    it('assigns each next group including ten to one, with optional two-ahead second round', () => { expect(Array.from({ length: 10 }, (_, i) => assignedTarget('g' + (i + 1)))).toEqual(['g2','g3','g4','g5','g6','g7','g8','g9','g10','g1']); expect(assignedTarget('g10', 2)).toBe('g2') })
    it('stores all five classmates feedback and both-idea refinement contributions at one barrier', async () => {
        const db = store({ ...emptyLesson(), version: 1, phase: 'FEEDBACK', feedbackOpen: true, showFeedback: true }), posts = Array.from({ length: 5 }, feedback)
        await Promise.all(posts.map((payload, i) => submitClassroom(db, access(i + 1), payload, now))); expect((await db.findOne()).feedback).toHaveLength(5)
        await moderateClassroom(db, teacher, { action: 'phase', expectedVersion: (await db.findOne()).version, phase: 'REFINE', feedbackOpen: false, refinementOpen: true, showFeedback: true }, now)
        const revisions = Array.from({ length: 5 }, refinement); revisions.forEach(row => { row.phaseVersion = 1 }); await Promise.all(revisions.map((payload, i) => submitClassroom(db, access(i + 1), payload, now)))
        const rows = (await db.findOne()).refinements; expect(rows).toHaveLength(5); expect(new Set(rows.map(row => row.seat)).size).toBe(5); expect(rows.every(row => row.authorVersion === 1 && row.ideas.length === 2)).toBe(true)
        const newRevision = { ...refinement(), phaseVersion: 1, expectedVersion: 1, expectedEntryVersion: 1 }; await submitClassroom(db, access(1), newRevision, now); expect((await db.findOne()).refinements).toHaveLength(6); expect((await db.findOne()).refinements.filter(row => row.seat === access(2).seat)).toHaveLength(1)
    })
    it('permits other peer targets, rejects stale project/round and reconciles the lost-response receipt after closure', async () => {
        const db = store({ ...emptyLesson(), version: 1, phase: 'FEEDBACK', feedbackOpen: true }), payload = feedback(), receipt = await submitClassroom(db, access(1), payload, now)
        expect(await submitClassroom(db, access(1), { ...feedback(), presentingGroup: 'g3' }, now)).toMatchObject({ confirmed: true })
        await expect(submitClassroom(db, access(1), { ...feedback(), projectVersion: 'stale' }, now)).rejects.toMatchObject({ status: 409 })
        await expect(submitClassroom(db, access(1), { ...feedback(), reviewRound: 2 }, now)).rejects.toMatchObject({ status: 409 })
        await moderateClassroom(db, teacher, { action: 'phase', expectedVersion: (await db.findOne()).version, phase: 'PRESENT', feedbackOpen: false, refinementOpen: false, showFeedback: false }, now)
        expect(await submitClassroom(db, access(1), payload, now)).toEqual(receipt); await expect(submitClassroom(db, access(1), { ...payload, question: 'changed' }, now)).rejects.toMatchObject({ status: 409 })
    })
    it('shows only own incoming visible feedback and rebuilds immediately after hide/edit/restore', async () => {
        const db = store({ ...emptyLesson(), version: 1, phase: 'FEEDBACK', feedbackOpen: true, showFeedback: true }), payload = feedback(); await submitClassroom(db, access(1), payload, now)
        const target = { role: 'student', seat: 'group2student1', group: 'g2' }; expect(classroomView(await db.findOne(), target).feedback).toHaveLength(1); expect(classroomView(await db.findOne(), access(1)).feedback).toEqual([])
        await moderateClassroom(db, teacher, { action: 'feedback', id: payload.submissionId, expectedEntryVersion: 1, visibility: 'hidden', edit: { whatWorks: 'Teacher clarified the support.', question: 'How is the hinge retained?', improvement: 'Compare a stop.' } }, now); expect(classroomView(await db.findOne(), target).feedback).toEqual([])
        await moderateClassroom(db, teacher, { action: 'feedback', id: payload.submissionId, expectedEntryVersion: 2, visibility: 'visible' }, now); const view = classroomView(await db.findOne(), target); expect(view.feedback[0].whatWorks).toBe('Teacher clarified the support.'); expect(JSON.stringify(view)).not.toContain('wide base'); expect(view.audit).toBeUndefined()
    })
    it('freezes a changed reading version until a teacher explicitly reconciles with feedback closed', async () => {
        const db = store({ ...emptyLesson(), version: 1, projectVersion: 'older-reading', phase: 'FEEDBACK', feedbackOpen: true }); await expect(submitClassroom(db, access(1), feedback(), now)).rejects.toMatchObject({ status: 409 }); await expect(moderateClassroom(db, teacher, { action: 'projectVersion', expectedVersion: 1 }, now)).rejects.toMatchObject({ status: 409 })
        await moderateClassroom(db, teacher, { action: 'phase', expectedVersion: 1, phase: 'PRESENT', feedbackOpen: false, refinementOpen: false, showFeedback: false }, now); await moderateClassroom(db, teacher, { action: 'projectVersion', expectedVersion: 2 }, now); expect((await db.findOne()).projectVersion).toBe(PROJECT_VERSION); expect((await db.findOne()).audit.at(-1).action).toBe('projectVersion')
    })
})
