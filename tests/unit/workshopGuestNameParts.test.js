import { describe, expect, it } from 'vitest'
import { guestAccess, guestNamePartMatches, newGuest } from '@/lib/workshopGuestIdentity'
import { GUEST_CLASS_EXPIRY } from '@/lib/workshopGuestPolicy'
import { studentTinkercadView } from '@/lib/workshopTinkercadStore'

const now = new Date('2026-10-09T02:00:00Z')
const access = (name, group = 'g2') => guestAccess(newGuest(group, name, now).record, now)

describe('name parts verified only against the private-session identity', () => {
    it.each(['Alex', 'Tan', 'LEX', '  aLEX   tAN ', 'lex ta', 'a'])('accepts a normalised part %j and retains the full stored identity', part => {
        const own = access('Alex Tan'), before = structuredClone(own)
        expect(guestNamePartMatches(own, 'g2', part)).toBe(true)
        expect(own).toEqual(before)
    })
    it.each([['李小明', '小明'], ['李小明', '李'], ["Anne-Marie O'Neil", 'Marie'], ["Anne-Marie O'Neil", "O'Neil"], ['Élodie Tan', 'e\u0301LODIE']])('matches Unicode and compound-name parts without inventing aliases: %s / %s', (name, part) => {
        expect(guestNamePartMatches(access(name), 'g2', part)).toBe(true)
    })
    it.each([['Alex Tan', 'Alexander'], ['Alex Tan', 'Tan Alex'], ['Alex Tan', 'Lex Tan extra'], ['Élodie Tan', 'Elodie'], ["O'Neil", 'ONeil'], ['William Lim', 'Bill'], ['李小明', 'Li']])('rejects an unverified spelling, translation or nickname: %s / %s', (name, part) => {
        expect(guestNamePartMatches(access(name), 'g2', part)).toBe(false)
    })
    it('never accepts a different selected group or a non-guest identity', () => {
        const own = access('Alex Tan')
        expect(guestNamePartMatches(own, 'g3', 'Alex')).toBe(false)
        for (const invalid of [null, {}, { ...own, guest: false }, { ...own, role: 'teacher' }, { ...own, seat: 'group2student1' }]) expect(guestNamePartMatches(invalid, 'g2', 'Alex')).toBe(false)
    })
    it.each(['', ' ', '.', '-', "'", '123', '<Alex>', 'a@example.com', '\nAlex', 'Alex\u0000'])('rejects an invalid name fragment %j', part => {
        expect(() => guestNamePartMatches(access('Alex Tan'), 'g2', part)).toThrow()
    })
    it('keeps a shared fragment scoped to each cookie and does not change assigned logins or approvals', () => {
        const first = access('Alex Tan'), second = access('Alex Lee')
        const pool = { expiresAt: GUEST_CLASS_EXPIRY, classLink: 'https://www.tinkercad.com/joinclass/EXAMPLE', className: 'Example class', issuanceOpen: false,
            approvals: { [first.seat]: { approved: true }, [second.seat]: { approved: false } },
            slots: [{ assignedSeat: first.seat, studentLogin: 'synthetic-first' }, { assignedSeat: second.seat, studentLogin: 'synthetic-second' }] }
        const before = structuredClone(pool)
        expect(guestNamePartMatches(first, 'g2', 'Alex')).toBe(true)
        expect(guestNamePartMatches(second, 'g2', 'Alex')).toBe(true)
        expect(first.seat).not.toBe(second.seat)
        expect(studentTinkercadView(pool, first, now)).toMatchObject({ studentLogin: 'synthetic-first', status: 'assigned' })
        expect(studentTinkercadView(pool, second, now)).toEqual({ status: 'awaiting-approval' })
        expect(pool).toEqual(before)
    })
})
