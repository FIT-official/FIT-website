import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
const h = vi.hoisted(() => ({ rows: new Map(), touched: [], reads: [], admin: false, signedIn: false }))
vi.mock('@/lib/workshopDatabase', () => ({ workshopDatabase: async () => ({ collection(name) {
    if (!['workshopGuestSessions', 'workshopGuestLessons', 'workshopGuestRateLimits', 'workshopGuestDrafts'].includes(name)) throw Error('Guest attempted a legacy collection: ' + name)
    h.touched.push(name); if (!h.rows.has(name)) h.rows.set(name, new Map()); const rows = h.rows.get(name)
    const aggregate = pipeline => ({ toArray: async () => {
        h.reads.push({ name, pipeline })
        const row = rows.get(pipeline[0].$match._id)
        if (!row || row.enabled !== true || row.session !== '2026-10-09' || !(row.expiresAt instanceof Date) || row.expiresAt <= new Date() || !/^guest_[0-9a-f-]+$/i.test(row.seat) || !/^g(?:[1-9]|10)$/.test(row.group)) return []
        const state = h.rows.get('workshopGuestLessons')?.get('2026-10-09')
        return [{ ...structuredClone(row), lesson: state ? [structuredClone(state)] : [] }]
    } })
    return { collectionName: name, aggregate, findOne: async (q, options) => { h.reads.push({ name, q, options }); return rows.has(q._id) ? structuredClone(rows.get(q._id)) : null }, insertOne: async row => { if (rows.has(row._id)) throw Object.assign(Error(), { code: 11000 }); rows.set(row._id, structuredClone(row)) }, deleteOne: async q => ({ deletedCount: rows.delete(q._id) ? 1 : 0 }), updateOne: async (q, update) => { if (name === 'workshopGuestRateLimits') return { modifiedCount: 1 }; const row = rows.get(q._id); if (!row) return { modifiedCount: 0 }; Object.assign(row, update.$set); return { modifiedCount: 1 } }, replaceOne: async (q, row) => { if (rows.get(q._id)?.version !== q.version) return { modifiedCount: 0 }; rows.set(q._id, structuredClone(row)); return { modifiedCount: 1 } }, find: q => ({ limit: () => ({ toArray: async () => [...rows.values()].filter(row => q._id.$in.includes(row._id)).map(row => structuredClone(row)) }) }) }
} }) }))
vi.mock('@/lib/authenticate', () => { class UnauthorizedError extends Error { constructor() { super('Teacher sign-in required.'); this.status = 401 } } return { UnauthorizedError, authenticate: async () => { if (!h.signedIn) throw new UnauthorizedError(); return { userId: 'synthetic-teacher' } } } })
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: async () => h.admin }))
import { GET as sessionGET, POST as sessionPOST, DELETE as sessionDELETE } from '@/app/api/workshop/guest/session/route'
import { GET as classroomGET, POST as classroomPOST } from '@/app/api/workshop/guest/classroom/route'
import { GET as draftsGET, POST as draftsPOST } from '@/app/api/workshop/guest/drafts/route'
import { PATCH as teacherPATCH, GET as teacherGET } from '@/app/api/admin/workshop/guest/route'
import { GET as legacyGET } from '@/app/api/workshop/classroom/route'
import { emptyLesson } from '@/lib/workshopGuestClassroomStore'
const base = 'https://www.fixitoday.com'
function req(path, method = 'GET', body, cookie = '', origin = base) { return new Request(base + path, { method, headers: { origin, cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }) }
function lesson() { return h.rows.get('workshopGuestLessons').get('2026-10-09') }
async function join(name = 'Alex', group = 'g2') { const r = await sessionPOST(req('/api/workshop/guest/session', 'POST', { name, group })); expect(r.status).toBe(200); return { cookie: r.headers.get('set-cookie').split(';')[0], identity: await r.json() } }
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-09T02:00:00Z')); h.rows.clear(); h.touched = []; h.reads = []; h.admin = false; h.signedIn = false; h.rows.set('workshopGuestLessons', new Map([['2026-10-09', { ...emptyLesson(), entryOpen: true, version: 1 }]])) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
describe('guest routes never reveal legacy class data', () => {
    it.each([0, 1])('renews an original 24-hour cookie during classroom polling, since=%s', async since => {
        const a = await join(), rows = h.rows.get('workshopGuestSessions'), row = [...rows.values()][0]
        row.expiresAt = new Date('2026-10-10T02:00:00Z')
        const before = structuredClone(row)
        const response = await classroomGET(req('/api/workshop/guest/classroom?since=' + since + '&seat=' + a.identity.seat, 'GET', undefined, a.cookie))
        expect(response.status).toBe(since ? 304 : 200)
        expect(response.headers.get('set-cookie').split(';')[0]).toBe(a.cookie)
        expect(row).toEqual({ ...before, expiresAt: new Date('2026-11-30T15:59:00Z') })
        expect(rows.size).toBe(1)
    })
    it('renews through session status even if entry is closed, without opening any control', async () => {
        const a = await join(), row = [...h.rows.get('workshopGuestSessions').values()][0]
        row.expiresAt = new Date('2026-10-10T02:00:00Z'); lesson().entryOpen = false
        const before = structuredClone(lesson()), response = await sessionGET(req('/api/workshop/guest/session', 'GET', undefined, a.cookie))
        expect(await response.json()).toMatchObject({ seat: a.identity.seat, entryOpen: false, expiresAt: '2026-11-30T15:59:00.000Z' })
        expect(response.headers.get('set-cookie').split(';')[0]).toBe(a.cookie)
        expect(lesson()).toEqual(before)
    })
    it('keeps old-expiry drafts and existing responses readable by the original identity in November', async () => {
        const a = await join(), p = { seat: a.identity.seat, topic: 'feedback-g3-idea1', expectedVersion: 0, requestId: randomUUID(), content: { idea: '1', whatWorks: 'Existing text', question: '', improvement: '' } }
        expect((await draftsPOST(req('/api/workshop/guest/drafts?homeGroup=g2', 'POST', p, a.cookie))).status).toBe(200)
        for (const row of h.rows.get('workshopGuestDrafts').values()) row.expiresAt = new Date('2026-10-11T00:00:00Z')
        const saved = structuredClone([...h.rows.get('workshopGuestDrafts')])
        Object.assign(lesson(), { feedbackOpen: true, refinementOpen: true, showFeedback: true })
        const payload = { kind: 'feedback', expectedSeat: a.identity.seat, submissionId: randomUUID(), phaseVersion: 0, session: '2026-10-09', presentingGroup: 'g3', visitingGroup: 'g2', idea: '1', whatWorks: 'Existing response', question: 'How?', improvement: 'Add labels' }
        expect((await classroomPOST(req('/api/workshop/guest/classroom?homeGroup=g2', 'POST', payload, a.cookie))).status).toBe(200)
        vi.setSystemTime(new Date('2026-11-30T15:58:59Z'))
        const draft = await draftsGET(req('/api/workshop/guest/drafts?homeGroup=g2', 'GET', undefined, a.cookie)).then(r => r.json())
        expect(draft.drafts[0].snapshots.at(-1).content.whatWorks).toBe('Existing text')
        expect([...h.rows.get('workshopGuestDrafts')]).toEqual(saved)
        expect((await classroomPOST(req('/api/workshop/guest/classroom?homeGroup=g2', 'POST', payload, a.cookie))).status).toBe(200)
        expect(lesson().feedback).toHaveLength(1)
        expect((await classroomPOST(req('/api/workshop/guest/classroom?homeGroup=g2', 'POST', { ...payload, submissionId: randomUUID(), whatWorks: 'New November response' }, a.cookie))).status).toBe(200)
        expect((await draftsPOST(req('/api/workshop/guest/drafts?homeGroup=g2', 'POST', { ...p, expectedVersion: 1, requestId: randomUUID(), content: { ...p.content, whatWorks: 'November draft' } }, a.cookie))).status).toBe(200)
        const revision = { kind: 'refinement', promptVersion: 2, expectedSeat: a.identity.seat, submissionId: randomUUID(), phaseVersion: 0, expectedVersion: 0, expectedEntryVersion: 0, ideas: [1, 2].map(() => ({ change: 'Add a label', reason: 'Make the part clear', test: 'Ask a classmate' })) }
        expect((await classroomPOST(req('/api/workshop/guest/classroom?homeGroup=g2', 'POST', revision, a.cookie))).status).toBe(200)
        expect(lesson().refinements).toHaveLength(1)
        vi.setSystemTime(new Date('2026-11-30T15:59:00Z'))
        for (const handler of [classroomGET, draftsGET]) expect((await handler(req('/api/workshop/guest/classroom?homeGroup=g2', 'GET', undefined, a.cookie))).status).toBe(401)
    })
    it('reuses only the cookie-owned session for case/space variants and preserves its record and draft', async () => {
        const a = await join('Alex Tan'), b = await join('ALEX TAN')
        const draft = { seat: a.identity.seat, topic: 'feedback-g3-idea1', expectedVersion: 0, requestId: randomUUID(), content: { idea: '1', whatWorks: 'My saved work', question: '', improvement: '' } }
        expect((await draftsPOST(req('/api/workshop/guest/drafts?homeGroup=g2', 'POST', draft, a.cookie))).status).toBe(200)
        const before = structuredClone([...h.rows.get('workshopGuestSessions')]), beforeDrafts = structuredClone([...h.rows.get('workshopGuestDrafts')])
        vi.setSystemTime(new Date('2026-10-09T03:00:00Z')); h.reads = []
        const retry = await sessionPOST(req('/api/workshop/guest/session', 'POST', { name: '  aLEX   tAN  ', group: 'g2' }, a.cookie))
        expect(retry.status).toBe(200)
        expect(await retry.json()).toEqual({ ...a.identity, name: 'Alex Tan' })
        expect(retry.headers.get('set-cookie').split(';')[0]).toBe(a.cookie)
        expect(retry.headers.get('set-cookie')).toContain('Max-Age=' + Math.floor((new Date('2026-11-30T15:59:00Z') - new Date()) / 1000))
        expect([...h.rows.get('workshopGuestSessions')]).toEqual(before)
        expect([...h.rows.get('workshopGuestDrafts')]).toEqual(beforeDrafts)
        const reads = h.reads.filter(row => row.name === 'workshopGuestSessions')
        expect(reads).toHaveLength(1); expect(Object.keys(reads[0].q)).toEqual(['_id'])
        const own = await draftsGET(req('/api/workshop/guest/drafts?homeGroup=g2', 'GET', undefined, a.cookie)).then(r => r.json())
        const other = await draftsGET(req('/api/workshop/guest/drafts?homeGroup=g2', 'GET', undefined, b.cookie)).then(r => r.json())
        expect(own.drafts).toHaveLength(1); expect(other.drafts).toHaveLength(0)
    })
    it('keeps two Group 4 same-name browser sessions distinct when each changes capitalization', async () => {
        const a = await join('Kevin', 'g4'), b = await join('  KEVIN  ', 'g4')
        expect(a.identity.seat).not.toBe(b.identity.seat)
        for (const identity of [a, b]) {
            const retry = await sessionPOST(req('/api/workshop/guest/session', 'POST', { name: 'kevin', group: 'g4' }, identity.cookie))
            expect(retry.status).toBe(200); expect(await retry.json()).toEqual(identity.identity)
        }
        expect(h.rows.get('workshopGuestSessions').size).toBe(2)
    })
    it.each([{ name: 'ALEX', group: 'g3' }, { name: 'Alexandra', group: 'g2' }])('rejects a different identity despite a valid cookie: %j', async input => {
        const a = await join(), before = structuredClone([...h.rows.get('workshopGuestSessions')])
        expect((await sessionPOST(req('/api/workshop/guest/session', 'POST', input, a.cookie))).status).toBe(409)
        expect([...h.rows.get('workshopGuestSessions')]).toEqual(before)
    })
    it.each(['missing', 'unknown', 'revoked', 'expired'])('never recovers another same-name session from a %s cookie', async state => {
        const a = await join(), rows = h.rows.get('workshopGuestSessions'), old = [...rows.values()][0]
        let cookie = a.cookie
        if (state === 'missing') cookie = ''
        if (state === 'unknown') cookie = 'fit_workshop_guest=' + '0'.repeat(64)
        if (state === 'revoked') old.enabled = false
        if (state === 'expired') old.expiresAt = new Date('2026-10-09T01:59:59Z')
        const before = structuredClone(old)
        const retry = await sessionPOST(req('/api/workshop/guest/session', 'POST', { name: 'ALEX', group: 'g2' }, cookie))
        expect(retry.status).toBe(200); expect((await retry.json()).seat).not.toBe(a.identity.seat)
        expect(rows.get(old._id)).toEqual(before); expect(rows.size).toBe(2)
    })
    it('still requires open teacher entry for a case-insensitive session retry', async () => {
        const a = await join(); lesson().entryOpen = false
        expect((await sessionPOST(req('/api/workshop/guest/session', 'POST', { name: 'ALEX', group: 'g2' }, a.cookie))).status).toBe(403)
        expect(h.rows.get('workshopGuestSessions').size).toBe(1)
    })
    it('uses one fresh session/lesson command for changed and unchanged polls and rechecks revoked access', async () => {
        const a = await join()
        h.reads = []
        const changed = await classroomGET(req('/api/workshop/guest/classroom?since=0&seat=' + a.identity.seat, 'GET', undefined, a.cookie))
        expect(changed.status).toBe(200)
        const reads = h.reads
        expect(reads).toHaveLength(1)
        expect(reads[0].name).toBe('workshopGuestSessions')
        expect(reads[0].pipeline[2].$lookup.from).toBe('workshopGuestLessons')
        expect(changed.headers.get('server-timing')).toMatch(/snapshot;dur=\d+/)
        h.reads = []
        const unchanged = await classroomGET(req('/api/workshop/guest/classroom?since=1&seat=' + a.identity.seat, 'GET', undefined, a.cookie))
        expect(unchanged.status).toBe(304); expect(await unchanged.text()).toBe(''); expect(unchanged.headers.get('cache-control')).toBe('private, no-store'); expect(h.reads).toHaveLength(1)
        const wrongHint = await classroomGET(req('/api/workshop/guest/classroom?since=1&seat=someone-else', 'GET', undefined, a.cookie))
        expect(wrongHint.status).toBe(200); expect((await wrongHint.json()).seat).toBe(a.identity.seat)
        for (const row of h.rows.get('workshopGuestSessions').values()) row.enabled = false
        h.reads = []
        expect((await classroomGET(req('/api/workshop/guest/classroom?since=1&seat=' + a.identity.seat, 'GET', undefined, a.cookie))).status).toBe(401)
        expect(h.reads.filter(row => row.name === 'workshopGuestLessons')).toHaveLength(0)
    })
    it('requires the teacher entry gate and rejects cross-origin entry', async () => { lesson().entryOpen = false; expect((await sessionPOST(req('/api/workshop/guest/session', 'POST', { name: 'Alex', group: 'g2' }))).status).toBe(403); expect((await sessionPOST(req('/api/workshop/guest/session', 'POST', { name: 'Alex', group: 'g2' }, '', 'https://other.test'))).status).toBe(403); expect((await sessionGET(req('/api/workshop/guest/session'))).status).toBe(200); expect(await sessionGET(req('/api/workshop/guest/session')).then(r => r.json())).toEqual({ entryOpen: false }) })
    it('uses separate browser cookies and keeps refresh identity without numbered accounts', async () => { const a = await join(), b = await join(); expect(a.identity.seat).not.toBe(b.identity.seat); const status = await sessionGET(req('/api/workshop/guest/session', 'GET', undefined, a.cookie)); expect(await status.json()).toMatchObject({ name: 'Alex', group: 'g2', seat: a.identity.seat }); const retry = await sessionPOST(req('/api/workshop/guest/session', 'POST', { name: 'Alex', group: 'g2' }, a.cookie)); expect((await retry.json()).seat).toBe(a.identity.seat); expect((await sessionPOST(req('/api/workshop/guest/session', 'POST', { name: 'Other', group: 'g3' }, a.cookie))).status).toBe(409) })
    it('returns only own-session guest data and rejects another home and legacy routes', async () => { const a = await join(); const r = await classroomGET(req('/api/workshop/guest/classroom?homeGroup=g2', 'GET', undefined, a.cookie)); expect(r.status).toBe(200); const body = await r.json(); expect(body).toMatchObject({ seat: a.identity.seat, studentName: 'Alex', guest: true, selfReported: true }); for (const key of ['ownClassDetails', 'accounts', 'audit', 'password', 'loginDetails', 'classLink']) expect(body).not.toHaveProperty(key); expect(r.headers.get('cache-control')).toBe('private, no-store'); expect((await classroomGET(req('/api/workshop/guest/classroom?homeGroup=g3', 'GET', undefined, a.cookie))).status).toBe(403); expect((await legacyGET(req('/api/workshop/classroom', 'GET', undefined, a.cookie))).status).toBe(401); expect((await classroomGET(req('/api/workshop/guest/classroom?since=1&seat=' + a.identity.seat, 'GET', undefined, a.cookie))).status).toBe(304) })
    it('gives guest cookies no teacher privileges and requires authoritative admin role', async () => { const a = await join(); expect((await teacherGET(req('/api/admin/workshop/guest', 'GET', undefined, a.cookie))).status).toBe(401); h.signedIn = true; expect((await teacherGET(req('/api/admin/workshop/guest'))).status).toBe(403); h.admin = true; const r = await teacherPATCH(req('/api/admin/workshop/guest', 'PATCH', { action: 'entry', expectedVersion: 1, entryOpen: false })); expect(r.status).toBe(200); expect(lesson().entryOpen).toBe(false); expect(lesson().audit).toHaveLength(1) })
    it('enforces per-session draft ownership and keeps legacy/private fields out', async () => { const a = await join(), b = await join(); const p = { seat: a.identity.seat, topic: 'feedback-g3-idea1', expectedVersion: 0, requestId: randomUUID(), content: { idea: '1', whatWorks: 'Draft', question: '', improvement: '' } }; expect((await draftsPOST(req('/api/workshop/guest/drafts?homeGroup=g2', 'POST', p, a.cookie))).status).toBe(200); expect((await draftsPOST(req('/api/workshop/guest/drafts?homeGroup=g2', 'POST', p, b.cookie))).status).toBe(403); const own = await draftsGET(req('/api/workshop/guest/drafts?homeGroup=g2', 'GET', undefined, a.cookie)).then(r => r.json()), other = await draftsGET(req('/api/workshop/guest/drafts?homeGroup=g2', 'GET', undefined, b.cookie)).then(r => r.json()); expect(own.drafts).toHaveLength(1); expect(other.drafts).toHaveLength(0); expect(JSON.stringify(own)).not.toMatch(/password|classLink|loginDetails|requestId/) })
    it('records same-name students separately, masks names from peers and closes writes', async () => { const a = await join(), b = await join(), recipient = await join('Sam', 'g3'); Object.assign(lesson(), { phase: 'FEEDBACK', feedbackOpen: true, showFeedback: true }); const p = { kind: 'feedback', expectedSeat: a.identity.seat, submissionId: randomUUID(), phaseVersion: 0, session: '2026-10-09', presentingGroup: 'g3', visitingGroup: 'g2', idea: '1', whatWorks: 'Works', question: 'How?', improvement: 'Add labels' }; const first = await classroomPOST(req('/api/workshop/guest/classroom?homeGroup=g2', 'POST', p, a.cookie)); expect(first.status).toBe(200); const retry = await classroomPOST(req('/api/workshop/guest/classroom?homeGroup=g2', 'POST', p, a.cookie)); expect(await retry.json()).toEqual(await first.json()); expect((await classroomPOST(req('/api/workshop/guest/classroom?homeGroup=g2', 'POST', p, b.cookie))).status).toBe(403); const q = { ...p, expectedSeat: b.identity.seat, submissionId: randomUUID() }; expect((await classroomPOST(req('/api/workshop/guest/classroom?homeGroup=g2', 'POST', q, b.cookie))).status).toBe(200); const view = await classroomGET(req('/api/workshop/guest/classroom?homeGroup=g3', 'GET', undefined, recipient.cookie)).then(r => r.json()); expect(view.feedback).toHaveLength(2); expect(view.feedback.every(row => !row.studentName)).toBe(true); lesson().feedbackOpen = false; expect((await classroomPOST(req('/api/workshop/guest/classroom?homeGroup=g2', 'POST', { ...p, submissionId: randomUUID() }, a.cookie))).status).toBe(409) })
    it('revokes only the owned guest session and leaves other browser identity valid', async () => { const a = await join(), b = await join(); expect((await sessionDELETE(req('/api/workshop/guest/session', 'DELETE', undefined, a.cookie))).status).toBe(200); expect((await classroomGET(req('/api/workshop/guest/classroom?homeGroup=g2', 'GET', undefined, a.cookie))).status).toBe(401); expect((await classroomGET(req('/api/workshop/guest/classroom?homeGroup=g2', 'GET', undefined, b.cookie))).status).toBe(200); expect(h.touched.every(name => name.startsWith('workshopGuest'))).toBe(true) })
})
