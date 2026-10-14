import { createHash } from 'node:crypto'
import { WORKSHOP_SESSION } from './workshopFeedback'
import { validGuestAccess, guestGroup } from './workshopGuestIdentity'
import { blankCanvas, validCanvas, copyCanvas, CANVAS_LIMITS } from './workshopCanvasModel'
import { referenceMatchesIdea } from './workshopPublication'
export class CanvasError extends Error { constructor(message, status = 400) { super(message); this.status = status } }
export const canvasId = (group, idea) => WORKSHOP_SESSION + ':canvas:' + group + ':' + idea
const teacher = access => access?.role === 'teacher' && typeof access.userId === 'string' && !!access.userId
const assertScope = (access, group, idea) => { if (!guestGroup(group) || !['1', '2'].includes(idea)) throw new CanvasError('Choose an existing group and idea.'); if (!teacher(access) && (!validGuestAccess(access) || access.group !== group)) throw new CanvasError('Open your own group drawing.', 403) }
const empty = (group, idea) => ({ _id: canvasId(group, idea), kind: 'group-canvas', session: WORKSHOP_SESSION, group, idea, version: 0, status: 'draft', document: blankCanvas(), revisions: [], receipts: [] })
export function canvasView(row, revision) {
    const selected = revision === undefined ? null : row.revisions.find(r => r.version === revision)
    if (revision !== undefined && !selected) throw new CanvasError('This drawing revision was not found.', 404)
    return { session: WORKSHOP_SESSION, group: row.group, idea: row.idea, version: row.version, status: row.status, document: copyCanvas(selected?.document || row.document), viewedRevision: selected?.version || null, readonly: !!selected || row.status === 'submitted', history: row.revisions.map(({ version, action, at, role, sourceVersion }) => ({ version, action, at, role, sourceVersion })) }
}
export async function readCanvas(store, access, group, idea, revision) { assertScope(access, group, idea); return canvasView(await store.findOne({ _id: canvasId(group, idea) }) || empty(group, idea), revision) }
export async function exportCanvas(store, access, group, idea) { assertScope(access, group, idea); if (!teacher(access)) throw new CanvasError('Teacher access required.', 403); const row = await store.findOne({ _id: canvasId(group, idea) }) || empty(group, idea); return { format: 'fit-group-canvas-history-v1', session: WORKSHOP_SESSION, group, idea, version: row.version, status: row.status, document: row.document, revisions: row.revisions.map(({ version, action, at, role, sourceVersion, document }) => ({ version, action, at, role, sourceVersion, document })) } }
export async function writeCanvas(store, access, group, idea, input, { now = new Date(), submissionsOpen = false } = {}) {
    assertScope(access, group, idea)
    if (!input || Object.keys(input).some(k => !['action', 'requestId', 'expectedVersion', 'expectedSeat', 'document', 'sourceVersion'].includes(k)) || !['draft', 'submit', 'fork', 'restore'].includes(input.action) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId || '') || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) throw new CanvasError('Invalid drawing request.')
    if (!teacher(access) && input.expectedSeat !== access.seat) throw new CanvasError('Your class account changed. Your device copy is kept.', 403)
    if (input.action === 'restore' && !teacher(access)) throw new CanvasError('Ask your teacher to restore an earlier shared revision.', 403)
    const id = canvasId(group, idea), old = await store.findOne({ _id: id }), row = old || empty(group, idea), actor = teacher(access) ? access.userId : access.seat
    const hash = createHash('sha256').update(JSON.stringify({ action: input.action, document: input.document || null, sourceVersion: input.sourceVersion || null })).digest('hex')
    const duplicate = row.receipts.find(r => r.requestId === input.requestId)
    if (duplicate) { if (duplicate.hash !== hash || duplicate.actor !== actor) throw new CanvasError('This receipt belongs to a different drawing request.', 409); return { ...canvasView(row), saved: true, requestId: input.requestId, ackVersion: duplicate.version } }
    if (row.version !== input.expectedVersion) throw new CanvasError('Another group member saved a newer drawing. Compare both before continuing.', 409)
    if (input.action === 'submit' && !submissionsOpen) throw new CanvasError('Your teacher has paused submissions. Save a draft instead.', 409)
    if (['draft', 'submit'].includes(input.action) && row.status === 'submitted') throw new CanvasError('The submitted drawing is read-only. Start a new revision first.', 409)
    if (input.action === 'fork' && row.status !== 'submitted') throw new CanvasError('This drawing is already an editable draft.', 409)
    const restore = input.action === 'restore' ? row.revisions.find(r => r.version === input.sourceVersion) : null
    if (input.action === 'restore' && !restore) throw new CanvasError('Choose an existing saved revision.')
    const proposed = restore?.document || (input.action === 'fork' ? row.document : input.document)
    if (!validCanvas(proposed)) throw new CanvasError('Drawing is invalid or too large. Keep the device copy and ask your teacher for help.')
    if (!referenceMatchesIdea(proposed.reference, group, idea)) throw new CanvasError('Use the illustration for this group and idea.')
    const document = copyCanvas(proposed)
    if (input.action === 'submit' && !document.objects.length) throw new CanvasError('Add your design before submitting.')
    const version = row.version + 1, status = input.action === 'submit' ? 'submitted' : 'draft', at = now.toISOString(), revision = { version, action: input.action, at, role: teacher(access) ? 'teacher' : 'group member', sourceVersion: restore?.version || (input.action === 'fork' ? row.version : null), document }
    const next = { ...row, version, status, document, updatedAt: at, revisions: [...row.revisions, revision], receipts: [...row.receipts, { requestId: input.requestId, actor, hash, version }] }
    if (Buffer.byteLength(JSON.stringify(next)) > CANVAS_LIMITS.historyBytes) throw new CanvasError('Drawing history is full. No history was removed. Keep your device copy and ask your teacher to export it.', 413)
    try { if (!old) await store.insertOne(next); else if (!(await store.replaceOne({ _id: id, version: row.version }, next)).modifiedCount) throw new CanvasError('Another group member saved first. Compare before continuing.', 409) } catch (error) { if (error.code === 11000) throw new CanvasError('Another group member saved first. Compare before continuing.', 409); throw error }
    return { ...canvasView(next), saved: true, requestId: input.requestId, ackVersion: version }
}
