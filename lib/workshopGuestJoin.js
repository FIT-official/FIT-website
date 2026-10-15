import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { guestName, guestNameKey, guestGroup, guestSeat, guestHash, guestAccess, newGuest, GuestAccessError } from './workshopGuestIdentity'
import { GUEST_CLASS_EXPIRY } from './workshopGuestPolicy'
import { WORKSHOP_SESSION } from './workshopFeedback'

// A name helps find a candidate; it never proves permission to use that seat.
export function strongGuestNameMatch(a, b) {
    const x = guestNameKey(a), y = guestNameKey(b)
    if (x === y) return true
    const [short, long] = x.length <= y.length ? [x, y] : [y, x], tokens = short.split(' ')
    if (!tokens.some(token => /\p{L}{3}/u.test(token) || /^[\p{Script=Han}\p{Script=Hangul}]{2,}$/u.test(token))) return false
    if (/^\p{Script=Han}{2,}$/u.test(short) && /^\p{Script=Han}+$/u.test(long) && [...long].length === [...short].length + 1 && long.endsWith(short)) return true
    return (' ' + long + ' ').includes(' ' + short + ' ')
}
export async function guestJoinCandidates(sessions, group, name) {
    if (!guestGroup(group)) throw new GuestAccessError('Choose Group 1 to 10.', 400)
    const rows = await sessions.find({ session: WORKSHOP_SESSION, group, joinPending: { $ne: true }, kind: { $ne: 'guest-join-request' } }, { projection: { _id: 0, group: 1, name: 1, seat: 1 } }).limit(1001).toArray()
    if (rows.length > 1000) throw new GuestAccessError('Ask your teacher to check class entry.', 409)
    const identities = new Map()
    for (const row of rows) if (row.group === group && guestSeat(row.seat) && typeof row.name === 'string' && strongGuestNameMatch(row.name, name)) identities.set(row.seat, { seat: row.seat, name: row.name })
    return [...identities.values()].sort((a, b) => a.seat.localeCompare(b.seat))
}
const stamp = rows => createHash('sha256').update(JSON.stringify(rows)).digest('hex')
export const pendingJoinView = row => ({ pending: true, group: row.group, name: row.name, message: 'Ask your teacher to confirm your class identity. Keep this browser open; your earlier work is safe.' })

// Serialize first joins and teacher resolution within a group on every server.
// Only these new short-lived lock records are deleted; no student/work is merged.
export async function withGuestJoinLock(lessons, group, work) {
    const _id = `${WORKSHOP_SESSION}:join-lock:${group}`, owner = randomUUID()
    for (let attempt = 0; attempt < 25; attempt++) {
        try { await lessons.insertOne({ _id, kind: 'guest-join-lock', owner, expiresAt: new Date(Date.now() + 60000) }); break }
        catch (error) {
            if (error.code !== 11000) throw error
            const old = await lessons.findOne({ _id })
            if (old?.expiresAt instanceof Date && old.expiresAt <= new Date()) await lessons.deleteOne({ _id, owner: old.owner, expiresAt: old.expiresAt })
            if (attempt === 24) throw new GuestAccessError('Another join is being saved. Try Enter class again; your work is kept.', 409)
            await new Promise(resolve => setTimeout(resolve, Math.min(10 * (attempt + 1), 80)))
        }
    }
    try { return await work() } finally { await lessons.deleteOne({ _id, owner }) }
}
export async function prepareGuestJoin(sessions, token) {
    if (new Date() >= GUEST_CLASS_EXPIRY) throw new GuestAccessError('This class has ended.', 410)
    if (token) {
        const row = await sessions.findOne({ _id: guestHash(token) })
        if ((row?.kind === 'guest-entry' || row?.joinPending) && row.expiresAt > new Date()) return { token, row }
        try { guestAccess(row); return { token, row } } catch (error) { if (error.status !== 401) throw error }
    }
    const fresh = randomBytes(32).toString('hex'), row = { _id: guestHash(fresh), kind: 'guest-entry', session: WORKSHOP_SESSION, enabled: false, createdAt: new Date(), expiresAt: new Date(GUEST_CLASS_EXPIRY) }
    await sessions.insertOne(row); return { token: fresh, row }
}
export async function enterGuestGroup(sessions, lessons, token, group, rawName) {
    if (!guestGroup(group)) throw new GuestAccessError('Choose Group 1 to 10.', 400)
    const name = guestName(rawName)
    return withGuestJoinLock(lessons, group, async () => {
        const _id = guestHash(token), existing = await sessions.findOne({ _id })
        if (existing?.joinPending && existing.expiresAt > new Date()) {
            if (existing.group !== group || guestNameKey(existing.name) !== guestNameKey(name)) throw new GuestAccessError('Cancel your waiting request before changing the name or group.', 409)
            return existing
        }
        if (existing?.kind !== 'guest-entry' || existing.expiresAt <= new Date()) {
            // Another concurrent request may have already completed this join.
            const access = guestAccess(existing)
            if (access.group !== group || !strongGuestNameMatch(access.name, name)) throw new GuestAccessError('Continue your existing class session.', 409)
            return existing
        }
        const candidates = await guestJoinCandidates(sessions, group, name), created = newGuest(group, name).record
        const row = { ...created, _id, ...(candidates.length ? { kind: 'guest-join-request', enabled: false, joinPending: true, joinId: randomUUID(), joinVersion: 0 } : {}) }
        const latest = await lessons.findOne({ _id: WORKSHOP_SESSION }, { projection: { entryOpen: 1 } })
        if (!latest?.entryOpen) throw new GuestAccessError('Your teacher just closed entry. Your earlier work is safe.', 409)
        const saved = await sessions.replaceOne({ _id, kind: 'guest-entry', enabled: false }, row)
        if (!saved.modifiedCount) throw new GuestAccessError('Your entry request changed. Refresh and try again.', 409)
        const confirmed = await lessons.findOne({ _id: WORKSHOP_SESSION }, { projection: { entryOpen: 1 } })
        if (!confirmed?.entryOpen) {
            if (!row.joinPending) await sessions.updateOne({ _id, seat: row.seat, enabled: true }, { $set: { kind: 'guest-join-request', enabled: false, joinPending: true, joinId: randomUUID(), joinVersion: 0 } })
            throw new GuestAccessError('Your teacher just closed entry. Ask them to confirm this waiting request when entry opens.', 409)
        }
        return row
    })
}
export async function listGuestJoinRequests(sessions, group) {
    if (!guestGroup(group)) throw new GuestAccessError('Choose Group 1 to 10.', 400)
    const requests = await sessions.find({ session: WORKSHOP_SESSION, group, joinPending: true, expiresAt: { $gt: new Date() } }, { projection: { _id: 0, joinId: 1, joinVersion: 1, group: 1, name: 1, createdAt: 1 } }).limit(100).toArray()
    return Promise.all(requests.map(async row => { const matches = await guestJoinCandidates(sessions, group, row.name); return { id: row.joinId, version: row.joinVersion, group, name: row.name, createdAt: row.createdAt, matches, stamp: stamp(matches) } }))
}
export async function resolveGuestJoin(sessions, lessons, access, input) {
    if (access?.role !== 'teacher' || !access.userId) throw new GuestAccessError('Teacher access required.', 403)
    if (!input || Object.keys(input).some(key => !['id', 'version', 'group', 'action', 'seat', 'stamp', 'verified'].includes(key)) || input.verified !== true || !/^[0-9a-f-]{36}$/.test(input.id || '') || !guestGroup(input.group) || input.version !== 0 || !['resume', 'new'].includes(input.action) || !/^[0-9a-f]{64}$/.test(input.stamp || '') || input.action === 'resume' && !guestSeat(input.seat) || input.action === 'new' && input.seat !== undefined) throw new GuestAccessError('Refresh the waiting requests and check the student before confirming.', 400)
    return withGuestJoinLock(lessons, input.group, async () => {
        const row = await sessions.findOne({ session: WORKSHOP_SESSION, group: input.group, joinId: input.id, joinPending: true, joinVersion: input.version, expiresAt: { $gt: new Date() } })
        if (!row) throw new GuestAccessError('This request changed or was cancelled. Refresh before confirming.', 409)
        const matches = await guestJoinCandidates(sessions, input.group, row.name)
        if (stamp(matches) !== input.stamp) throw new GuestAccessError('The matching names changed. Refresh and check with the student.', 409)
        const target = input.action === 'resume' ? matches.find(candidate => candidate.seat === input.seat) : { seat: row.seat, name: row.name }
        if (!target) throw new GuestAccessError('Choose an existing identity in this same group.', 409)
        const lesson = await lessons.findOne({ _id: WORKSHOP_SESSION }, { projection: { entryOpen: 1 } })
        if (!lesson?.entryOpen) throw new GuestAccessError('Open class entry before confirming this student.', 403)
        const result = await sessions.updateOne({ _id: row._id, joinPending: true, joinVersion: input.version }, { $set: { kind: 'guest-session', enabled: true, joinPending: false, joinVersion: 1, seat: target.seat, name: target.name, resolvedBy: access.userId, resolvedAt: new Date(), resolution: input.action } })
        if (!result.modifiedCount) throw new GuestAccessError('Another teacher resolved this request. Refresh before continuing.', 409)
        return { saved: true }
    })
}
