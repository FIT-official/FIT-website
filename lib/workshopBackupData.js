import { createHash } from 'node:crypto'
import { WORKSHOP_SESSION } from './workshopFeedback'
import { tinkercadMappings } from './workshopTinkercadStore'

export const backupSources = [
    { id: 'guest', label: 'Name and group entry', lessons: 'workshopGuestLessons', drafts: 'workshopGuestDrafts', people: 'workshopGuestSessions' },
    { id: 'legacy', label: 'Earlier account entry', lessons: 'workshopLessons', drafts: 'workshopDrafts', people: 'workshopAccounts' },
]
export const answerKeys = ['whatWorks', 'question', 'improvement', 'feedbackUsed', 'change', 'reason', 'test']
const string = value => typeof value === 'string' ? value : ''
const number = value => Number.isSafeInteger(value) ? value : null
export const backupRef = (...parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24)
export const isoTime = value => { const date = new Date(value); return value && Number.isFinite(date.getTime()) ? date.toISOString() : null }
const answers = value => Object.fromEntries(answerKeys.filter(key => typeof value?.[key] === 'string').map(key => [key, value[key]]))

export function backupSubmission(row, kind, source, names = new Map(), updated = new Map()) {
    const homeGroup = string(kind === 'feedback' ? row.visitingGroup : row.group)
    return {
        type: kind, source: source.id, reference: backupRef(source.id, kind, row.id),
        studentReference: backupRef(source.id, row.seat || row.id),
        studentName: string(row.studentName).trim() || names.get(row.seat) || 'Name unavailable',
        homeGroup, targetGroup: string(kind === 'feedback' ? row.presentingGroup : row.group),
        idea: string(row.idea), round: number(row.reviewRound), projectVersion: string(row.projectVersion),
        submittedAt: isoTime(row.recordedAt), updatedAt: updated.get(row.id) || isoTime(row.recordedAt),
        status: ['visible', 'hidden', 'blocked', 'deleted'].includes(row.visibility) ? row.visibility : 'visible',
        revision: number(row.authorVersion || row.version), entryVersion: number(row.entryVersion || row.version),
        promptVersion: number(row.promptVersion),
        ...(kind === 'feedback' ? { answers: answers(row) } : { ideas: (Array.isArray(row.ideas) ? row.ideas : []).map((idea, index) => ({ idea: string(idea.idea) || String(index + 1), answers: answers(idea) })) }),
    }
}

const settingKeys = ['phase', 'feedbackOpen', 'refinementOpen', 'showFeedback', 'entryOpen', 'reviewRound', 'projectVersion', 'phaseVersion', 'navigationLocked', 'navigationTarget', 'navigationVersion', 'count']
function auditSide(value, source, names) {
    if (Array.isArray(value)) return value.map(row => auditSide(row, source, names))
    if (typeof value === 'boolean') return { entryOpen: value }
    if (!value || typeof value !== 'object') return null
    if (value.id && (Array.isArray(value.ideas) || value.presentingGroup)) return backupSubmission(value, Array.isArray(value.ideas) ? 'refinement' : 'feedback', source, names)
    return Object.fromEntries(settingKeys.filter(key => ['string', 'boolean', 'number'].includes(typeof value[key])).map(key => [key, value[key]]))
}

export function backupAudit(event, source, names, index) {
    return { type: 'audit', source: source.id, reference: backupRef(source.id, 'audit', index), at: isoTime(event.at), action: string(event.action), actor: 'Teacher',
        submissionReference: event.id ? backupRef(source.id, event.action, event.id) : '',
        before: auditSide(event.before, source, names), after: auditSide(event.after, source, names) }
}

export function backupDraft(row, source, names) {
    const topic = string(row.topic), match = topic.match(/^(feedback|refinement)-(?:r([2-9])-)?(g(?:[1-9]|10))-idea([12])$/)
    return { type: 'draft', source: source.id, reference: backupRef(source.id, 'draft', row._id), studentReference: backupRef(source.id, row.seat),
        studentName: names.get(row.seat) || 'Name unavailable', homeGroup: string(row.group), targetGroup: match?.[3] || '',
        activity: match?.[1] || 'Unclassified draft', idea: match?.[4] || '', round: match?.[1] === 'feedback' ? Number(match[2] || 1) : null,
        version: number(row.version), updatedAt: isoTime(row.updatedAt), status: 'Autosaved draft — not a submission',
        snapshots: (Array.isArray(row.snapshots) ? row.snapshots : []).map(snapshot => ({ version: number(snapshot.version), savedAt: isoTime(snapshot.savedAt), answers: answers(snapshot.content) })),
    }
}

export async function readBackupSnapshot(db, session, { now = new Date(), signal } = {}) {
    const options = { session, maxTimeMS: 15000 }, states = [], expected = { feedback: 0, refinement: 0, trash: 0, audit: 0, draft: 0, draftSnapshots: 0, assignment: 0 }
    const check = () => { if (signal?.aborted) throw Error('Backup canceled') }
    // Sequential operations in one snapshot session: every source, name and
    // cursor observes the same Mongo point in time, including concurrent edits.
    for (const source of backupSources) {
        check()
        const state = await db.collection(source.lessons).findOne({ _id: WORKSHOP_SESSION }, { ...options, projection: { version: 1, projectVersion: 1, feedback: 1, refinements: 1, audit: 1 } }) || { version: 0, feedback: [], refinements: [], audit: [] }
        const names = new Map(), people = db.collection(source.people).find({ session: WORKSHOP_SESSION }, { ...options, projection: source.id === 'guest' ? { _id: 0, seat: 1, name: 1 } : { _id: 1, studentName: 1, name: 1 } }).batchSize(100)
        try { for await (const person of people) { check(); const name = string(person.studentName || person.name).trim(); if (name) names.set(person.seat || person._id, name) } } finally { await people.close() }
        const updated = new Map()
        for (const event of state.audit || []) {
            const time = isoTime(event.at)
            if (!time) continue
            const ids = [event.id, ...(Array.isArray(event.before) ? event.before.map(row => row.id) : [event.before?.id]), ...(Array.isArray(event.after) ? event.after.map(row => row.id) : [event.after?.id])].filter(Boolean)
            for (const id of ids) if (!updated.has(id) || updated.get(id) < time) updated.set(id, time)
        }
        for (const row of state.feedback || []) expected[row.visibility === 'deleted' ? 'trash' : 'feedback']++
        for (const row of state.refinements || []) expected[row.visibility === 'deleted' ? 'trash' : 'refinement']++
        expected.audit += (state.audit || []).length
        const filter = { _id: { $regex: '^' + WORKSHOP_SESSION + ':' } }
        const totals = await db.collection(source.drafts).aggregate([{ $match: filter }, { $group: { _id: null, documents: { $sum: 1 }, snapshots: { $sum: { $size: { $ifNull: ['$snapshots', []] } } } } }], options).toArray()
        expected.draft += totals[0]?.documents || 0; expected.draftSnapshots += totals[0]?.snapshots || 0
        states.push({ source, state, names, updated, filter })
    }
    // The user explicitly requested the teacher's session-to-account mapping.
    // Project only approved public labels and identity snapshots, never pool
    // logins or class URLs. Unassigned seats are not part of the export.
    const pool = await db.collection('workshopTinkercadPools').findOne({ _id: WORKSHOP_SESSION }, { ...options, projection: { _id: 0, 'slots.assignedSeat': 1, 'slots.studentName': 1, 'slots.group': 1, 'slots.assignedAt': 1, 'slots.publicAccountLabel': 1, 'slots.accountReference': 1, approvals: 1 } })
    const mappings = tinkercadMappings(pool).map(row => ({ type: 'assignment', source: 'guest', reference: backupRef('tinkercad', row.seat), studentReference: backupRef('guest', row.seat), websiteSession: row.seat.replace(/^guest_/, ''), studentName: row.studentName, homeGroup: row.group, assignedName: row.assignedName, assignedGroup: row.assignedGroup, accountLabel: row.accountLabel, accountReference: row.accountReference, assignedAt: isoTime(row.assignedAt), approvedAt: isoTime(row.approvedAt), status: row.approved ? 'Approved' : 'Access revoked' }))
    expected.assignment = mappings.length
    const metadata = { format: 'fit-workshop-backup-v1', session: WORKSHOP_SESSION, capturedAt: now.toISOString(), timeZone: 'Asia/Singapore', snapshotConsistency: 'Mongo snapshot session; all collections at one point in time', sourceVersions: states.map(({ source, state }) => ({ source: source.id, lessonVersion: state.version, projectVersion: state.projectVersion || null })), expected,
        notes: ['Feedback and Improvements contain submitted records, including hidden and blocked work. Trash is separate.', 'Drafts are autosaved text, not submissions; Draft history includes only retained snapshots (currently up to eight per draft), not every keystroke.', 'Text typed offline or not yet saved to the server is not included.', 'Names are entered by students, not verified identities. Older records without a recorded name are labelled Name unavailable.', 'All input is written as text, never as an Excel formula. Full original text also appears in the archival JSONL files.', 'Tinkercad mapping contains assigned account labels and non-secret website Session IDs only. No passwords, login credentials, authentication tokens, private class links or unassigned pool seats are exported.', 'Export does not delete or change server records. Future responses require another download.'] }
    async function* records() {
        for (const { source, state, names, updated, filter } of states) {
            for (const row of state.feedback || []) { check(); yield backupSubmission(row, 'feedback', source, names, updated) }
            for (const row of state.refinements || []) { check(); yield backupSubmission(row, 'refinement', source, names, updated) }
            for (const [index, event] of (state.audit || []).entries()) { check(); yield backupAudit(event, source, names, index) }
            const cursor = db.collection(source.drafts).find(filter, { ...options, projection: { _id: 1, seat: 1, group: 1, topic: 1, version: 1, updatedAt: 1, 'snapshots.version': 1, 'snapshots.savedAt': 1, 'snapshots.content': 1 } }).sort({ _id: 1 }).batchSize(50)
            try { for await (const row of cursor) { check(); yield backupDraft(row, source, names) } } finally { await cursor.close() }
        }
        for (const mapping of mappings) { check(); yield mapping }
    }
    return { metadata, records: records() }
}
