import { describe, it, expect } from 'vitest'
import { emptyLesson, submitClassroom, moderateClassroom, classroomView, readLesson } from '@/lib/workshopClassroomStore'
const date = new Date('2026-10-09T02:00:00Z'), teacher = { role: 'teacher', userId: 'synthetic-admin' }, student = { role: 'student', seat: 'group2student1', group: 'g2' }
const id = '3460d8e9-6b20-4381-bda0-39c7b286544d'
const ideas = () => [0, 1].map(() => ({ feedbackUsed: 'TEST visitors asked about the joint.', change: 'TEST add a stop.', reason: 'TEST keep the joint aligned.', test: 'TEST compare five safe movements.' }))
function store(initial) { let row = structuredClone(initial); return { findOne: async () => structuredClone(row), replaceOne: async (q, next) => { if (q.version !== row.version) return { modifiedCount: 0 }; row = structuredClone(next); return { modifiedCount: 1 } } } }
const open = () => ({ ...emptyLesson(), version: 1, phase: 'REFINE', refinementOpen: true })
const payload = () => ({ kind: 'refinement', submissionId: id, phaseVersion: 0, expectedVersion: 0, expectedEntryVersion: 0, ideas: ideas() })
describe('teacher refinement moderation', () => {
    it('hides and restores exact content without deleting it, even with writes closed in PRESENT', async () => {
        const db = store(open()); await submitClassroom(db, student, payload(), date)
        await moderateClassroom(db, teacher, { action: 'phase', expectedVersion: (await readLesson(db)).version, phase: 'PRESENT', feedbackOpen: false, refinementOpen: false, showFeedback: false }, date)
        await moderateClassroom(db, teacher, { action: 'refinement', id, expectedEntryVersion: 1, visibility: 'hidden' }, date)
        const hidden = await readLesson(db), own = classroomView(hidden, student)
        expect(own.refinements).toEqual([]); expect(own.refinementVersion).toBe(1); expect(own.refinementEntryVersion).toBe(2)
        expect(JSON.stringify(own)).not.toContain('TEST visitors'); expect(classroomView(hidden, teacher).refinements).toHaveLength(1)
        expect(hidden.audit.at(-1)).toMatchObject({ actor: teacher.userId, action: 'refinement', before: { entryVersion: 1 }, after: { visibility: 'hidden', entryVersion: 2 } })
        await moderateClassroom(db, teacher, { action: 'refinement', id, expectedEntryVersion: 2, visibility: 'visible' }, date)
        expect(classroomView(await readLesson(db), student).refinements[0].ideas).toEqual(ideas().map((idea, i) => ({ ...idea, idea: String(i + 1) })))
    })
    it('keeps revision ordinal separate from per-entry edits and never changes the original retry receipt', async () => {
        const db = store(open()), original = payload(), firstReceipt = await submitClassroom(db, student, original, date), changed = ideas(); changed[0].change = 'TEST teacher clarified the stop.'
        await moderateClassroom(db, teacher, { action: 'refinement', id, expectedEntryVersion: 1, visibility: 'visible', edit: { ideas: changed } }, date)
        expect(await submitClassroom(db, student, original, date)).toEqual(firstReceipt)
        const row = (await readLesson(db)).refinements[0]; expect(row.version).toBe(1); expect(row.entryVersion).toBe(2); expect(row.ideas[0].change).toBe(changed[0].change)
        await expect(submitClassroom(db, student, { ...payload(), submissionId: id.replace(/d$/, 'e'), expectedVersion: 1, expectedEntryVersion: 1 }, date)).rejects.toMatchObject({ status: 409 })
        await submitClassroom(db, student, { ...payload(), submissionId: id.replace(/d$/, 'e'), expectedVersion: 1, expectedEntryVersion: 2 }, date)
        expect((await readLesson(db)).refinements.map(r => r.version)).toEqual([1, 2])
        await moderateClassroom(db, teacher, { action: 'refinement', id, expectedEntryVersion: 2, visibility: 'hidden' }, date)
        expect((await readLesson(db)).refinements.map(r => r.version)).toEqual([1, 2])
    })
    it('allows a new revision after hidden latest content using only safe counters', async () => {
        const db = store(open()); await submitClassroom(db, student, payload(), date)
        await moderateClassroom(db, teacher, { action: 'refinement', id, expectedEntryVersion: 1, visibility: 'blocked' }, date)
        const view = classroomView(await readLesson(db), student); expect(view.refinements).toEqual([])
        await submitClassroom(db, student, { ...payload(), submissionId: id.replace(/d$/, 'e'), expectedVersion: view.refinementVersion, expectedEntryVersion: view.refinementEntryVersion }, date)
        expect(classroomView(await readLesson(db), student).refinements.map(r => r.version)).toEqual([2])
        expect(classroomView(await readLesson(db), { ...student, group: 'g3', seat: 'group3student1' }).refinements).toEqual([])
    })
    it('uses per-entry CAS across unrelated writes, rejects stale same-entry edits and supports explicit rebase', async () => {
        const db = store(open()); await submitClassroom(db, student, payload(), date)
        await moderateClassroom(db, teacher, { action: 'phase', expectedVersion: (await readLesson(db)).version, phase: 'FEEDBACK', feedbackOpen: true, refinementOpen: false, showFeedback: true }, date)
        const state = await readLesson(db)
        for (let i = 0; i < 40; i++) { const n = Math.floor(i / 4) + 1; await submitClassroom(db, { role: 'student', seat: 'group' + n + 'student' + (i % 4 + 1), group: 'g' + n }, { kind: 'feedback', submissionId: '4460d8e9-6b20-4381-bda0-39c7b28654' + i.toString(16).padStart(2, '0'), session: '2026-10-09', phaseVersion: state.phaseVersion, presentingGroup: 'g' + (n % 10 + 1), visitingGroup: 'g' + n, idea: '1', whatWorks: 'TEST base.', question: 'TEST joint?', improvement: 'TEST stop.' }, date) }
        const typed = ideas(); typed[0].change = 'TEST preserved teacher buffer.'
        await moderateClassroom(db, teacher, { action: 'refinement', id, expectedEntryVersion: 1, visibility: 'visible', edit: { ideas: typed } }, date)
        await expect(moderateClassroom(db, teacher, { action: 'refinement', id, expectedEntryVersion: 1, visibility: 'hidden' }, date)).rejects.toMatchObject({ status: 409 })
        await moderateClassroom(db, teacher, { action: 'refinement', id, expectedEntryVersion: 2, visibility: 'hidden', edit: { ideas: typed } }, date)
        expect((await readLesson(db)).refinements[0].ideas[0].change).toBe(typed[0].change)
    })
    it('denies student moderation and invalid edits without changing audit/history', async () => {
        const db = store(open()); await submitClassroom(db, student, payload(), date)
        await expect(moderateClassroom(db, student, { action: 'refinement', id, expectedEntryVersion: 1, visibility: 'hidden' }, date)).rejects.toMatchObject({ status: 403 })
        await expect(moderateClassroom(db, teacher, { action: 'refinement', id, expectedEntryVersion: 1, visibility: 'visible', edit: { ideas: [{ ...ideas()[0], change: 'https://private.invalid' }, ideas()[1]] } }, date)).rejects.toMatchObject({ status: 400 })
        expect((await readLesson(db)).audit).toEqual([]); expect((await readLesson(db)).refinements[0].entryVersion).toBe(1)
    })
})
