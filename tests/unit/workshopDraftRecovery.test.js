import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { DraftController } from '@/components/Workshop/draftController'
import { saveWorkshopDraft, draftTopics, draftView } from '@/lib/workshopDraftStore'
const access = { role: 'student', seat: 'group2student1', group: 'g2' }, now = new Date('2026-10-09T02:00:00Z'), topic = 'feedback-g3-idea1'
const blank = () => ({ idea: '1', whatWorks: '', question: '', improvement: '', receipt: null, pending: false, payload: null })
function store() { const rows = new Map(); return { findOne: async q => rows.get(q._id) ? structuredClone(rows.get(q._id)) : null, insertOne: async row => { if (rows.has(row._id)) throw Object.assign(Error(), { code: 11000 }); rows.set(row._id, structuredClone(row)) }, replaceOne: async (q, row) => { if (rows.get(q._id)?.version !== q.version) return { modifiedCount: 0 }; rows.set(q._id, structuredClone(row)); return { modifiedCount: 1 } } } }
const models = []
function model(extra = {}) { const storage = new Map(), config = { key: 'seat-topic', seat: access.seat, topic, enabled: true, create: blank, online: () => true, load: async () => [], save: vi.fn(async () => ({ version: 1 })), storage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) }, onChange: vi.fn(), ...extra }; const result = new DraftController(config); models.push(result); return result }
afterEach(() => { for (const row of models.splice(0)) row.close(); vi.useRealTimers() })
describe('bounded individual draft recovery', () => {
    it('keeps eight snapshots and acknowledges retries beyond the visible history window', async () => {
        const db = store(), requests = []
        for (let i = 0; i < 12; i++) { const payload = { seat: access.seat, topic, requestId: randomUUID(), expectedVersion: i, content: { idea: '1', whatWorks: 'draft ' + i, question: '', improvement: '' } }; requests.push(payload); await saveWorkshopDraft(db, access, payload, now) }
        const record = await db.findOne({ _id: '2026-10-09:' + access.seat + ':' + topic })
        expect(record.snapshots).toHaveLength(8); expect(record.receipts).toHaveLength(12)
        expect(await saveWorkshopDraft(db, access, requests[0], now)).toMatchObject({ version: 1, unchanged: true })
        expect(JSON.stringify(draftView(record))).not.toContain('requestId'); expect(JSON.stringify(draftView(record))).not.toContain('hash')
    })
    it('rejects changed request reuse, stale versions, wrong seat, self-review target and expired writes', async () => {
        const db = store(), payload = { seat: access.seat, topic, requestId: randomUUID(), expectedVersion: 0, content: { idea: '1', whatWorks: 'draft', question: '', improvement: '' } }
        await saveWorkshopDraft(db, access, payload, now)
        await expect(saveWorkshopDraft(db, access, { ...payload, content: { ...payload.content, whatWorks: 'different' } }, now)).rejects.toMatchObject({ status: 409 })
        await expect(saveWorkshopDraft(db, access, { ...payload, requestId: randomUUID() }, now)).rejects.toMatchObject({ status: 409 })
        await expect(saveWorkshopDraft(db, access, { ...payload, seat: 'group2student2' }, now)).rejects.toMatchObject({ status: 403 })
        await expect(saveWorkshopDraft(db, access, { ...payload, topic: 'feedback-g2-idea1' }, now)).rejects.toMatchObject({ status: 400 })
        await expect(saveWorkshopDraft(db, access, payload, new Date('2026-10-11T00:00:00Z'))).rejects.toMatchObject({ status: 410 })
        expect(draftTopics(access.seat)).toHaveLength(20); expect(draftTopics(access.seat)).not.toContain('refinement-g1-idea1')
    })
    it('preserves both idea draft identities and accepts incomplete semantic snapshots but no credential fields', async () => {
        const db = store()
        for (const number of [1, 2]) await saveWorkshopDraft(db, access, { seat: access.seat, topic: 'refinement-g2-idea' + number, requestId: randomUUID(), expectedVersion: 0, content: { feedbackUsed: '', change: 'idea ' + number, reason: '', test: '' } }, now)
        expect((await db.findOne({ _id: '2026-10-09:group2student1:refinement-g2-idea1' })).snapshots[0].content.change).toBe('idea 1')
        await expect(saveWorkshopDraft(db, access, { seat: access.seat, topic, requestId: randomUUID(), expectedVersion: 0, content: { idea: '1', whatWorks: '', question: '', improvement: '', password: 'private' } }, now)).rejects.toMatchObject({ status: 400 })
    })
    it('acknowledges an in-flight save despite typing and later saves the newer buffer', async () => {
        vi.useFakeTimers(); let resolve; const saves = [], row = model({ save: payload => { saves.push(structuredClone(payload)); return saves.length === 1 ? new Promise(done => { resolve = done }) : Promise.resolve({ version: 2 }) } }); row.ready = true
        row.edit({ ...row.draft, whatWorks: 'first' }); const request = row.autosave(); row.edit({ ...row.draft, whatWorks: 'second' }); resolve({ version: 1 }); await request
        expect(row.serverVersion).toBe(1); expect(row.draft.whatWorks).toBe('second'); await vi.advanceTimersByTimeAsync(6000); expect(saves).toHaveLength(2); expect(saves[1].content.whatWorks).toBe('second')
    })
    it('retries a temporary initial read failure while still online', async () => {
        vi.useFakeTimers(); const load = vi.fn().mockRejectedValueOnce(Object.assign(Error('temporary'), { status: 503 })).mockResolvedValue([]), row = model({ load }); row.start(); await Promise.resolve(); await vi.advanceTimersByTimeAsync(4000); expect(load).toHaveBeenCalledTimes(2); expect(row.ready).toBe(true)
    })
    it('persists and reconstructs the identical immutable request after a lost response', async () => {
        vi.useFakeTimers(); const values = new Map(), storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) }, row = model({ storage, save: async () => { throw Error('response lost') } }); row.ready = true; row.edit({ ...row.draft, whatWorks: 'recover me' }); await row.autosave(); const pending = row.pendingServer; row.close()
        const save = vi.fn(async () => ({ version: 1 })), recovered = model({ storage, save }); await recovered.recover(); expect(save.mock.calls[0][0]).toEqual(pending); expect(recovered.pendingServer).toBeNull(); expect(recovered.draft.whatWorks).toBe('recover me')
    })
    it('discards late history responses after account closure', async () => {
        let resolve; const emit = vi.fn(), row = model({ onChange: emit, load: () => new Promise(done => { resolve = done }) }), pending = row.compare(); row.close(); const count = emit.mock.calls.length; resolve([{ topic, version: 9, snapshots: [] }]); await pending; expect(emit).toHaveBeenCalledTimes(count); expect(row.remote).toBeNull()
    })
    it('bounds semantic undo history and cannot undo a submitted receipt', () => {
        vi.useFakeTimers(); const row = model({ enabled: false }); for (let i = 0; i < 40; i++) { vi.advanceTimersByTime(900); row.edit({ ...row.draft, whatWorks: String(i) }) } expect(row.undoStack).toHaveLength(30); row.undo(); expect(row.draft.whatWorks).toBe('38'); row.redo(); expect(row.draft.whatWorks).toBe('39'); row.edit({ ...row.draft, receipt: { confirmed: true, receipt: 'fixed' } }); row.undo(); expect(row.draft.whatWorks).toBe('39')
    })
    it('requires a fresh comparison after a second detected writer change', async () => {
        const row = model({ enabled: false }); row.compared = true; row.storage.setItem(row.key, JSON.stringify({ writer: 'another', revision: 100 })); row.persist(); expect(row.blocked).toBe(true); expect(row.compared).toBe(false); row.rebase(); expect(row.blocked).toBe(true); await row.compare(); row.rebase(); expect(row.blocked).toBe(false)
    })
    it('falls back safely for corrupt refinement storage and closes every retry timer', () => {
        const row = model({ topic: 'refinement', enabled: false, create: () => ({ ideas: [0, 1].map(() => ({ feedbackUsed: '', change: '', reason: '', test: '' })) }), storage: { getItem: () => '{"draft":{"ideas":null},"undo":42}', setItem: vi.fn() } }); expect(row.draft.ideas).toHaveLength(2); expect(row.undoStack).toEqual([]); row.close(); expect(row.closed).toBe(true)
    })
})
