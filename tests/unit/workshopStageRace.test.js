import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { emptyLesson, submitClassroom, moderateClassroom } from '@/lib/workshopClassroomStore'
import { PROJECT_VERSION } from '@/lib/workshopReview'
const now = new Date('2026-10-09T02:00:00Z'), student = { role: 'student', seat: 'group1student1', group: 'g1' }, teacher = { role: 'teacher', userId: 'synthetic-admin' }
function controlledStore(initial) {
    let state = structuredClone(initial); const writes = [], listeners = []
    const notify = () => listeners.filter(row => writes.length >= row.count).forEach(row => row.resolve())
    return {
        writes, findOne: async () => structuredClone(state),
        replaceOne: (query, next) => new Promise(resolve => { writes.push({ query, next, resolve }); notify() }),
        waiting: count => writes.length >= count ? Promise.resolve() : new Promise(resolve => listeners.push({ count, resolve })),
        commit: index => { const row = writes[index], matched = row.query.version === state.version; if (matched) state = structuredClone(row.next); row.resolve({ modifiedCount: matched ? 1 : 0 }); return matched },
    }
}
const close = version => ({ action: 'phase', expectedVersion: version, phase: 'PRESENT', feedbackOpen: false, refinementOpen: false, showFeedback: false })
function payload(kind) { return kind === 'feedback' ? { kind, submissionId: randomUUID(), session: '2026-10-09', phaseVersion: 0, reviewRound: 1, projectVersion: PROJECT_VERSION, presentingGroup: 'g2', visitingGroup: 'g1', idea: '1', whatWorks: 'A wide base.', question: 'How is the axle held?', improvement: 'Compare a retainer.' } : { kind, submissionId: randomUUID(), phaseVersion: 0, expectedVersion: 0, expectedEntryVersion: 0, ideas: [1, 2].map(() => ({ feedbackUsed: 'A visitor asked about the axle.', change: 'Add a retainer.', reason: 'Keep the axle aligned.', test: 'Compare five movements.' })) } }
describe('barrier-controlled stage-close ordering', () => {
    for (const kind of ['feedback', 'refinement']) {
        const initial = () => ({ ...emptyLesson(), version: 1, phase: kind === 'feedback' ? 'FEEDBACK' : 'REFINE', feedbackOpen: kind === 'feedback', refinementOpen: kind === 'refinement' })
        it(kind + ': a close committed first rejects an already-read uncommitted submission', async () => {
            const db = controlledStore(initial()), post = payload(kind)
            const submission = submitClassroom(db, student, post, now), rejection = expect(submission).rejects.toMatchObject({ status: 409 })
            const closing = moderateClassroom(db, teacher, close(1), now)
            await db.waiting(2)
            const closeIndex = db.writes.findIndex(row => row.next.phase === 'PRESENT'), postIndex = 1 - closeIndex
            expect(db.commit(closeIndex)).toBe(true); await closing
            expect(db.commit(postIndex)).toBe(false); await rejection
            const state = await db.findOne(); expect(state.phase).toBe('PRESENT'); expect([...state.feedback, ...state.refinements]).toEqual([])
            await expect(submitClassroom(db, student, post, now)).rejects.toMatchObject({ status: 409 })
        })
        it(kind + ': a submission committed first survives a concurrent close and a lost-response retry', async () => {
            const db = controlledStore(initial()), post = payload(kind)
            const submission = submitClassroom(db, student, post, now)
            const closing = moderateClassroom(db, teacher, close(1), now), staleClose = expect(closing).rejects.toMatchObject({ status: 409 })
            await db.waiting(2)
            const closeIndex = db.writes.findIndex(row => row.next.phase === 'PRESENT'), postIndex = 1 - closeIndex
            expect(db.commit(postIndex)).toBe(true); const withheldReceipt = await submission
            expect(db.commit(closeIndex)).toBe(false); await staleClose
            const refreshedClose = moderateClassroom(db, teacher, close((await db.findOne()).version), now)
            await db.waiting(3); expect(db.commit(2)).toBe(true); await refreshedClose
            // The first receipt was withheld from the client. Its immutable ID is retried after closure.
            expect(await submitClassroom(db, student, post, now)).toEqual(withheldReceipt)
            const state = await db.findOne(), rows = [...state.feedback, ...state.refinements]
            expect(state.phase).toBe('PRESENT'); expect(rows.map(row => row.id)).toEqual([post.submissionId]); expect(rows[0].seat).toBe(student.seat)
            await expect(submitClassroom(db, student, { ...post, ...(kind === 'feedback' ? { question: 'Changed text.' } : { ideas: post.ideas.map(row => ({ ...row, change: 'Different change.' })) }) }, now)).rejects.toMatchObject({ status: 409 })
        })
    }
})
