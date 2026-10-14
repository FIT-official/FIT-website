import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { DraftController } from '@/components/Workshop/draftController'
import { draftStatus } from '@/components/Workshop/DraftHistory'
import { emptyRefinement, refinementFields } from '@/lib/workshopRefinement'
import { saveWorkshopDraft, draftId } from '@/lib/workshopGuestDraftStore'
import { emptyLesson, submitClassroom, moderateClassroom } from '@/lib/workshopGuestClassroomStore'
import { newGuest, guestAccess } from '@/lib/workshopGuestIdentity'

const now = new Date('2026-10-16T00:00:00Z'), access = guestAccess(newGuest('g2', 'Synthetic learner', now).record, now)
const topic = 'refinement-g2-idea1', models = []
function storage() { const rows = new Map(); return { get length() { return rows.size }, key: i => [...rows.keys()][i], getItem: k => rows.get(k) || null, setItem: (k, v) => rows.set(k, v) } }
function model(extra = {}) {
    const row = new DraftController({ key: 'fit:guest:2026-10-09:' + access.seat + ':' + topic, seat: access.seat, topic, create: emptyRefinement, enabled: true, online: () => true, storage: storage(), load: async () => [], save: vi.fn(async () => ({ saved: true, version: 1 })), onChange: vi.fn(), ...extra })
    models.push(row); return row
}
function store(initial) { const rows = new Map(initial ? [[initial._id, structuredClone(initial)]] : []); return { findOne: async q => structuredClone(rows.get(q._id) || null), insertOne: async row => { if (rows.has(row._id)) throw Object.assign(Error(), { code: 11000 }); rows.set(row._id, structuredClone(row)) }, replaceOne: async (q, row) => { if (rows.get(q._id)?.version !== q.version) return { modifiedCount: 0 }; rows.set(q._id, structuredClone(row)); return { modifiedCount: 1 } } } }
afterEach(() => { for (const model of models.splice(0)) model.close(); vi.useRealTimers() })

describe('Friday durable refinement drafts', () => {
    it('does not mark identical content conflicted when another tab opens or acknowledges it', async () => {
        const shared = storage(), first = model({ storage: shared })
        first.edit({ ...first.draft, problemStatement: 'Same content' })
        const second = model({ storage: shared }); second.persist(); first.otherTab(shared.getItem(first.key))
        expect(first.blocked).toBe(false)
        first.edit({ ...first.draft, problemStatement: 'First new edit' }); second.otherTab(shared.getItem(first.key))
        expect(second.blocked).toBe(true)
    })
    it('recovers the final keystroke immediately after abrupt abandonment, without timers or close()', () => {
        vi.useFakeTimers(); const shared = storage(), old = model({ storage: shared, online: () => false })
        old.edit({ ...old.draft, problemStatement: 'A handle that stays dry: final keystroke!' })
        const recovered = model({ storage: shared })
        expect(recovered.draft.problemStatement).toBe('A handle that stays dry: final keystroke!')
        expect(recovered.undoStack).toHaveLength(1)
    })
    it('queues offline edits and receives a server acknowledgement after reconnect without submitting', async () => {
        vi.useFakeTimers(); let online = false; const row = model({ online: () => online }); row.ready = true
        row.edit({ ...row.draft, problemStatement: 'Offline statement', illustrationNotes: 'Label the grip' }); await row.autosave()
        expect(row.save).not.toHaveBeenCalled(); expect(row.status).toMatch(/^Offline/)
        online = true; row.retry(); await vi.advanceTimersByTimeAsync(1)
        expect(row.save).toHaveBeenCalledOnce(); expect(row.status).toMatch(/^Autosaved draft/); expect(row.draft.receipt).toBeUndefined()
    })
    it('never calls current text saved while only an older in-flight version is acknowledged', async () => {
        let finish; const row = model({ save: () => new Promise(resolve => { finish = resolve }) }); row.ready = true
        row.edit({ ...row.draft, problemStatement: 'Before' }); const pending = row.autosave()
        row.edit({ ...row.draft, problemStatement: 'After' }); finish({ saved: true, version: 1 }); await pending
        expect(draftStatus(row.status)).toMatch(/Saving draft/); expect(row.draft.problemStatement).toBe('After')
    })
    it('surfaces local storage failure even when the server accepts a snapshot', async () => {
        const emit = vi.fn(), row = model({ onChange: emit, storage: { getItem: () => null, setItem: () => { throw Error('quota') } } }); row.ready = true
        row.edit({ ...row.draft, problemStatement: 'Do not lose this' }); await row.autosave()
        expect(emit.mock.calls.at(-1)[0]).toMatchObject({ storageError: true, localSaved: false })
        expect(draftStatus(emit.mock.calls.at(-1)[0].status)).toMatch(/only copy/)
        expect(row.serverVersion).toBe(1)
    })
    it('keeps both tabs in durable copies and recovers a conflicted tab after reload without overwriting the head', async () => {
        vi.useFakeTimers(); const shared = storage(), first = model({ storage: shared }), second = model({ storage: shared })
        first.edit({ ...first.draft, problemStatement: 'First tab' })
        second.edit({ ...second.draft, problemStatement: 'Second tab' })
        expect(second.blocked).toBe(true); expect(JSON.parse(shared.getItem(first.key)).draft.problemStatement).toBe('First tab')
        const reopened = model({ storage: shared }); expect(reopened.draft.problemStatement).toBe('Second tab'); expect(reopened.blocked).toBe(true)
        await reopened.recover(); expect(JSON.parse(shared.getItem(first.key)).draft.problemStatement).toBe('First tab')
        await reopened.compare(); expect(reopened.localBranches.map(r => r.draft.problemStatement)).toEqual(expect.arrayContaining(['First tab', 'Second tab']))
        reopened.rebase(); expect(reopened.blocked).toBe(false)
    })
    it('isolates another account and discards acknowledgement after the original controller closes', async () => {
        const shared = storage(); let finish; const first = model({ storage: shared, save: () => new Promise(resolve => { finish = resolve }) }); first.ready = true
        first.edit({ ...first.draft, problemStatement: 'Private synthetic draft' }); const pending = first.autosave(); first.close()
        const other = model({ storage: shared, key: 'fit:guest:2026-10-09:another-seat:' + topic, seat: 'another-seat' })
        expect(other.draft.problemStatement).toBe(''); expect(other.localBranches).toEqual([])
        finish({ saved: true, version: 9 }); await pending; expect(first.serverVersion).toBe(0)
    })
    it('undo and redo preserve an earlier legacy draft and save the restored value as another revision', async () => {
        const row = model({ create: () => ({ feedbackUsed: '', change: 'old', reason: '', test: '' }) }); row.ready = true
        row.edit({ ...row.draft, problemStatement: 'Added field' }); row.undo(); expect(row.draft.problemStatement).toBeUndefined()
        row.redo(); expect(row.draft.problemStatement).toBe('Added field'); await row.autosave()
        expect(row.save.mock.calls[0][0].content.problemStatement).toBe('Added field')
    })
    it('retains over thirty-two append-only snapshots and retry receipts without an expiry deletion field', async () => {
        const db = store(); let first
        for (let i = 0; i < 40; i++) { const input = { seat: access.seat, topic, expectedVersion: i, requestId: randomUUID(), content: { ...emptyRefinement(), problemStatement: 'Statement ' + i } }; first ||= input; await saveWorkshopDraft(db, access, input, now) }
        const row = await db.findOne({ _id: draftId(access.seat, topic) })
        expect(row.snapshots).toHaveLength(40); expect(row.receipts).toHaveLength(40); expect(row.expiresAt).toBeUndefined()
        expect(row.snapshots[0].content.problemStatement).toBe('Statement 0')
        expect(await saveWorkshopDraft(db, access, first, now)).toMatchObject({ unchanged: true, version: 1 })
    })
    it('concurrent saves preserve one version and reject the stale writer; quota never trims history', async () => {
        const db = store(), input = { seat: access.seat, topic, expectedVersion: 0, requestId: randomUUID(), content: emptyRefinement() }
        const results = await Promise.allSettled([saveWorkshopDraft(db, access, input, now), saveWorkshopDraft(db, access, { ...input, requestId: randomUUID(), content: { ...input.content, problemStatement: 'Other' } }, now)])
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
        const row = await db.findOne({ _id: draftId(access.seat, topic) }); row.retainedLegacyField = 'x'.repeat(8_000_000); await db.replaceOne({ _id: row._id, version: row.version }, row)
        await expect(saveWorkshopDraft(db, access, { ...input, requestId: randomUUID(), expectedVersion: row.version, content: { ...input.content, problemStatement: 'New' } }, now)).rejects.toMatchObject({ status: 413 })
        expect((await db.findOne({ _id: row._id })).snapshots).toEqual(row.snapshots)
    })
    it('keeps v3 two-idea submissions separate from drafts and retains originals through moderation', async () => {
        const db = store({ ...emptyLesson(), refinementOpen: true }), draftDb = store(), ideas = [1, 2].map(i => Object.fromEntries(refinementFields.map(key => [key, key + ' idea ' + i])))
        await saveWorkshopDraft(draftDb, access, { seat: access.seat, topic, expectedVersion: 0, requestId: randomUUID(), content: { ...emptyRefinement(), ...ideas[0] } }, now)
        expect((await db.findOne({ _id: '2026-10-09' })).refinements).toEqual([])
        const input = { kind: 'refinement', promptVersion: 3, submissionId: randomUUID(), phaseVersion: 0, expectedVersion: 0, expectedEntryVersion: 0, ideas }
        const receipt = await submitClassroom(db, access, input, now); expect(receipt.confirmed).toBe(true)
        expect(await submitClassroom(db, access, input, now)).toEqual(receipt)
        const updated = structuredClone(ideas); updated[0].problemStatement = 'Teacher clarification'
        await moderateClassroom(db, { role: 'teacher', userId: 'synthetic-teacher' }, { action: 'refinement', id: input.submissionId, expectedEntryVersion: 1, visibility: 'visible', edit: { ideas: updated } }, now)
        const state = await db.findOne({ _id: '2026-10-09' })
        expect(state.refinements).toHaveLength(1); expect(state.refinements[0].ideas).toHaveLength(2)
        expect(state.audit.at(-1).before.ideas[0].problemStatement).toBe(ideas[0].problemStatement)
        expect((await draftDb.findOne({ _id: draftId(access.seat, topic) })).snapshots[0].content.problemStatement).toBe(ideas[0].problemStatement)
    })
})
