import { createHash } from 'node:crypto'
import { WORKSHOP_SESSION } from './workshopFeedback'
import { CLASS_EXPIRY } from './workshopCredentials'
import { guestSeat, validGuestAccess } from './workshopGuestIdentity'

export const TINKERCAD_POOL = 'workshopTinkercadPools'
const digest = value => createHash('sha256').update(value).digest('hex')
const fail = (message, status = 400) => { throw Object.assign(Error(message), { status }) }
const teacher = access => { if (access?.role !== 'teacher' || typeof access.userId !== 'string') fail('Teacher access required.', 403) }
const student = (access, now) => { if (!validGuestAccess(access) || !(access.expiresAt instanceof Date) || !Number.isFinite(access.expiresAt.getTime()) || access.expiresAt <= now || now >= CLASS_EXPIRY) fail('Your class session ended. Ask your teacher to approve your new session.', 401) }
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key))
function classLink(value) {
    try {
        const url = new URL(value)
        if (url.protocol !== 'https:' || url.hostname !== 'www.tinkercad.com' || url.port || url.username || url.password || url.search || url.hash || !/^\/joinclass\/[a-z0-9-]+\/?$/i.test(url.pathname)) throw Error()
        return url.href.replace(/\/$/, '')
    } catch { fail('Choose the verified existing Tinkercad class link.') }
}
export function validateTinkercadPool(input, legacy) {
    if (!exactKeys(input, ['format','session','className','classLink','safeMode','seats']) || input.format !== 'fit-tinkercad-pool-v1' || input.session !== WORKSHOP_SESSION || input.safeMode !== true || typeof input.className !== 'string' || !/^Friday(?:\s[^\r\n]{1,70})?$/i.test(input.className.trim()) || !Array.isArray(input.seats) || input.seats.length !== 75) fail('Choose the approved Friday-class file containing exactly 75 new anonymous seats and Safe Mode confirmation.')
    if (!Array.isArray(legacy) || legacy.length !== 40) fail('The original forty assignments could not be verified.', 409)
    const link = classLink(input.classLink)
    if (!legacy.every(row => classLink(row.classLink) === link && typeof row.loginDetails === 'string' && row.loginDetails.trim())) fail('The class does not match the original protected assignments.', 409)
    const labels = new Set(), logins = new Set()
    const slots = input.seats.map(row => {
        if (!exactKeys(row, ['label','studentLogin']) || typeof row.label !== 'string' || !row.label.trim() || row.label.length > 80 || /[\u0000-\u001f<>@]/.test(row.label) || typeof row.studentLogin !== 'string' || !/^[a-z0-9_.-]{1,120}$/i.test(row.studentLogin)) fail('Each new seat needs an anonymous label and its generated Student login.')
        const label = row.label.trim(), login = row.studentLogin, labelKey = label.toLowerCase(), loginKey = login.toLowerCase()
        if (labels.has(labelKey) || logins.has(loginKey)) fail('The private file contains duplicate seats.')
        // Conservative overlap detection also covers older free-text login instructions.
        if (legacy.some(old => old.loginDetails.toLowerCase().includes(loginKey))) fail('The new pool overlaps an original assignment.', 409)
        labels.add(labelKey); logins.add(loginKey)
        return { label, studentLogin: login, assignedSeat: null }
    }).sort((a,b) => a.label.localeCompare(b.label))
    const normalized = { className: input.className.trim(), classLink: link, safeMode: true, slots }
    return { ...normalized, slots: slots.map((slot, index) => ({ ...slot, accountReference: 'TC-' + String(index + 1).padStart(3, '0'), publicAccountLabel: slots.some(other => slot.label.toLowerCase().includes(other.studentLogin.toLowerCase())) ? 'Tinkercad seat ' + (index + 1) : slot.label })), fingerprint: digest(JSON.stringify(normalized)), classFingerprint: digest(link) }
}
export async function inspectTinkercadImport(db, access, input) {
    teacher(access)
    const legacy = await db.collection('workshopClassDetails').find({ _id: { $regex: '^' + WORKSHOP_SESSION + ':' } }, { projection: { classLink: 1, loginDetails: 1 } }).toArray()
    const pool = validateTinkercadPool(input, legacy), existing = await db.collection(TINKERCAD_POOL).findOne({ _id: WORKSHOP_SESSION })
    if (existing && existing.fingerprint !== pool.fingerprint) fail('A different private pool is already imported. Existing assignments were kept.', 409)
    return { pool, summary: { seats: 75, originalAssignmentsPreserved: 40, className: pool.className, safeMode: true, fingerprint: pool.fingerprint, classFingerprint: pool.classFingerprint, alreadyImported: Boolean(existing), issuanceOpen: Boolean(existing?.issuanceOpen) } }
}
export async function importTinkercadPool(db, access, input, expectedFingerprint, now = new Date()) {
    const inspected = await inspectTinkercadImport(db, access, input)
    if (expectedFingerprint !== inspected.summary.fingerprint) fail('Preview this exact private file before importing.', 409)
    if (now >= CLASS_EXPIRY) fail('This class has ended.', 410)
    if (!inspected.summary.alreadyImported) {
        try { await db.collection(TINKERCAD_POOL).insertOne({ _id: WORKSHOP_SESSION, ...inspected.pool, version: 1, configVersion: 0, issuanceOpen: false, approvals: {}, createdAt: now, expiresAt: CLASS_EXPIRY, audit: [{ action: 'import', actor: access.userId, at: now, count: 75, fingerprint: inspected.pool.fingerprint }] }) }
        catch (error) { if (error.code !== 11000) throw error; const existing = await db.collection(TINKERCAD_POOL).findOne({ _id: WORKSHOP_SESSION }); if (existing?.fingerprint !== inspected.pool.fingerprint) fail('A different private pool was imported. Refresh before continuing.', 409) }
    }
    return { ...inspected.summary, imported: true }
}
export function studentTinkercadView(pool, access, now = new Date()) {
    student(access, now)
    if (!pool || pool.expiresAt <= now) return { status: 'not-ready' }
    if (!pool.approvals?.[access.seat]?.approved) return { status: 'awaiting-approval' }
    const own = pool.slots.find(slot => slot.assignedSeat === access.seat)
    if (own) return { status: 'assigned', studentLogin: own.studentLogin, classId: new URL(pool.classLink).pathname.split('/').pop().replace(/^([a-z0-9]{3})([a-z0-9]{3})([a-z0-9]{3})$/i, '$1-$2-$3'), classLink: pool.classLink, className: pool.className, expiresAt: access.expiresAt.toISOString() }
    if (!pool.issuanceOpen) return { status: 'paused' }
    return { status: pool.slots.some(slot => slot.assignedSeat === null) ? 'ready' : 'exhausted' }
}
export async function readTinkercadAssignment(db, access, now = new Date()) {
    student(access, now)
    return studentTinkercadView(await db.collection(TINKERCAD_POOL).findOne({ _id: WORKSHOP_SESSION }), access, now)
}
export async function claimTinkercadAssignment(db, access, now = new Date()) {
    student(access, now)
    const store = db.collection(TINKERCAD_POOL)
    // One bounded private document: the approval check, no-previous-claim condition
    // and first-unused-slot update are one atomic Mongo operation. Concurrent retries
    // cannot consume another seat, and different sessions cannot claim the same slot.
    const claimed = await store.findOneAndUpdate({
        _id: WORKSHOP_SESSION, expiresAt: { $gt: now }, issuanceOpen: true,
        ['approvals.' + access.seat + '.approved']: true,
        $expr: { $not: [{ $in: [access.seat, '$slots.assignedSeat'] }] },
        slots: { $elemMatch: { assignedSeat: null } },
    }, { $set: { 'slots.$.assignedSeat': access.seat, 'slots.$.assignedAt': now, 'slots.$.group': access.group, 'slots.$.studentName': access.name }, $inc: { version: 1 } }, { returnDocument: 'after', includeResultMetadata: false })
    return studentTinkercadView(claimed || await store.findOne({ _id: WORKSHOP_SESSION }), access, now)
}
export async function teacherTinkercadView(db, access, now = new Date()) {
    teacher(access)
    const pool = await db.collection(TINKERCAD_POOL).findOne({ _id: WORKSHOP_SESSION })
    const joined = await db.collection('workshopGuestSessions').find({ session: WORKSHOP_SESSION, enabled: true, expiresAt: { $gt: now } }, { projection: { _id: 0, seat: 1, name: 1, group: 1, createdAt: 1 } }).sort({ createdAt: 1 }).limit(500).toArray()
    return { imported: Boolean(pool), className: pool?.className || null, issuanceOpen: Boolean(pool?.issuanceOpen), configVersion: pool?.configVersion || 0, total: pool?.slots.length || 0, available: pool?.slots.filter(row => row.assignedSeat === null).length || 0, assigned: pool?.slots.filter(row => row.assignedSeat !== null).length || 0, assignments: tinkercadMappings(pool), sessions: joined.map(row => ({ ...row, approved: Boolean(pool?.approvals?.[row.seat]?.approved), approvalVersion: pool?.approvals?.[row.seat]?.version || 0, assigned: Boolean(pool?.slots.some(slot => slot.assignedSeat === row.seat)) })) }
}
export async function changeTinkercadAccess(db, access, input, now = new Date()) {
    teacher(access)
    if (now >= CLASS_EXPIRY) fail('This class has ended.', 410)
    const store = db.collection(TINKERCAD_POOL), at = now.toISOString()
    if (input?.action === 'issuance') {
        if (!exactKeys(input, ['action','open','expectedVersion']) || typeof input.open !== 'boolean' || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) fail('Choose whether to allow new assignments.')
        const result = await store.updateOne({ _id: WORKSHOP_SESSION, configVersion: input.expectedVersion, 'audit.4999': { $exists: false } }, { $set: { issuanceOpen: input.open }, $inc: { version: 1, configVersion: 1 }, $push: { audit: { action: 'issuance', open: input.open, actor: access.userId, at } } })
        if (!result.modifiedCount) fail('The assignment settings changed. Refresh before saving.', 409)
        return { saved: true }
    }
    if (!exactKeys(input, ['action','approved','sessions']) || input.action !== 'approval' || typeof input.approved !== 'boolean' || !Array.isArray(input.sessions) || !input.sessions.length || input.sessions.length > 100 || new Set(input.sessions.map(row => row?.seat)).size !== input.sessions.length) fail('Choose the joined sessions to approve or revoke.')
    const predicates = [], updates = {}, identities = []
    for (const row of input.sessions) {
        if (!exactKeys(row, ['seat','expectedVersion']) || !guestSeat(row.seat) || !Number.isInteger(row.expectedVersion) || row.expectedVersion < 0) fail('Choose a current student session.')
        const live = await db.collection('workshopGuestSessions').findOne({ session: WORKSHOP_SESSION, seat: row.seat, enabled: true, expiresAt: { $gt: now } }, { projection: { seat: 1, name: 1, group: 1 } })
        if (!live) fail('A selected session ended. Refresh the list before approving.', 409)
        const key = 'approvals.' + row.seat
        predicates.push(row.expectedVersion === 0 ? { $or: [{ [key + '.version']: 0 }, { [key]: { $exists: false } }] } : { [key + '.version']: row.expectedVersion })
        updates[key] = { approved: input.approved, version: row.expectedVersion + 1, actor: access.userId, at, studentName: live.name, group: live.group }
        identities.push({ seat: row.seat, studentName: live.name, group: live.group })
    }
    const result = await store.updateOne({ _id: WORKSHOP_SESSION, $and: predicates, 'audit.4999': { $exists: false } }, { $set: updates, $inc: { version: 1 }, $push: { audit: { action: 'approval', approved: input.approved, seats: input.sessions.map(row => row.seat), identities, actor: access.userId, at } } })
    if (!result.modifiedCount) fail('An approval changed. Refresh before saving; no selected approvals were changed.', 409)
    return { saved: true, count: input.sessions.length }
}

// Only these public assignment fields belong in teacher lookups and backups.
// The private class URL and generated studentLogin never leave this selector.
export function tinkercadMappings(pool) {
    return (pool?.slots || []).flatMap((slot, index) => {
        if (typeof slot.assignedSeat !== 'string') return []
        const approved = pool.approvals?.[slot.assignedSeat]
        return [{ seat: slot.assignedSeat, studentName: approved?.studentName || slot.studentName || 'Name unavailable', group: approved?.group || slot.group,
            assignedName: slot.studentName || 'Name unavailable', assignedGroup: slot.group,
            accountReference: slot.accountReference || 'TC-' + String(index + 1).padStart(3, '0'),
            accountLabel: slot.publicAccountLabel || 'Tinkercad seat ' + (index + 1), assignedAt: slot.assignedAt,
            approved: Boolean(approved?.approved), approvedAt: approved?.at || null }]
    })
}
