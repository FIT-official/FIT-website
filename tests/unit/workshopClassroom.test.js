import { describe, it, expect } from 'vitest'
import { emptyLesson, submitClassroom, moderateClassroom, classroomView, readLesson } from '@/lib/workshopClassroomStore'
import { passwordHash, passwordMatches, activeAccount, groupForSeat, parseClassToken, sessionHash } from '@/lib/workshopCredentials'
const now = new Date('2026-10-09T02:00:00Z'), teacher = { role: 'teacher', userId: 'synthetic-admin' }, student = { role: 'student', seat: 'group2student1', group: 'g2' }
const id = '3460d8e9-6b20-4381-bda0-39c7b286544d'
function store(initial = null) {
    let row = initial ? structuredClone(initial) : null
    return { findOne: async () => row ? structuredClone(row) : null, insertOne: async value => { if (row) throw Object.assign(Error(), { code: 11000 }); row = structuredClone(value) }, replaceOne: async (query, value) => { if (!row || row.version !== query.version) return { modifiedCount: 0 }; row = structuredClone(value); return { modifiedCount: 1 } } }
}
const feedback = () => ({ kind: 'feedback', submissionId: id, session: '2026-10-09', phaseVersion: 0, presentingGroup: 'g3', visitingGroup: 'g2', idea: '1', whatWorks: 'The base is wide.', question: 'How is the axle held?', improvement: 'Add an axle retainer.' })
const open = phase => ({ ...emptyLesson(), phase, feedbackOpen: phase === 'FEEDBACK', refinementOpen: phase === 'REFINE', showFeedback: true })
const refinement = () => ({ kind: 'refinement', submissionId: id, phaseVersion: 0, expectedVersion: 0, ideas: [0, 1].map(() => ({ feedbackUsed: 'Visitors asked about attachment.', change: 'Add a removable retainer.', reason: 'The axle stays located.', test: 'Roll it five times and inspect.' })) })
describe('server-authoritative classroom', () => {
    it('defaults to PRESENT with writes closed and never accepts direct closed-stage API writes', async () => {
        await expect(submitClassroom(store(), student, feedback(), now)).rejects.toMatchObject({ status: 409 })
        await expect(submitClassroom(store(open('FEEDBACK')), student, refinement(), now)).rejects.toMatchObject({ status: 409 })
    })
    it('confirms concurrent duplicate clicks once and retries an existing receipt after stage closure', async () => {
        const db = store(open('FEEDBACK')), payload = feedback()
        const [a, b] = await Promise.all([submitClassroom(db, student, payload, now), submitClassroom(db, student, payload, now)])
        expect(a).toEqual(b); expect((await readLesson(db)).feedback).toHaveLength(1)
        const state = await readLesson(db)
        await moderateClassroom(db, teacher, { action: 'phase', expectedVersion: state.version, phase: 'REFINE', feedbackOpen: false, refinementOpen: true, showFeedback: true }, now)
        expect(await submitClassroom(db, student, payload, now)).toEqual(a)
    })
    it('rejects a phase change during typing without recording stale new feedback', async () => {
        const db = store(open('FEEDBACK'))
        await moderateClassroom(db, teacher, { action: 'phase', expectedVersion: 0, phase: 'FEEDBACK', feedbackOpen: true, refinementOpen: false, showFeedback: true }, now)
        await expect(submitClassroom(db, student, feedback(), now)).rejects.toMatchObject({ status: 409 })
        expect((await readLesson(db)).feedback).toHaveLength(0)
    })
    it('binds group and seat to server authentication and rejects self reviews', async () => {
        await expect(submitClassroom(store(open('FEEDBACK')), student, { ...feedback(), visitingGroup: 'g3' }, now)).rejects.toMatchObject({ status: 403 })
        await expect(submitClassroom(store(open('FEEDBACK')), { ...student, group: 'g1' }, feedback(), now)).rejects.toMatchObject({ status: 403 })
        await expect(submitClassroom(store(open('FEEDBACK')), student, { ...feedback(), presentingGroup: 'g2' }, now)).rejects.toMatchObject({ status: 400 })
    })
    it('preserves classmates contributions and rejects only the same authors stale device', async () => {
        const db = store(open('REFINE'))
        expect((await submitClassroom(db, student, refinement(), now)).version).toBe(1)
        await submitClassroom(db, { ...student, seat: 'group2student2' }, { ...refinement(), submissionId: '3460d8e9-6b20-4381-bda0-39c7b286544e' }, now)
        expect((await readLesson(db)).refinements).toHaveLength(2)
        await expect(submitClassroom(db, student, { ...refinement(), submissionId: '3460d8e9-6b20-4381-bda0-39c7b286544f' }, now)).rejects.toMatchObject({ status: 409 })
        expect((await readLesson(db)).refinements[0].ideas).toHaveLength(2)
        expect(classroomView(await readLesson(db), { ...student, group: 'g4' }).refinements).toHaveLength(0)
    })
    it('excludes hidden/blocked feedback, preserves attributed before/after moderation history and restores entries', async () => {
        const db = store(open('FEEDBACK')); await submitClassroom(db, student, feedback(), now)
        let state = await readLesson(db)
        await moderateClassroom(db, teacher, { action: 'feedback', expectedEntryVersion: state.feedback.find(row => row.id === id).version, id, visibility: 'hidden', edit: { whatWorks: 'Teacher clarified the base.', question: 'How is the axle held?', improvement: 'Add a retainer.' } }, now)
        state = await readLesson(db); expect(classroomView(state, { ...student, seat: 'group3student1', group: 'g3' }).feedback).toHaveLength(0); expect(classroomView(state, teacher).feedback).toHaveLength(1)
        expect(state.audit[0].actor).toBe('synthetic-admin'); expect(state.audit[0].before.whatWorks).toBe('The base is wide.')
        await moderateClassroom(db, teacher, { action: 'feedback', expectedEntryVersion: state.feedback.find(row => row.id === id).version, id, visibility: 'visible' }, now)
        expect(classroomView(await readLesson(db), { ...student, seat: 'group3student1', group: 'g3' }).feedback[0].whatWorks).toBe('Teacher clarified the base.')
        expect(await submitClassroom(db, student, feedback(), now)).toMatchObject({ receipt: id })
    })
    it('denies student moderation and stale teacher edits', async () => {
        await expect(moderateClassroom(store(), student, {}, now)).rejects.toMatchObject({ status: 403 })
        await expect(moderateClassroom(store({ ...emptyLesson(), version: 2 }), teacher, { action: 'phase', expectedVersion: 1 }, now)).rejects.toMatchObject({ status: 409 })
    })
    it('never returns private audit/hash information to students and can hide all class feedback', async () => {
        const db = store(open('FEEDBACK')); await submitClassroom(db, student, feedback(), now)
        const state = await readLesson(db), view = classroomView(state, { ...student, seat: 'group3student1', group: 'g3' })
        expect(view.audit).toBeUndefined(); expect(view.feedback[0].payloadHash).toBeUndefined(); expect(view.feedback[0].seat).toBeUndefined()
        expect(classroomView({ ...state, showFeedback: false }, student).feedback).toHaveLength(0)
    })
    it('never confirms failed database writes and rejects receipts reused for changed content', async () => {
        const db = store(open('FEEDBACK')); await submitClassroom(db, student, feedback(), now)
        await expect(submitClassroom(db, student, { ...feedback(), question: 'Changed question' }, now)).rejects.toMatchObject({ status: 409 })
        const broken = store(open('FEEDBACK')); broken.replaceOne = async () => { throw Error('Network unavailable') }
        // Force existing version to exercise replaceOne rather than first insert.
        await broken.insertOne({ ...open('FEEDBACK'), version: 1 }).catch(() => {})
        const broken2 = store({ ...open('FEEDBACK'), version: 1 }); broken2.replaceOne = broken.replaceOne
        await expect(submitClassroom(broken2, student, feedback(), now)).rejects.toThrow('Network unavailable')
    })
    it('allows an entry edit after forty unrelated student submissions without global-version starvation', async () => {
        const db = store(open('FEEDBACK')); await submitClassroom(db, student, feedback(), now)
        const originalVersion = (await readLesson(db)).feedback[0].version
        for (let i = 0; i < 40; i++) {
            const group = Math.floor(i / 4) + 1, seat = 'group' + group + 'student' + (i % 4 + 1)
            await submitClassroom(db, { role: 'student', group: 'g' + group, seat }, { ...feedback(), submissionId: id.slice(0, -2) + i.toString(16).padStart(2, '0'), visitingGroup: 'g' + group, presentingGroup: 'g' + (group % 10 + 1) }, now)
        }
        await moderateClassroom(db, teacher, { action: 'feedback', expectedEntryVersion: originalVersion, id, visibility: 'visible', edit: { whatWorks: 'Teacher typed buffer survives student activity.', question: 'How is the axle retained?', improvement: 'Add an axle retainer.' } }, now)
        const state = await readLesson(db)
        expect(state.feedback).toHaveLength(41); expect(state.feedback[0].whatWorks).toBe('Teacher typed buffer survives student activity.'); expect(state.audit.at(-1).actor).toBe('synthetic-admin')
    })
    it('conflicts on the same entry and supports explicit rebase without overwriting a typed edit', async () => {
        const db = store(open('FEEDBACK')); await submitClassroom(db, student, feedback(), now)
        const typed = { whatWorks: 'First teacher typed buffer.', question: 'How is the axle retained?', improvement: 'Add a retainer.' }
        await moderateClassroom(db, { ...teacher, userId: 'second-synthetic-admin' }, { action: 'feedback', expectedEntryVersion: 1, id, visibility: 'visible', edit: { ...typed, whatWorks: 'Second teacher already saved.' } }, now)
        await expect(moderateClassroom(db, teacher, { action: 'feedback', expectedEntryVersion: 1, id, visibility: 'visible', edit: typed }, now)).rejects.toMatchObject({ status: 409 })
        expect((await readLesson(db)).feedback[0].whatWorks).toBe('Second teacher already saved.'); expect(typed.whatWorks).toBe('First teacher typed buffer.')
        await moderateClassroom(db, teacher, { action: 'feedback', expectedEntryVersion: 2, id, visibility: 'visible', edit: typed }, now)
        expect((await readLesson(db)).feedback[0].whatWorks).toBe(typed.whatWorks); expect((await readLesson(db)).audit).toHaveLength(2)
    })
})
describe('temporary anonymous seat credentials', () => {
    it('hashes synthetic passwords with salted scrypt, verifies correct input and never stores plaintext', () => {
        const hash = passwordHash('synthetic-fixture-only', '0'.repeat(32))
        expect(hash).not.toContain('synthetic-fixture-only'); expect(passwordMatches('synthetic-fixture-only', hash)).toBe(true); expect(passwordMatches('incorrect', hash)).toBe(false)
    })
    it('maps exactly forty seats and checks revocation, group binding and expiry', () => {
        const seats = Array.from({ length: 40 }, (_, i) => 'group' + (Math.floor(i / 4) + 1) + 'student' + (i % 4 + 1))
        expect(new Set(seats).size).toBe(40); expect(seats.every(s => groupForSeat(s))).toBe(true)
        const account = { _id: seats[0], group: 'g1', enabled: true, expiresAt: new Date('2026-10-11T00:00:00Z') }
        expect(activeAccount(account, now)).toBe(true); expect(activeAccount({ ...account, enabled: false }, now)).toBe(false); expect(activeAccount({ ...account, group: 'g2' }, now)).toBe(false)
        expect(activeAccount(account, new Date('2026-10-11T00:00:00Z'))).toBe(false)
    })
    it('parses only valid random session tokens and hashes them for database storage', () => {
        const token = 'a'.repeat(64)
        expect(parseClassToken(new Request('https://fixture.invalid', { headers: { cookie: 'fit_workshop=' + token } }))).toBe(token)
        expect(sessionHash(token)).not.toBe(token); expect(parseClassToken(new Request('https://fixture.invalid', { headers: { cookie: 'fit_workshop=invalid' } }))).toBeNull()
    })
})
