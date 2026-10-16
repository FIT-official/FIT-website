import { describe, expect, it, vi } from 'vitest'
import { teacherTinkercadStudentLogin, teacherTinkercadView, tinkercadMappings } from '@/lib/workshopTinkercadStore'

const teacher = { role: 'teacher', userId: 'synthetic-teacher' }
const seats = ['guest_11111111-1111-4111-8111-111111111111', 'guest_22222222-2222-4222-8222-222222222222']
const now = new Date('2026-10-16T00:00:00Z'), expiresAt = new Date('2026-11-30T15:59:00Z')
const pool = () => ({ expiresAt, className: 'Friday', classLink: 'https://www.tinkercad.com/joinclass/ABCDEF123', issuanceOpen: false, approvals: { [seats[0]]: { approved: true }, [seats[1]]: { approved: false } }, slots: seats.map((seat, i) => ({ assignedSeat: seat, studentName: 'Student ' + i, group: 'g2', studentLogin: 'synthetic-private-' + i, assignedAt: now })) })
function database(data = pool(), rows = []) {
    const cursor = { sort: vi.fn(() => cursor), limit: vi.fn(() => cursor), toArray: vi.fn(async () => rows) }
    const findOne = vi.fn(async () => data), find = vi.fn(() => cursor)
    return { collection: vi.fn(name => name === 'workshopTinkercadPools' ? { findOne } : { find }), findOne, find, cursor }
}

describe('teacher lookup of an individual Tinkercad Student ID', () => {
    it('requires teacher access and a strict seat before reading private data', async () => {
        const db = database()
        await expect(teacherTinkercadStudentLogin(db, { role: 'student' }, seats[0], now)).rejects.toMatchObject({ status: 403 })
        for (const seat of ['', 'group2student1', seats[0] + '.approved', { $ne: null }]) await expect(teacherTinkercadStudentLogin(db, teacher, seat, now)).rejects.toMatchObject({ status: 400 })
        expect(db.collection).not.toHaveBeenCalled()
    })
    it('returns only one existing approved login even when new assignments are paused', async () => {
        const data = pool(), before = structuredClone(data)
        const result = await teacherTinkercadStudentLogin(database(data), teacher, seats[0], now)
        expect(result).toEqual({ seat: seats[0], studentLogin: 'synthetic-private-0', classId: 'ABC-DEF-123', className: 'Friday', expiresAt: expiresAt.toISOString() })
        expect(JSON.stringify(result)).not.toContain('synthetic-private-1')
        expect(result).not.toHaveProperty('classLink')
        expect(data).toEqual(before)
    })
    it('does not reveal revoked or unassigned credentials', async () => {
        const data = pool()
        await expect(teacherTinkercadStudentLogin(database(data), teacher, seats[1], now)).rejects.toMatchObject({ status: 403 })
        data.approvals[seats[1]].approved = true
        data.slots.pop()
        await expect(teacherTinkercadStudentLogin(database(data), teacher, seats[1], now)).rejects.toMatchObject({ status: 404 })
    })
    it.each([null, { expiresAt: new Date('2026-10-11') }, { expiresAt: new Date('invalid') }])('does not reveal a missing or expired pool', async value => {
        await expect(teacherTinkercadStudentLogin(database(value), teacher, seats[0], now)).rejects.toMatchObject({ status: 409 })
    })
    it('keeps Student IDs and the Class ID out of general listings and backups', async () => {
        const data = pool(), result = await teacherTinkercadView(database(data), teacher, now)
        expect(result).toMatchObject({ imported: true, expiresAt: expiresAt.toISOString(), expired: false })
        for (const view of [result, tinkercadMappings(data)]) expect(JSON.stringify(view)).not.toMatch(/synthetic-private|ABCDEF123|ABC-DEF-123|studentLogin|classLink|classId/)
        expect((await teacherTinkercadView(database({ ...data, expiresAt: now }), teacher, now)).expired).toBe(true)
    })
    it('lists one latest identity per seat and omits pending or malformed rows', async () => {
        const rows = [
            { _id: 'old-cookie-hash', seat: seats[0], name: 'Earlier name', group: 'g2', createdAt: new Date('2026-10-09') },
            { _id: 'latest-cookie-hash', seat: seats[0], name: 'Latest name', group: 'g3', createdAt: new Date('2026-10-16') },
            { _id: 'another-cookie-hash', seat: seats[1], name: 'Different student', group: 'g2', createdAt: new Date('2026-10-10') },
            { _id: 'pending-cookie-hash', seat: seats[0], name: 'Pending name', group: 'g4', createdAt: new Date('2026-10-17'), joinPending: true },
            { _id: 'request-cookie-hash', seat: seats[0], name: 'Request name', group: 'g4', createdAt: new Date('2026-10-17'), kind: 'guest-join-request' },
            { _id: 'invalid-cookie-hash', seat: 'invalid', name: 'Invalid name', group: 'g2', createdAt: now },
        ]
        const db = database(pool(), rows), result = await teacherTinkercadView(db, teacher, now)
        expect(result.sessions).toHaveLength(2)
        expect(result.sessions.find(row => row.seat === seats[0])).toMatchObject({ name: 'Latest name', group: 'g3', approved: true, assigned: true })
        expect(JSON.stringify(result)).not.toMatch(/cookie-hash|Earlier name|Pending name|Request name|Invalid name/)
        expect(db.find.mock.calls[0][0]).toMatchObject({ joinPending: { $ne: true }, kind: { $nin: ['guest-entry', 'guest-join-request'] } })
    })
})
