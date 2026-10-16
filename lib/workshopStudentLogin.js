import { randomBytes, timingSafeEqual, createHash } from 'node:crypto'
import { WORKSHOP_SESSION } from './workshopFeedback'
import { GUEST_CLASS_EXPIRY } from './workshopGuestPolicy'
import { guestAccess, guestGroup, guestHash, guestName, guestNameKey, guestSeat, GuestAccessError, requireGuestEnabled } from './workshopGuestIdentity'
import { TINKERCAD_POOL } from './workshopTinkercadStore'

export const STUDENT_LOGIN_ERROR = 'The Student ID or class ID is incorrect, expired or no longer approved. Ask your teacher to check your access.'
const denied = () => { throw new GuestAccessError(STUDENT_LOGIN_ERROR, 401) }
const digest = value => createHash('sha256').update(value).digest()
const sameSecret = (a, b) => timingSafeEqual(digest(a), digest(b))
const classKey = value => value.toLowerCase().replaceAll('-', '')
const validDate = value => value instanceof Date && Number.isFinite(value.getTime())

export function validateStudentLogin(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 2 || Object.keys(input).some(key => !['studentId', 'classId'].includes(key)) || typeof input.studentId !== 'string' || typeof input.classId !== 'string') throw new GuestAccessError('Enter your Student ID and class ID.', 400)
    // These are the private generated Tinkercad nickname and the class code.
    // A public workshop Session ID, name or account label is never a credential.
    if (!/^[a-z0-9_.-]{1,120}$/i.test(input.studentId) || guestSeat(input.studentId) || /^TC-\d+$/i.test(input.studentId) || !/^(?:[a-z0-9]{9}|[a-z0-9]{3}-[a-z0-9]{3}-[a-z0-9]{3})$/i.test(input.classId.trim())) denied()
    return { studentId: input.studentId, classId: classKey(input.classId.trim()) }
}

function approvedAssignment(pool, input, now) {
    if (now >= GUEST_CLASS_EXPIRY || !pool || pool._id !== WORKSHOP_SESSION || !validDate(pool.expiresAt) || pool.expiresAt <= now || !Array.isArray(pool.slots) || pool.slots.length > 75) denied()
    let code
    try {
        const url = new URL(pool.classLink)
        if (url.protocol !== 'https:' || url.hostname !== 'www.tinkercad.com' || url.port || url.username || url.password || url.search || url.hash || !/^\/joinclass\/[a-z0-9-]+\/?$/i.test(url.pathname)) denied()
        code = classKey(url.pathname.replace(/\/$/, '').split('/').pop())
    } catch { denied() }
    if (!sameSecret(code, input.classId)) denied()
    const matches = pool.slots.filter(slot => typeof slot.studentLogin === 'string' && sameSecret(slot.studentLogin, input.studentId))
    if (matches.length !== 1) denied()
    const slot = matches[0], approval = pool.approvals?.[slot.assignedSeat]
    if (!guestSeat(slot.assignedSeat) || approval?.approved !== true || pool.slots.some(other => other !== slot && other.assignedSeat === slot.assignedSeat)) denied()
    return { slot, approval }
}

function identity(name, group) {
    if (!guestGroup(group)) denied()
    try { return { name: guestName(name), group } } catch { denied() }
}
const sameIdentity = (a, b) => a.group === b.group && guestNameKey(a.name) === guestNameKey(b.name)

async function assignedIdentity(sessions, slot, approval) {
    // Multiple devices legitimately hold different private cookies for one seat.
    // Old or logged-out records still establish its original name and group.
    const rows = await sessions.find({ session: WORKSHOP_SESSION, seat: slot.assignedSeat, joinPending: { $ne: true }, kind: { $nin: ['guest-entry', 'guest-join-request'] } }, { projection: { name: 1, group: 1, createdAt: 1 } }).sort({ createdAt: 1 }).limit(1001).toArray()
    if (rows.length > 1000) denied()
    const identities = rows.map(row => identity(row.name, row.group))
    for (const metadata of [slot, approval]) {
        if (metadata.studentName !== undefined || metadata.group !== undefined) identities.push(identity(metadata.studentName, metadata.group))
    }
    if (!identities.length || identities.some(candidate => !sameIdentity(candidate, identities[0]))) denied()
    return identities[0]
}

async function requireOpenEntry(db) {
    const lesson = await db.collection('workshopGuestLessons').findOne({ _id: WORKSHOP_SESSION }, { projection: { entryOpen: 1 } })
    if (lesson?.entryOpen !== true) throw new GuestAccessError('Your teacher has not opened class entry yet.', 403)
}

export async function resumeWorkshopStudent(db, rawInput, { token = null, now = new Date() } = {}) {
    requireGuestEnabled()
    const input = validateStudentLogin(rawInput)
    if (!validDate(now) || now >= GUEST_CLASS_EXPIRY) denied()
    await requireOpenEntry(db)
    const pools = db.collection(TINKERCAD_POOL), sessions = db.collection('workshopGuestSessions')
    const pool = await pools.findOne({ _id: WORKSHOP_SESSION })
    const { slot, approval } = approvedAssignment(pool, input, now)
    const owner = await assignedIdentity(sessions, slot, approval)
    let current = null
    if (token) {
        const row = await sessions.findOne({ _id: guestHash(token) })
        try { current = guestAccess(row, now) } catch (error) { if (error.status !== 401) throw error }
        if (current && (current.seat !== slot.assignedSeat || !sameIdentity(current, owner))) throw new GuestAccessError('Leave the current class session before signing in with another Student ID.', 409)
    }
    const confirm = async () => {
        requireGuestEnabled()
        const checkedAt = new Date(Math.max(now.getTime(), Date.now()))
        const latest = await pools.findOne({ _id: WORKSHOP_SESSION }), assignment = approvedAssignment(latest, input, checkedAt)
        if (assignment.slot.assignedSeat !== slot.assignedSeat) denied()
        for (const metadata of [assignment.slot, assignment.approval]) {
            if ((metadata.studentName !== undefined || metadata.group !== undefined) && !sameIdentity(identity(metadata.studentName, metadata.group), owner)) denied()
        }
        await requireOpenEntry(db)
    }
    if (current) {
        await confirm()
        // Read again so a concurrent leave cannot be reversed by this endpoint.
        const access = guestAccess(await sessions.findOne({ _id: guestHash(token) }), now)
        if (access.seat !== slot.assignedSeat || !sameIdentity(access, owner)) denied()
        return { token, access }
    }
    const fresh = randomBytes(32).toString('hex')
    const record = { _id: guestHash(fresh), kind: 'guest-session', session: WORKSHOP_SESSION, seat: slot.assignedSeat, ...owner, enabled: true, expiresAt: new Date(Math.min(GUEST_CLASS_EXPIRY.getTime(), pool.expiresAt.getTime())), createdAt: now, authentication: 'student-id' }
    await sessions.insertOne(record)
    try { await confirm() }
    catch (error) {
        // Never hand out a usable new cookie if approval/entry changed mid-login.
        await sessions.updateOne({ _id: record._id, seat: record.seat }, { $set: { enabled: false } })
        throw error
    }
    return { token: fresh, access: guestAccess(record, now) }
}
