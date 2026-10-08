import { describe, it, expect } from 'vitest'
import { validateTinkercadPool, studentTinkercadView, tinkercadMappings } from '@/lib/workshopTinkercadStore'
const link = 'https://www.tinkercad.com/joinclass/EXAMPLE-ONLY'
const legacy = Array.from({ length: 40 }, (_, i) => ({ classLink: link, loginDetails: 'legacy-login-' + i }))
const input = () => ({ format: 'fit-tinkercad-pool-v1', session: '2026-10-09', className: 'Friday', classLink: link, safeMode: true, seats: Array.from({ length: 75 }, (_, i) => ({ label: 'Anonymous Seat ' + i, studentLogin: 'example-login-' + i })) })
const access = { role: 'student', guest: true, seat: 'guest_11111111-1111-4111-8111-111111111111', group: 'g2', name: 'Student A', expiresAt: new Date('2026-10-10T00:00:00Z') }, now = new Date('2026-10-09T00:00:00Z')
describe('private Tinkercad import boundaries', () => {
    it('normalizes a verified 75-seat pool and gives deterministic opaque fingerprints', () => { const a = validateTinkercadPool(input(), legacy), b = input(); b.seats.reverse(); expect(validateTinkercadPool(b, legacy).fingerprint).toBe(a.fingerprint); expect(a.fingerprint).toMatch(/^[a-f0-9]{64}$/); expect(a.slots).toHaveLength(75); expect(a.slots.every(r => r.assignedSeat === null)).toBe(true) })
    it.each([0, 40, 74, 76])('rejects an unapproved %i-seat batch', count => { const data = input(); data.seats = Array.from({ length: count }, (_, i) => ({ label: 'Anonymous ' + i, studentLogin: 'example-' + i })); expect(() => validateTinkercadPool(data, legacy)).toThrow('75') })
    it('requires all original forty and the same existing class', () => { expect(() => validateTinkercadPool(input(), legacy.slice(1))).toThrow('forty'); expect(() => validateTinkercadPool({ ...input(), classLink: link + '-OTHER' }, legacy)).toThrow('original') })
    it('requires Safe Mode and rejects accidentally included account/password fields', () => { expect(() => validateTinkercadPool({ ...input(), safeMode: false }, legacy)).toThrow(); expect(() => validateTinkercadPool({ ...input(), teacherPassword: 'fictional-only' }, legacy)).toThrow() })
    it.each(['http://www.tinkercad.com/joinclass/EXAMPLE','https://evil.example/joinclass/EXAMPLE','https://www.tinkercad.com.evil.example/joinclass/EXAMPLE','https://www.tinkercad.com/joinclass/EXAMPLE?secret=example','https://user:pass@www.tinkercad.com/joinclass/EXAMPLE'])('rejects unsafe private link %s', classLink => { expect(() => validateTinkercadPool({ ...input(), classLink }, legacy)).toThrow() })
    it('rejects duplicate logins and labels including case changes', () => { const a = input(); a.seats[1].studentLogin = a.seats[0].studentLogin.toUpperCase(); expect(() => validateTinkercadPool(a, legacy)).toThrow('duplicate'); const b = input(); b.seats[1].label = b.seats[0].label.toUpperCase(); expect(() => validateTinkercadPool(b, legacy)).toThrow('duplicate') })
    it('rejects overlap with original private login instructions', () => { const a = input(); a.seats[0].studentLogin = 'legacy-login-1'; expect(() => validateTinkercadPool(a, legacy)).toThrow('overlaps') })
    it('never reveals credentials to unapproved, revoked or expired sessions', () => { const pool = { ...validateTinkercadPool(input(), legacy), expiresAt: new Date('2026-10-11'), approvals: {}, issuanceOpen: true }; pool.slots[0].assignedSeat = access.seat; expect(studentTinkercadView(pool, access, now)).toEqual({ status: 'awaiting-approval' }); expect(() => studentTinkercadView(pool, access, access.expiresAt)).toThrow('ended'); expect(() => studentTinkercadView(pool, { ...access, expiresAt: new Date('invalid') }, now)).toThrow('ended'); expect(() => studentTinkercadView(pool, { ...access, role: 'teacher' }, now)).toThrow() })
    it('returns only the approved session assignment even while new issuance is paused', () => { const pool = { ...validateTinkercadPool(input(), legacy), expiresAt: new Date('2026-10-11'), approvals: { [access.seat]: { approved: true, studentName: access.name, group: access.group } }, issuanceOpen: false }; pool.slots[0].assignedSeat = access.seat; const result = studentTinkercadView(pool, access, now); expect(result).toEqual({ status: 'assigned', studentLogin: pool.slots[0].studentLogin, classId: 'EXAMPLE-ONLY', classLink: link, className: 'Friday', expiresAt: access.expiresAt.toISOString() }); expect(JSON.stringify(result)).not.toContain(pool.slots[1].studentLogin) })
    it('formats a nine-character class join code as the provider Class ID', () => { const pool = { ...validateTinkercadPool(input(), legacy), classLink: 'https://www.tinkercad.com/joinclass/ABCDEF123', expiresAt: new Date('2026-10-11'), approvals: { [access.seat]: { approved: true, studentName: access.name, group: access.group } } }; pool.slots[0].assignedSeat = access.seat; expect(studentTinkercadView(pool, access, now).classId).toBe('ABC-DEF-123') })

    it('retains the same approved session assignment when display identity changes', () => {
        const pool = { ...validateTinkercadPool(input(), legacy), expiresAt: new Date('2026-10-11'), approvals: { [access.seat]: { approved: true, studentName: access.name, group: access.group } } }
        Object.assign(pool.slots[0], { assignedSeat: access.seat, studentName: access.name, group: access.group })
        expect(studentTinkercadView(pool, { ...access, name: 'Changed name' }, now).studentLogin).toBe(pool.slots[0].studentLogin)
        expect(studentTinkercadView(pool, { ...access, group: 'g3' }, now).studentLogin).toBe(pool.slots[0].studentLogin)
        expect(pool.slots[0].studentName).toBe(access.name)
        expect(pool.slots[0].group).toBe(access.group)
        expect(pool.slots.filter(row => row.assignedSeat)).toHaveLength(1)
    })
    it('keeps durable teacher mappings without serializing login values or unassigned seats', () => {
        const pool = validateTinkercadPool(input(), legacy)
        Object.assign(pool.slots[0], { assignedSeat: access.seat, studentName: 'Initial name', group: 'g2', assignedAt: now })
        pool.approvals = { [access.seat]: { approved: true, studentName: 'Approved name', group: 'g3', at: now.toISOString() } }
        const mapping = tinkercadMappings(pool)
        expect(mapping).toHaveLength(1)
        expect(mapping[0]).toMatchObject({ studentName: 'Approved name', group: 'g3', assignedName: 'Initial name', assignedGroup: 'g2', seat: access.seat, accountReference: 'TC-001' })
        expect(JSON.stringify(mapping)).not.toMatch(/example-login|joinclass|studentLogin|classLink/)
    })
    it('does not expose a login accidentally repeated in an anonymous label', () => {
        const file = input(); file.seats[0].label = 'Seat ' + file.seats[0].studentLogin + ' ' + file.seats[1].studentLogin
        const pool = validateTinkercadPool(file, legacy), slot = pool.slots.find(row => row.studentLogin === file.seats[0].studentLogin)
        expect(slot.publicAccountLabel).not.toContain(slot.studentLogin)
        expect(slot.publicAccountLabel).not.toContain(file.seats[1].studentLogin)
        expect(slot.accountReference).toMatch(/^TC-\d{3}$/)
    })
})
