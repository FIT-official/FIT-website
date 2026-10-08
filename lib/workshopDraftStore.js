import { createHash } from 'node:crypto'
import { validSeat, groupForSeat, CLASS_EXPIRY } from './workshopCredentials'
import { WORKSHOP_SESSION } from './workshopFeedback'
export const DRAFT_TOPICS = Array.from({ length: 10 }, (_, i) => ['1', '2'].flatMap(idea => ['feedback-g' + (i + 1) + '-idea' + idea, 'refinement-g' + (i + 1) + '-idea' + idea])).flat()
export const DRAFT_SNAPSHOTS = 8
export class DraftError extends Error { constructor(message, status = 400) { super(message); this.status = status } }
export const draftId = (seat, topic) => WORKSHOP_SESSION + ':' + seat + ':' + topic
export function draftTopics(seat) { const group = groupForSeat(seat); return DRAFT_TOPICS.filter(topic => topic.startsWith('refinement-' + group + '-') || topic.startsWith('feedback-') && !topic.startsWith('feedback-' + group + '-')) }
export function validateDraft(access, input) {
    if (access.role !== 'student' || !validSeat(access.seat) || access.group !== groupForSeat(access.seat) || !input || input.seat !== access.seat) throw new DraftError('Use your current student seat. Your draft is kept.', 403)
    if (Object.keys(input).some(key => !['seat', 'topic', 'expectedVersion', 'requestId', 'content'].includes(key)) || !draftTopics(access.seat).includes(input.topic) || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 0 || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId || '')) throw new DraftError('Invalid draft request.')
    const text = value => { if (typeof value !== 'string' || value.length > 600 || /https?:\/\/|\b[^\s@]+@[^\s@]+\.[^\s@]+\b|[\u0000-\u0008]/i.test(value)) throw new DraftError('Keep contact details and private links out of draft answers. Your local draft is kept.'); return value }
    const fields = ['feedbackUsed', 'change', 'reason', 'test']
    if (input.topic.startsWith('refinement-')) {
        if (!input.content || Object.keys(input.content).some(k => !fields.includes(k))) throw new DraftError('Invalid idea draft.')
        return Object.fromEntries(fields.map(k => [k, text(input.content[k])]))
    }
    if (!input.content || Object.keys(input.content).some(k => !['idea', 'whatWorks', 'question', 'improvement'].includes(k)) || input.content.idea !== input.topic.slice(-1)) throw new DraftError('Invalid feedback draft.')
    return { idea: input.content.idea, ...Object.fromEntries(['whatWorks', 'question', 'improvement'].map(k => [k, text(input.content[k])])) }
}
export async function saveWorkshopDraft(store, access, input, now = new Date()) {
    const content = validateDraft(access, input), id = draftId(access.seat, input.topic), hash = createHash('sha256').update(JSON.stringify(content)).digest('hex')
    if (now >= CLASS_EXPIRY) throw new DraftError('The class session expired. Your local draft is kept.', 410)
    const old = await store.findOne({ _id: id })
    const duplicate = (old?.receipts || old?.snapshots || []).find(row => row.requestId === input.requestId)
    if (duplicate) { if (duplicate.hash !== hash) throw new DraftError('This draft receipt belongs to other text.', 409); return { saved: true, version: duplicate.version, unchanged: true } }
    if ((old?.version || 0) !== input.expectedVersion) throw new DraftError('Another tab or device saved a newer draft. Compare before replacing it.', 409)
    if (old?.snapshots.at(-1)?.hash === hash) return { saved: true, version: old.version, unchanged: true }
    const version = (old?.version || 0) + 1, row = { version, requestId: input.requestId, savedAt: now.toISOString(), content, hash }
    const next = { _id: id, seat: access.seat, group: access.group, topic: input.topic, version, expiresAt: CLASS_EXPIRY, updatedAt: row.savedAt, snapshots: [...(old?.snapshots || []), row].slice(-DRAFT_SNAPSHOTS), receipts: [...(old?.receipts || old?.snapshots || []).map(({ requestId, hash, version }) => ({ requestId, hash, version })), { requestId: row.requestId, hash, version }].slice(-32) }
    try { if (!old) await store.insertOne(next); else if (!(await store.replaceOne({ _id: id, version: old.version }, next)).modifiedCount) throw new DraftError('Another tab saved this draft first. Your local draft is kept.', 409) }
    catch (error) { if (error.code === 11000) throw new DraftError('Another tab saved this draft first. Your local draft is kept.', 409); throw error }
    return { saved: true, version }
}
export const draftView = row => row && ({ topic: row.topic, version: row.version, updatedAt: row.updatedAt, snapshots: row.snapshots.map(({ hash, requestId, ...snapshot }) => snapshot) })
