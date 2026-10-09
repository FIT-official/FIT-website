import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { newGuest, guestAccess, guestCookie } from '@/lib/workshopGuestIdentity'
import { GUEST_CLASS_EXPIRY } from '@/lib/workshopGuestPolicy'
import { CLASS_EXPIRY } from '@/lib/workshopCredentials'
import { renewGuestSession, withGuestCookie } from '@/lib/workshopGuestContinuity'
import { studentTinkercadView } from '@/lib/workshopTinkercadStore'

const now = new Date('2026-10-09T02:00:00Z')
function oldSession(name = 'Kevin') { const session = newGuest('g4', name, now); session.record.expiresAt = new Date('2026-10-10T02:00:00Z'); return session }
function store(record, beforeUpdate = () => {}) {
    let row = structuredClone(record)
    return { get row() { return row }, updateOne: vi.fn(async (query, update) => {
        beforeUpdate(row)
        if (!row || row._id !== query._id || row.session !== query.session || row.enabled !== true || row.seat !== query.seat || row.group !== query.group || +row.expiresAt !== +query.expiresAt.$eq || row.expiresAt <= query.expiresAt.$gt) return { modifiedCount: 0 }
        Object.assign(row, update.$set); return { modifiedCount: 1 }
    }), findOne: vi.fn(async query => row?._id === query._id ? structuredClone(row) : null), remove() { row = null } }
}
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now) })
afterEach(() => vi.useRealTimers())

describe('bounded November continuation for the existing private guest session', () => {
    it('renews only expiry and preserves every identity field', async () => {
        const a = oldSession(), before = structuredClone(a.record), db = store(a.record)
        const access = await renewGuestSession(db, a.token, a.record)
        expect(db.row).toEqual({ ...before, expiresAt: GUEST_CLASS_EXPIRY })
        expect(access).toMatchObject({ seat: before.seat, name: before.name, group: before.group, expiresAt: GUEST_CLASS_EXPIRY })
        expect(db.updateOne).toHaveBeenCalledTimes(1)
        await renewGuestSession(db, a.token, db.row)
        expect(db.updateOne).toHaveBeenCalledTimes(1)
    })
    it('reuses a concurrent successful renewal without creating another identity', async () => {
        const a = oldSession(), db = store(a.record, row => { row.expiresAt = new Date(GUEST_CLASS_EXPIRY) })
        expect((await renewGuestSession(db, a.token, a.record)).seat).toBe(a.record.seat)
    })
    it.each(['already-revoked', 'expired', 'wrong-session'])('never renews an %s record', async kind => {
        const a = oldSession()
        if (kind === 'already-revoked') a.record.enabled = false
        if (kind === 'expired') a.record.expiresAt = now
        if (kind === 'wrong-session') a.record.session = 'other-class'
        const db = store(a.record)
        await expect(renewGuestSession(db, a.token, a.record)).rejects.toMatchObject({ status: 401 })
        expect(db.updateOne).not.toHaveBeenCalled()
    })
    it.each(['revocation', 'expiry', 'identity-change'])('fails closed when %s races renewal', async kind => {
        const a = oldSession(), db = store(a.record, row => {
            if (kind === 'revocation') row.enabled = false
            if (kind === 'expiry') row.expiresAt = now
            if (kind === 'identity-change') row.seat = newGuest('g4', 'Other', now).record.seat
        })
        await expect(renewGuestSession(db, a.token, a.record)).rejects.toMatchObject({ status: 401 })
        expect(db.row.expiresAt).not.toEqual(GUEST_CLASS_EXPIRY)
    })
    it('reissues the same fixed-expiry cookie on both 200 and 304, including after a lost response', async () => {
        const a = oldSession(), db = store(a.record), request = new Request('https://www.fixitoday.com/api/workshop/guest/classroom', { headers: { cookie: guestCookie(a.token, a.record.expiresAt, now) } })
        const access = await renewGuestSession(db, a.token, a.record)
        // Ignore the first response; a later request must still receive Set-Cookie.
        withGuestCookie(new Response('{}'), request, access)
        vi.setSystemTime(new Date('2026-10-10T01:59:00Z'))
        const repeated = await renewGuestSession(db, a.token, db.row)
        for (const status of [200, 304]) {
            const response = withGuestCookie(new Response(status === 304 ? null : '{}', { status }), request, repeated)
            const cookie = response.headers.get('set-cookie')
            expect(cookie).toContain('fit_workshop_guest=' + a.token)
            expect(cookie).toContain('Max-Age=' + Math.floor((GUEST_CLASS_EXPIRY - new Date()) / 1000))
            for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/api/workshop/guest']) expect(cookie).toContain(flag)
        }
        expect(db.updateOne).toHaveBeenCalledTimes(1)
    })
    it('keeps duplicate-name identities and approved Tinkercad mappings separate through November', async () => {
        const a = oldSession(), b = oldSession('KEVIN'), da = store(a.record), db = store(b.record)
        const aa = await renewGuestSession(da, a.token, a.record), bb = await renewGuestSession(db, b.token, b.record)
        const pool = { expiresAt: GUEST_CLASS_EXPIRY, classLink: 'https://www.tinkercad.com/joinclass/EXAMPLE', className: 'Friday', issuanceOpen: false, approvals: { [aa.seat]: { approved: true }, [bb.seat]: { approved: false } }, slots: [{ assignedSeat: aa.seat, studentLogin: 'synthetic-a' }, { assignedSeat: bb.seat, studentLogin: 'synthetic-b' }] }
        const before = structuredClone(pool)
        const later = new Date('2026-11-30T15:58:59Z')
        expect(studentTinkercadView(pool, guestAccess(da.row, later), later)).toMatchObject({ status: 'assigned', studentLogin: 'synthetic-a' })
        expect(studentTinkercadView(pool, guestAccess(db.row, later), later)).toEqual({ status: 'awaiting-approval' })
        expect(pool).toEqual(before); expect(aa.seat).not.toBe(bb.seat)
        expect(() => studentTinkercadView(pool, aa, GUEST_CLASS_EXPIRY)).toThrow()
    })
    it('ends at exactly 30 November 23:59 Singapore time and leaves legacy expiry unchanged', () => {
        expect(GUEST_CLASS_EXPIRY.toISOString()).toBe('2026-11-30T15:59:00.000Z')
        expect(CLASS_EXPIRY.toISOString()).toBe('2026-10-11T00:00:00.000Z')
        const before = new Date(GUEST_CLASS_EXPIRY.getTime() - 1)
        const a = newGuest('g2', 'Alex', before)
        expect(guestAccess(a.record, before).seat).toBe(a.record.seat)
        expect(() => guestAccess(a.record, GUEST_CLASS_EXPIRY)).toThrow()
        expect(() => newGuest('g2', 'Alex', GUEST_CLASS_EXPIRY)).toThrow()
    })
})
