import { blankCanvas, copyCanvas, validCanvas, sameCanvas } from './workshopCanvasModel'

// Immutable requests and acknowledgement versions distinguish durable saves from newer edits.
// Device branches are seat-scoped; the server document is group-scoped.
export class CanvasDraft {
    constructor({ key, seat, request, storage, emit = () => {}, uuid = () => crypto.randomUUID(), online = () => true }) {
        Object.assign(this, { key, seat, request, storage, emit, uuid, online, writer: uuid(), active: true, busy: false })
        this.state = { document: blankCanvas(), version: 0, status: 'draft', dirty: false, pending: null, undo: [], redo: [], ready: false, conflict: null, message: 'Opening drawing…', warning: '', history: [] }
        try { const local = JSON.parse(storage.getItem(key)); if (local?.seat === seat && validCanvas(local.document) && Number.isSafeInteger(local.version)) this.state = { ...this.state, ...local, ready: false, conflict: null, warning: '', message: 'Recovering device copy…', undo: (local.undo || []).filter(validCanvas).slice(-20), redo: (local.redo || []).filter(validCanvas).slice(-20) } } catch { this.state.warning = 'Device recovery is unavailable. Keep this tab open until a server save is confirmed.' }
        this.state.recoveryCopies = []
        try { for (let i = 0; i < storage.length; i++) { const name = storage.key(i); if (!name?.startsWith(key + ':branch:')) continue; const saved = JSON.parse(storage.getItem(name)); if (saved?.seat === seat && saved.dirty && validCanvas(saved.document) && !sameCanvas(saved.document, this.state.document) && !this.state.recoveryCopies.some(r => sameCanvas(r.document, saved.document))) this.state.recoveryCopies.push({ document: saved.document, version: saved.version, local: true }) } } catch { /* head recovery remains available */ }
    }
    notify() { if (this.active) this.emit({ ...this.state }) }
    persist() {
        const value = { ...this.state, recoveryCopies: [], seat: this.seat, writer: this.writer, ready: false, conflict: null, message: '', warning: '' }
        // Keep recent gesture undo within a bounded device budget; server history is never pruned.
        while (JSON.stringify(value).length > 750000 && value.undo.length) value.undo = value.undo.slice(1)
        this.state.undo = value.undo
        try { const serial = JSON.stringify(value); this.storage.setItem(this.key + ':branch:' + this.writer, serial); this.storage.setItem(this.key, serial); this.state.warning = '' }
        catch { this.state.warning = 'Device storage is full or blocked. Download a device copy now; keep this tab open until Saved to class appears.' }
    }
    close() { this.active = false }
    compareRecovery(index) { const row = this.state.recoveryCopies[index]; if (row) { this.state.conflict = row; this.state.message = 'Compare this earlier device copy with your current drawing.'; this.notify() } }
    async open() {
        try {
            const row = await this.request(); if (!this.active) return
            this.verify(row)
            if (this.state.pending) { this.state.ready = true; await this.save(); return }
            if (this.state.dirty && this.state.version !== row.version && !sameCanvas(this.state.document, row.document)) this.state.conflict = row
            else if (!this.state.dirty || sameCanvas(this.state.document, row.document)) this.accept(row)
            this.state.ready = true; this.state.message = this.state.conflict ? 'Compare two saved copies before continuing.' : this.state.dirty ? 'Recovered device copy. Waiting to save.' : row.status === 'submitted' ? 'Submitted · read-only' : 'Saved to class'
        } catch (e) { if (!this.active) return; this.state.ready = true; this.state.message = 'Offline or session unavailable. Your device copy is kept.'; this.state.blocked = [401, 403].includes(e.status) }
        this.notify()
    }
    verify(row) { if (row.seat !== this.seat || !validCanvas(row.document) || !Number.isSafeInteger(row.version)) { const e = Error('Your session changed or the drawing response was incomplete.'); e.status = 403; throw e } }
    accept(row) { Object.assign(this.state, { document: copyCanvas(row.document), version: row.version, status: row.status, history: row.history, dirty: false, pending: null, conflict: null, blocked: false }); this.persist() }
    edit(doc, { checkpoint = true } = {}) {
        if (!this.active || !this.state.ready || this.state.status === 'submitted' || this.state.conflict || this.state.blocked) return false
        if (!validCanvas(doc)) { this.state.message = 'Drawing limit reached. Undo or remove a mark, then try again.'; this.notify(); return false }
        if (sameCanvas(doc, this.state.document)) return true
        if (checkpoint) this.state.undo = [...this.state.undo, copyCanvas(this.state.document)].slice(-20)
        Object.assign(this.state, { document: copyCanvas(doc), redo: [], dirty: true, message: this.online() ? 'Saved on this device · waiting for class save' : 'Offline · device copy waiting to save to class' })
        this.persist(); if (this.state.warning) this.state.message = 'Drawing is in memory only · waiting for class save'; this.notify(); return true
    }
    checkpoint(doc) { if (!sameCanvas(doc, this.state.document)) { this.state.undo = [...this.state.undo, copyCanvas(doc)].slice(-20); this.persist(); this.notify() } }
    undo(redo = false) {
        if (this.state.conflict || this.state.status === 'submitted' || this.state.blocked) return
        const source = redo ? 'redo' : 'undo', dest = redo ? 'undo' : 'redo', stack = this.state[source]; if (!stack.length) return
        this.state[dest] = [...this.state[dest], copyCanvas(this.state.document)].slice(-20); this.state.document = stack.at(-1); this.state[source] = stack.slice(0, -1); this.state.dirty = true; this.state.message = 'Saved on this device · waiting for class save'; this.persist(); this.notify()
    }
    async save(action = 'draft') {
        if (!this.active || this.busy || this.state.conflict || this.state.blocked || !this.state.ready) return false
        if (!this.state.pending && action === 'draft' && !this.state.dirty) return true
        if (this.state.pending && this.state.pending.action !== action && action !== 'draft') { if (!await this.save()) return false; return this.save(action) }
        const payload = this.state.pending || { action, requestId: this.uuid(), expectedVersion: this.state.version, expectedSeat: this.seat, ...(['draft', 'submit'].includes(action) ? { document: copyCanvas(this.state.document) } : {}) }
        this.state.pending = payload; this.busy = true; this.state.message = 'Saving to class…'; this.persist(); this.notify()
        try {
            const row = await this.request(payload); if (!this.active) return false
            this.verify(row)
            if (!row.saved || row.requestId !== payload.requestId || !Number.isSafeInteger(row.ackVersion)) throw Error('No matching save receipt')
            this.state.pending = null
            if (row.version !== row.ackVersion) { this.state.conflict = row; this.state.message = 'Your save arrived, then another member saved. Compare both copies.' }
            else {
                const changed = payload.document && !sameCanvas(this.state.document, payload.document)
                if (changed) { this.state.version = row.version; this.state.history = row.history; this.state.dirty = true; this.state.message = 'Earlier changes saved · newer changes waiting'; if (row.status === 'submitted') this.state.conflict = row }
                else { this.accept(row); this.state.message = row.status === 'submitted' ? 'Submitted · read-only' : 'Saved to class' }
            }
            this.persist(); return !this.state.conflict
        } catch (e) {
            if (!this.active) return false
            if (e.status === 409) {
                try { const row = await this.request(); if (!this.active) return false; this.verify(row); this.state.conflict = row; this.state.pending = null; this.state.message = e.message || 'Compare both copies before continuing.' } catch { this.state.message = 'Could not compare yet. Device copy and save request are kept.' }
            } else if ([400, 401, 403, 413].includes(e.status)) { this.state.pending = null; this.state.blocked = [401, 403].includes(e.status); this.state.message = e.message || 'Save needs attention. Your device copy is kept.' }
            else this.state.message = 'Offline or save unconfirmed. Device copy kept; retry Save draft.'
            this.persist(); return false
        } finally { this.busy = false; this.notify() }
    }
    receiveLocal(serial) {
        try { const other = JSON.parse(serial); if (!other || other.writer === this.writer || other.seat !== this.seat || !validCanvas(other.document) || sameCanvas(other.document, this.state.document)) return; this.state.conflict = { ...other, local: true }; this.state.message = 'Another tab has a different device copy. Compare before continuing.'; this.notify() } catch { /* unrelated or incomplete storage write */ }
    }
    async resolve(keepMine) {
        if (this.busy || !this.state.conflict) return
        const mine = copyCanvas(this.state.document), other = this.state.conflict
        try {
            const row = await this.request(); if (!this.active) return; this.verify(row)
            // Decisions about a server version must be repeated if it changed during comparison.
            if (!other.local && row.version !== other.version) { this.state.conflict = row; this.state.message = 'The class copy changed again. Compare the latest copy.'; this.notify(); return }
            const chosen = keepMine ? mine : other.local ? other.document : row.document
            this.accept(row); this.state.undo = []; this.state.redo = []
            if (!sameCanvas(chosen, row.document)) { if (row.status === 'submitted') { this.state.document = chosen; this.state.conflict = row; this.state.message = 'The class copy was submitted. Download your device copy and ask your teacher to restore an editable revision.' } else this.edit(chosen) }
            else this.state.message = row.status === 'submitted' ? 'Submitted · read-only' : 'Saved to class'
            this.persist(); this.notify()
        } catch { this.state.message = 'Connect to compare with the latest class copy. Both copies are kept.'; this.notify() }
    }
}
