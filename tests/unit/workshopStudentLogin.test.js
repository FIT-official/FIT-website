import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { guestAccess, guestHash, GUEST_COOKIE } from '@/lib/workshopGuestIdentity'
import { GUEST_CLASS_EXPIRY } from '@/lib/workshopGuestPolicy'
import { STUDENT_LOGIN_ERROR } from '@/lib/workshopStudentLogin'

const h = vi.hoisted(() => ({ db: null }))
vi.mock('@/lib/workshopDatabase', () => ({ workshopDatabase: async () => h.db }))
vi.mock('@/lib/authenticate', () => ({ UnauthorizedError: class extends Error {} }))
import { POST } from '@/app/api/workshop/guest/student-login/route'

const session = '2026-10-09', seat = 'guest_11111111-1111-4111-8111-111111111111', otherSeat = 'guest_22222222-2222-4222-8222-222222222222'
const privateId = 'SyntheticStudent01AA', classId = 'abc123xyz', originalToken = 'a'.repeat(64), base = 'https://www.fixitoday.com'
const request = (input = { studentId: privateId, classId }, { cookie = '', origin = base, ip = '192.0.2.1', body, type = 'application/json' } = {}) => new Request(base + '/api/workshop/guest/student-login', { method: 'POST', headers: { origin, cookie, 'x-forwarded-for': ip, 'content-type': type }, body: body ?? JSON.stringify(input) })
const cookieOf = response => response.headers.get('set-cookie')?.split(';')[0]
const tokenOf = response => cookieOf(response)?.slice(GUEST_COOKIE.length + 1)

function database() {
    const original = { _id: guestHash(originalToken), session, seat, group: 'g2', name: 'Alex Tan', enabled: true, createdAt: new Date('2026-10-09T02:00:00Z'), expiresAt: new Date(GUEST_CLASS_EXPIRY) }
    const pool = { _id: session, expiresAt: new Date(GUEST_CLASS_EXPIRY), classLink: 'https://www.tinkercad.com/joinclass/' + classId, issuanceOpen: false, approvals: { [seat]: { approved: true, version: 1, studentName: original.name, group: original.group } }, slots: [{ studentLogin: privateId, assignedSeat: seat, studentName: original.name, group: original.group, accountReference: 'TC-001', publicAccountLabel: 'Tinkercad seat 1' }] }
    const stores = new Map([['workshopGuestSessions', new Map([[original._id, original]])], ['workshopTinkercadPools', new Map([[session, pool]])], ['workshopGuestLessons', new Map([[session, { _id: session, entryOpen: true }]])], ['workshopGuestRateLimits', new Map()]])
    const state = { pool, original, stores, reads: [], writes: [], afterInsert: null, poolReadHook: null, poolReadCount: 0 }
    const matches = (row, query) => row && Object.entries(query).every(([key, value]) => {
        if (value instanceof Date) return row[key] instanceof Date && +row[key] === +value
        if (value && typeof value === 'object') return Object.entries(value).every(([op, expected]) => op === '$ne' ? row[key] !== expected : op === '$nin' ? !expected.includes(row[key]) : op === '$lt' ? row[key] < expected : op === '$gt' ? row[key] > expected : false)
        return row[key] === value
    })
    state.db = { collection(name) {
        if (!stores.has(name)) throw Error('Unexpected collection: ' + name)
        const store = stores.get(name)
        return {
            findOne: async query => { state.reads.push({ name, query }); if (name === 'workshopTinkercadPools') { state.poolReadCount++; state.poolReadHook?.(state.poolReadCount) }; return structuredClone([...store.values()].find(row => matches(row, query)) || null) },
            find: query => {
                state.reads.push({ name, query })
                let rows = [...store.values()].filter(row => matches(row, query))
                const cursor = { sort: () => { rows.sort((a, b) => a.createdAt - b.createdAt); return cursor }, limit: limit => { rows = rows.slice(0, limit); return cursor }, toArray: async () => structuredClone(rows) }
                return cursor
            },
            insertOne: async row => { if (store.has(row._id)) throw Object.assign(Error(), { code: 11000 }); state.writes.push({ name, row: structuredClone(row) }); store.set(row._id, structuredClone(row)); state.afterInsert?.(name) },
            updateOne: async (query, update, options) => {
                let row = [...store.values()].find(value => matches(value, query))
                if (!row && options?.upsert) { row = { _id: query._id, ...update.$setOnInsert }; store.set(row._id, row); return { modifiedCount: 0, upsertedCount: 1 } }
                if (!row) return { modifiedCount: 0 }
                if (update.$setOnInsert) return { modifiedCount: 0 }
                state.writes.push({ name, query, update })
                Object.assign(row, update.$set)
                for (const [key, value] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + value
                return { modifiedCount: 1 }
            },
        }
    } }
    return state
}

let state
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-16T02:00:00Z')); state = database(); h.db = state.db })
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

describe('Student ID resumes an approved assigned identity', () => {
    it('keeps the original seat, group and full name on a second device without allocating an account', async () => {
        const before = structuredClone(state.pool), original = structuredClone(state.original)
        const first = await POST(request()), second = await POST(request())
        expect(first.status).toBe(200); expect(second.status).toBe(200)
        for (const response of [first, second]) {
            expect(await response.clone().json()).toEqual({ seat, group: 'g2', name: 'Alex Tan', expiresAt: GUEST_CLASS_EXPIRY.toISOString(), selfReported: true })
            const token = tokenOf(response), record = state.stores.get('workshopGuestSessions').get(guestHash(token))
            expect(token).toMatch(/^[a-f0-9]{64}$/); expect(guestAccess(record).seat).toBe(seat)
            expect(record).not.toHaveProperty('studentId'); expect(record).not.toHaveProperty('studentLogin')
            expect(JSON.stringify(record)).not.toContain(privateId); expect(JSON.stringify(record)).not.toContain(token)
            expect(await response.text()).not.toContain(privateId)
        }
        expect(tokenOf(first)).not.toBe(tokenOf(second)); expect(state.stores.get('workshopGuestSessions').size).toBe(3)
        expect(state.original).toEqual(original); expect(state.pool).toEqual(before)
        expect(state.writes.every(write => ['workshopGuestSessions', 'workshopGuestRateLimits'].includes(write.name))).toBe(true)
    })
    it('sets a private scoped cookie and prevents response caching', async () => {
        const response = await POST(request())
        expect(response.headers.get('set-cookie')).toContain('; Path=/api/workshop/guest; HttpOnly; Secure; SameSite=Strict; Max-Age=')
        expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(response.headers.get('vary')).toBe('Cookie'); expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    })
    it('accepts the displayed hyphenated class ID but requires the exact private nickname', async () => {
        expect((await POST(request({ studentId: privateId, classId: ' ABC-123-XYZ ' }))).status).toBe(200)
        expect((await POST(request({ studentId: privateId.toLowerCase(), classId }))).status).toBe(401)
    })
    it('lets all 75 assigned students sharing one school IP sign in', async () => {
        state.stores.get('workshopGuestSessions').clear(); state.pool.slots = []; state.pool.approvals = {}
        const classmates = Array.from({ length: 75 }, (_, i) => ({ studentId: 'SyntheticClassmate' + i, seat: 'guest_' + String(i + 1).padStart(8, '0') + '-1111-4111-8111-111111111111', group: 'g' + (i % 10 + 1), studentName: 'Student ' + (i + 1) }))
        for (const student of classmates) {
            state.pool.slots.push({ studentLogin: student.studentId, assignedSeat: student.seat, studentName: student.studentName, group: student.group })
            state.pool.approvals[student.seat] = { approved: true, studentName: student.studentName, group: student.group }
        }
        const responses = await Promise.all(classmates.map(student => POST(request({ studentId: student.studentId, classId }))))
        expect(responses.every(response => response.status === 200)).toBe(true)
        const identities = await Promise.all(responses.map(response => response.json()))
        expect(new Set(identities.map(identity => identity.seat)).size).toBe(75)
        expect(identities.every((identity, i) => identity.seat === classmates[i].seat && identity.group === classmates[i].group)).toBe(true)
        expect(state.stores.get('workshopGuestSessions').size).toBe(75)
    })
    it('reuses an existing matching private cookie without adding another session', async () => {
        const response = await POST(request(undefined, { cookie: GUEST_COOKIE + '=' + originalToken }))
        expect(response.status).toBe(200); expect(tokenOf(response)).toBe(originalToken); expect(state.stores.get('workshopGuestSessions').size).toBe(1)
    })
    it('does not replace another active student identity', async () => {
        const otherToken = 'b'.repeat(64), row = { ...state.original, _id: guestHash(otherToken), seat: otherSeat, name: 'Sam Lee', group: 'g3' }
        state.stores.get('workshopGuestSessions').set(row._id, row)
        const response = await POST(request(undefined, { cookie: GUEST_COOKIE + '=' + otherToken }))
        expect(response.status).toBe(409); expect(await response.text()).toContain('Leave the current class session'); expect(response.headers.get('set-cookie')).toBeNull(); expect(state.stores.get('workshopGuestSessions').size).toBe(2)
    })
    it.each(['logged-out', 'expired', 'missing'])('recovers the original identity when the original browser record is %s', async status => {
        if (status === 'logged-out') state.original.enabled = false
        if (status === 'expired') state.original.expiresAt = new Date('2026-10-10T02:00:00Z')
        if (status === 'missing') state.stores.get('workshopGuestSessions').clear()
        const response = await POST(request(undefined, { cookie: GUEST_COOKIE + '=' + originalToken }))
        expect(response.status).toBe(200); expect((await response.json()).seat).toBe(seat); expect(tokenOf(response)).not.toBe(originalToken)
    })
    it('accepts multiple consistent historical cookie records for one immutable seat', async () => {
        state.stores.get('workshopGuestSessions').set('historical-cookie', { ...state.original, _id: 'historical-cookie', enabled: false, name: 'ALEX TAN', createdAt: new Date('2026-10-10T02:00:00Z') })
        const response = await POST(request()); expect(response.status).toBe(200); expect((await response.json()).name).toBe('Alex Tan')
    })
    it.each(['session', 'approval', 'assignment'])('refuses conflicting %s identity metadata instead of changing the student', async source => {
        if (source === 'session') state.stores.get('workshopGuestSessions').set('conflict', { ...state.original, _id: 'conflict', group: 'g3' })
        if (source === 'approval') state.pool.approvals[seat].group = 'g3'
        if (source === 'assignment') state.pool.slots[0].studentName = 'Sam Lee'
        const response = await POST(request()); expect(response.status).toBe(401); expect(await response.json()).toEqual({ error: STUDENT_LOGIN_ERROR }); expect(state.writes.some(write => write.name === 'workshopGuestSessions')).toBe(false)
    })
    it('can use a historical session if older assignment metadata is absent', async () => {
        delete state.pool.slots[0].studentName; delete state.pool.slots[0].group; delete state.pool.approvals[seat].studentName; delete state.pool.approvals[seat].group
        const response = await POST(request()); expect(response.status).toBe(200); expect((await response.json()).name).toBe('Alex Tan')
    })
    it('does not invent a name or group when all historical identity metadata is absent', async () => {
        state.stores.get('workshopGuestSessions').clear(); delete state.pool.slots[0].studentName; delete state.pool.slots[0].group; delete state.pool.approvals[seat].studentName; delete state.pool.approvals[seat].group
        expect((await POST(request())).status).toBe(401)
    })
})

describe('Student ID access gates and abuse resistance', () => {
    it.each(['wrong-id', 'wrong-class', 'unassigned', 'revoked', 'pool-expired', 'class-expired', 'missing-pool', 'duplicate-id', 'duplicate-seat', 'public-seat', 'public-reference', 'student-name'])('returns the same safe failure for %s', async scenario => {
        const input = { studentId: privateId, classId }
        if (scenario === 'wrong-id') input.studentId = 'DifferentPrivateId'
        if (scenario === 'wrong-class') input.classId = 'zzz999zzz'
        if (scenario === 'unassigned') state.pool.slots[0].assignedSeat = null
        if (scenario === 'revoked') state.pool.approvals[seat].approved = false
        if (scenario === 'pool-expired') state.pool.expiresAt = new Date('2026-10-16T01:59:59Z')
        if (scenario === 'class-expired') vi.setSystemTime(GUEST_CLASS_EXPIRY)
        if (scenario === 'missing-pool') state.stores.get('workshopTinkercadPools').clear()
        if (scenario === 'duplicate-id') state.pool.slots.push({ ...state.pool.slots[0] })
        if (scenario === 'duplicate-seat') state.pool.slots.push({ ...state.pool.slots[0], studentLogin: 'DifferentPrivateId' })
        if (scenario === 'public-seat') input.studentId = seat
        if (scenario === 'public-reference') input.studentId = 'TC-001'
        if (scenario === 'student-name') input.studentId = state.original.name
        const response = await POST(request(input)); expect(response.status).toBe(401); expect(await response.json()).toEqual({ error: STUDENT_LOGIN_ERROR }); expect(response.headers.get('set-cookie')).toBeNull(); expect(state.stores.get('workshopGuestSessions').size).toBe(1)
    })
    it.each(['closed', 'disabled', 'cross-origin'])('rejects %s entry without querying private assignments', async scenario => {
        if (scenario === 'closed') state.stores.get('workshopGuestLessons').get(session).entryOpen = false
        if (scenario === 'disabled') vi.stubEnv('WORKSHOP_GUEST_ENABLED', 'false')
        const response = await POST(request(undefined, scenario === 'cross-origin' ? { origin: 'https://evil.example' } : {}))
        expect(response.status).toBe(scenario === 'disabled' ? 503 : 403); expect(state.poolReadCount).toBe(0); expect(state.stores.get('workshopGuestSessions').size).toBe(1)
    })
    it.each([null, [], {}, { studentId: privateId }, { studentId: privateId, classId, seat }, { studentId: { $ne: null }, classId }, { studentId: privateId, classId: [] }])('rejects an invalid body shape: %j', async input => {
        const response = await POST(request(input)); expect(response.status).toBe(400); expect(state.poolReadCount).toBe(0)
    })
    it('rejects oversized, non-JSON and malformed requests', async () => {
        expect((await POST(request(undefined, { body: 'x'.repeat(501) }))).status).toBe(413)
        expect((await POST(request(undefined, { type: 'text/plain' }))).status).toBe(415)
        expect((await POST(request(undefined, { body: '{' }))).status).toBe(400)
        expect(state.poolReadCount).toBe(0)
    })
    it('limits attempts for one hashed ID before private lookup and never stores its raw value', async () => {
        for (let i = 0; i < 8; i++) expect((await POST(request({ studentId: 'WrongPrivateId', classId }))).status).toBe(401)
        const reads = state.poolReadCount
        const response = await POST(request({ studentId: 'WrongPrivateId', classId })); expect(response.status).toBe(429); expect(state.poolReadCount).toBe(reads)
        expect(JSON.stringify([...state.stores.get('workshopGuestRateLimits').keys()])).not.toContain('WrongPrivateId')
    })
    it('keeps the per-ID ceiling across class codes and letter case variants', async () => {
        for (let i = 0; i < 8; i++) await POST(request({ studentId: 'WrongPrivateId', classId }))
        expect((await POST(request({ studentId: 'wrongprivateid', classId: 'zzz999zzz' }))).status).toBe(429)
    })
    it('limits a shared IP before querying the next private assignment', async () => {
        for (let i = 0; i < 80; i++) expect((await POST(request({ studentId: 'WrongPrivateId' + i, classId }))).status).toBe(401)
        const reads = state.poolReadCount
        expect((await POST(request({ studentId: 'WrongPrivateIdNext', classId }))).status).toBe(429); expect(state.poolReadCount).toBe(reads)
    })
    it('limits aggregate attempts even when IDs and IP addresses change', async () => {
        for (let i = 0; i < 200; i++) expect((await POST(request({ studentId: 'WrongPrivateId' + i, classId }, { ip: '192.0.2.' + i }))).status).toBe(401)
        const reads = state.poolReadCount
        expect((await POST(request({ studentId: 'WrongPrivateIdNext', classId }, { ip: '198.51.100.1' }))).status).toBe(429); expect(state.poolReadCount).toBe(reads)
    })
    it.each(['approval', 'entry', 'pool-expiry', 'seat'])('rechecks %s after inserting and disables an unusable new cookie', async scenario => {
        state.afterInsert = name => { if (name !== 'workshopGuestSessions') return; if (scenario === 'approval') state.pool.approvals[seat].approved = false; if (scenario === 'entry') state.stores.get('workshopGuestLessons').get(session).entryOpen = false; if (scenario === 'pool-expiry') state.pool.expiresAt = new Date('2026-10-16T01:59:59Z'); if (scenario === 'seat') state.pool.slots[0].assignedSeat = otherSeat }
        const response = await POST(request()); expect(response.status).toBe(scenario === 'entry' ? 403 : 401); expect(response.headers.get('set-cookie')).toBeNull()
        const fresh = [...state.stores.get('workshopGuestSessions').values()].find(row => row._id !== state.original._id)
        expect(fresh.enabled).toBe(false); expect(state.original.enabled).toBe(true)
    })
    it('rechecks approval before reusing an existing cookie', async () => {
        state.poolReadHook = count => { if (count === 2) state.pool.approvals[seat].approved = false }
        const response = await POST(request(undefined, { cookie: GUEST_COOKIE + '=' + originalToken })); expect(response.status).toBe(401); expect(response.headers.get('set-cookie')).toBeNull(); expect(state.stores.get('workshopGuestSessions').size).toBe(1)
    })
    it('caps a new session at the earlier pool expiry', async () => {
        state.pool.expiresAt = new Date('2026-10-17T02:00:00Z')
        const response = await POST(request()); expect(response.status).toBe(200); expect((await response.json()).expiresAt).toBe('2026-10-17T02:00:00.000Z'); expect(response.headers.get('set-cookie')).toContain('Max-Age=86400')
    })
    it('does not echo private details from an unexpected storage failure', async () => {
        state.poolReadHook = () => { throw Error(privateId) }
        const response = await POST(request()); expect(response.status).toBe(503); expect(await response.text()).not.toContain(privateId)
    })
})
