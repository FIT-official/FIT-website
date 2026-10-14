import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { memoryDb } from '../groupCanvas/memory.mjs'
import { assignFeedbackIdea } from '@/lib/workshopFeedbackAssignment'
import { newGuest, guestAccess } from '@/lib/workshopGuestIdentity'
import { emptyLesson, submitClassroom, classroomView, moderateClassroom } from '@/lib/workshopGuestClassroomStore'
import { WORKSHOP_SESSION } from '@/lib/workshopFeedback'
import { PROJECT_VERSION } from '@/lib/workshopReview'
const now = new Date('2026-10-16T00:00:00Z'), guest = () => guestAccess(newGuest('g1', 'Synthetic reviewer', now).record, now)
const expected = access => ({ expectedSeat: access.seat, target: 'g2', round: 1, projectVersion: PROJECT_VERSION })
const feedback = (access, idea, target = 'g2') => ({ kind: 'feedback', submissionId: randomUUID(), session: WORKSHOP_SESSION, phaseVersion: 0, reviewRound: 1, projectVersion: PROJECT_VERSION, presentingGroup: target, visitingGroup: 'g1', idea, whatWorks: 'The handle is reachable.', question: 'How does the lid fit?', improvement: 'Label the handle.' })
async function fixture(extra = {}) { const store = memoryDb().collection('synthetic-lessons'); await store.insertOne({ ...emptyLesson(), feedbackOpen: true, ...extra }); return store }
describe('stable balanced feedback assignments', () => {
    it('allocates twenty concurrent reviewers evenly on a tie, with no duplicate or changing assignment', async () => {
        const store = await fixture(), actors = Array.from({ length: 20 }, guest)
        const choices = await Promise.all(actors.map(access => assignFeedbackIdea(store, access, expected(access), now)))
        expect(choices.filter(row => row.firstIdea === '1')).toHaveLength(10)
        expect(choices.filter(row => row.firstIdea === '2')).toHaveLength(10)
        for (const [index, access] of actors.entries()) expect(await assignFeedbackIdea(store, access, expected(access), now)).toEqual(choices[index])
        expect(JSON.stringify(choices)).not.toMatch(/Synthetic|reviewer|assignments|studentName/)
        expect((await store.findOne({ _id: WORKSHOP_SESSION })).version).toBe(0)
    })
    it('leads with the less-reviewed idea and counts distinct reviewers rather than duplicate comments', async () => {
        const old = Array.from({ length: 5 }, guest), rows = old.flatMap(access => [{ ...feedback(access, '1'), seat: access.seat, visibility: 'visible' }, { ...feedback(access, '1'), seat: access.seat, visibility: 'visible' }]), store = await fixture({ feedback: rows })
        const choices = await Promise.all(Array.from({ length: 5 }, guest).map(access => assignFeedbackIdea(store, access, expected(access), now)))
        expect(choices.every(row => row.firstIdea === '2')).toBe(true)
        const next = guest(); expect((await assignFeedbackIdea(store, next, expected(next), now)).firstIdea).toBe('1')
        expect((await store.findOne({ _id: WORKSHOP_SESSION })).feedback).toEqual(rows)
    })
    it('directs an existing reviewer to the unfinished idea without altering saved work', async () => {
        const access = guest(), store = await fixture(); await submitClassroom(store, access, feedback(access, '1'), now)
        const first = await assignFeedbackIdea(store, access, expected(access), now)
        expect(first).toMatchObject({ firstIdea: '2', completed: { 1: true, 2: false } })
        await submitClassroom(store, access, feedback(access, '2'), now)
        expect(await assignFeedbackIdea(store, access, expected(access), now)).toMatchObject({ firstIdea: '2', completed: { 1: true, 2: true } })
    })
    it('requires both ideas before another group, exposes only own completion, and reflects teacher moderation', async () => {
        const access = guest(), other = guest(), store = await fixture(), first = feedback(access, '1')
        await submitClassroom(store, access, first, now)
        await expect(submitClassroom(store, access, feedback(access, '1', 'g3'), now)).rejects.toMatchObject({ status: 409 })
        expect(classroomView(await store.findOne({ _id: WORKSHOP_SESSION }), access).reviewCompletion.complete).toBe(false)
        await submitClassroom(store, access, feedback(access, '2'), now)
        await submitClassroom(store, access, feedback(access, '1', 'g3'), now)
        const state = await store.findOne({ _id: WORKSHOP_SESSION })
        expect(classroomView(state, access).feedbackCompletion.g2).toEqual({ 1: true, 2: true })
        expect(classroomView(state, other).feedbackCompletion).toEqual({})
        await moderateClassroom(store, { role: 'teacher', userId: 'synthetic-teacher' }, { action: 'feedback', id: first.submissionId, expectedEntryVersion: 1, visibility: 'deleted' }, now)
        expect(classroomView(await store.findOne({ _id: WORKSHOP_SESSION }), access).reviewCompletion.complete).toBe(false)
    })
    it('rejects other seats and stale rounds/projects, keeping earlier allocation documents', async () => {
        const access = guest(), store = await fixture(); await assignFeedbackIdea(store, access, expected(access), now)
        for (const patch of [{ expectedSeat: 'other' }, { round: 2 }, { projectVersion: 'stale' }, { target: 'g3' }]) await expect(assignFeedbackIdea(store, access, { ...expected(access), ...patch }, now)).rejects.toMatchObject({ status: 409 })
        await expect(assignFeedbackIdea(store, { ...access, role: 'teacher' }, expected(access), now)).rejects.toMatchObject({ status: 403 })
        expect((await assignFeedbackIdea(store, access, expected(access), now)).firstIdea).toBe('1')
    })
})
