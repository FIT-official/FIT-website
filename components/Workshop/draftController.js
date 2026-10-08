const revisionFields = ['feedbackUsed', 'change', 'reason', 'test'], feedbackFields = ['idea', 'whatWorks', 'question', 'improvement']
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
export function editableContent(draft, topic) { return topic === 'refinement' ? { ideas: draft.ideas.map(idea => Object.fromEntries(revisionFields.map(key => [key, idea[key]]))) } : Object.fromEntries((topic.startsWith('refinement-') ? revisionFields : feedbackFields).map(key => [key, draft[key]])) }
function content(value, topic) { try { return editableContent(value, topic) } catch { return null } }
function valid(value, topic) { try { const values = topic === 'refinement' ? value.ideas.flatMap(idea => revisionFields.map(key => idea[key])) : (topic.startsWith('refinement-') ? revisionFields : feedbackFields).map(key => value[key]); return (topic !== 'refinement' || value.ideas.length === 2) && values.every(text => typeof text === 'string' && text.length <= 600) } catch { return false } }
function hasText(value) { return Object.entries(value).some(([key, text]) => key !== 'idea' && (typeof text === 'string' ? text.length : text.some(idea => Object.values(idea).some(Boolean)))) }
const count = value => Number.isSafeInteger(value) && value >= 0 && value < 1e9 ? value : 0
export class DraftController {
    constructor(options) {
        Object.assign(this, options); this.writer = crypto.randomUUID(); this.closed = false; this.ready = !this.enabled; this.blocked = false; this.busy = false; this.failures = 0; this.lastSaved = 0; this.lastEdit = { field: '', at: 0 }; this.remote = null; this.status = 'Restoring draft.'
        let stored; try { const raw = this.storage.getItem(this.key); if (raw?.length < 220000) stored = JSON.parse(raw) } catch { /* invalid storage never crashes recovery */ }
        if (!stored && /:feedback:g\d+:idea:[12]$/.test(this.key)) { try { const legacy = JSON.parse(this.storage.getItem(this.key.replace(/:idea:[12]$/, '')) || 'null'); if (legacy?.idea === this.topic.slice(-1)) stored = legacy } catch { /* preserve old draft */ } }
        if (!stored && /:refinement-g\d+-idea[12]$/.test(this.key)) { try { const legacy = JSON.parse(this.storage.getItem(this.key.replace(/:refinement-g\d+-idea[12]$/, ':refinement')) || 'null'), value = legacy?.draft || legacy; if (Array.isArray(value?.ideas)) stored = value.ideas[Number(this.topic.slice(-1)) - 1] } catch { /* preserve the combined legacy draft */ } }
        const candidate = stored?.draft || stored; this.draft = candidate && valid(content(candidate, this.topic), this.topic) ? candidate : this.create()
        this.undoStack = (Array.isArray(stored?.undo) ? stored.undo : []).filter(row => valid(row, this.topic)).slice(-30); this.redoStack = (Array.isArray(stored?.redo) ? stored.redo : []).filter(row => valid(row, this.topic)).slice(-30)
        this.revision = count(stored?.revision); this.observedRevision = this.revision; this.serverVersion = count(stored?.serverVersion)
        const pending = stored?.pendingServer
        this.pendingServer = pending?.seat === this.seat && pending.topic === this.topic && typeof pending.requestId === 'string' && count(pending.expectedVersion) === pending.expectedVersion && valid(pending.content, this.topic) ? pending : null
    }
    emit() { if (!this.closed) this.onChange({ key: this.key, draft: this.draft, status: this.status, canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0, conflict: this.blocked, remote: this.remote }) }
    persist() {
        if (this.closed) return
        try { const previous = JSON.parse(this.storage.getItem(this.key) || 'null'); if (previous?.writer && previous.writer !== this.writer && count(previous.revision) > this.observedRevision) { this.blocked = true; this.compared = false; this.status = 'Another tab changed this draft. Your text is kept in this page; compare before continuing.'; this.emit(); return }
            this.revision++; this.observedRevision = this.revision; this.storage.setItem(this.key, JSON.stringify({ draft: this.draft, undo: this.undoStack, redo: this.redoStack, revision: this.revision, writer: this.writer, serverVersion: this.serverVersion, pendingServer: this.pendingServer }))
        } catch { this.status = 'Browser storage unavailable. Keep this page open; server recovery will retry.' }
    }
    start() { this.emit(); if (this.enabled) this.recover(); else { this.status = 'Draft kept on this browser. Not submitted.'; this.emit() } }
    async recover() {
        if (this.closed || this.recovering) return; this.recovering = true
        try { const rows = await this.load(false); if (this.closed) return; this.remote = rows.find(row => row.topic === this.topic) || null
            if (this.pendingServer && !this.draft.receipt && !this.draft.pending) { this.ready = true; await this.autosave(); if (this.closed || this.blocked || this.pendingServer) return }
            const latest = this.remote?.snapshots.at(-1), current = editableContent(this.draft, this.topic)
            if (latest && !hasText(current) && !this.draft.pending && !this.draft.receipt) this.draft = { ...this.draft, ...latest.content }
            else if (latest && hasText(current) && !equal(current, latest.content) && this.remote.version !== this.serverVersion) { this.blocked = true; this.status = 'A newer saved draft exists. Your text is kept; compare before replacing it.' }
            this.serverVersion = Math.max(this.serverVersion, this.remote?.version || 0); this.ready = true; this.failures = 0
            if (!this.blocked) this.status = this.remote ? 'Recovered draft v' + this.serverVersion + '. Not submitted.' : 'Draft kept on this browser. Not submitted.'
            this.persist(); this.emit(); this.schedule()
        } catch (error) { if (this.closed) return; this.ready = false; this.status = error.message + ' Local draft kept; recovery will retry.'; if ([401, 403, 410].includes(error.status)) this.blocked = true; else this.scheduleRecovery(); this.emit() }
        finally { this.recovering = false }
    }
    scheduleRecovery() { clearTimeout(this.recoveryTimer); this.failures++; this.recoveryTimer = setTimeout(() => this.recover(), Math.min(60000, 2000 * 2 ** Math.min(this.failures, 4))) }
    schedule(delay) { if (this.closed || !this.enabled || this.blocked || this.draft.pending || this.draft.receipt) return; clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.autosave(), delay ?? Math.max(1500, 6000 - (Date.now() - this.lastSaved))) }
    edit(next) {
        if (this.closed) return; const before = editableContent(this.draft, this.topic), after = editableContent(next, this.topic); if (!valid(after, this.topic)) return
        if (!equal(before, after)) { this.status = 'Draft changes waiting to save.'; const field = this.topic === 'refinement' ? before.ideas.flatMap((idea, i) => Object.keys(idea).filter(key => idea[key] !== after.ideas[i][key]).map(key => i + ':' + key)).join(',') : Object.keys(before).filter(key => before[key] !== after[key]).join(','); const now = Date.now(); if (field !== this.lastEdit.field || now - this.lastEdit.at > 800) this.undoStack = [...this.undoStack, before].slice(-30); this.redoStack = []; this.lastEdit = { field, at: now } }
        const immediate = next.pending !== this.draft.pending || !equal(next.receipt, this.draft.receipt) || !equal(next.payload, this.draft.payload); this.draft = next; this.emit(); clearTimeout(this.localTimer); if (immediate) this.persist(); else this.localTimer = setTimeout(() => this.persist(), 250); this.schedule()
    }
    async autosave() {
        if (this.closed || !this.enabled || !this.ready || this.blocked || this.draft.pending || this.draft.receipt) return
        if (this.busy) { this.schedule(1500); return }
        if (!this.online()) { this.status = 'Offline. Draft kept on this browser; reconnect to autosave.'; this.emit(); this.schedule(6000); return }
        this.busy = true; this.pendingServer ||= { seat: this.seat, topic: this.topic, expectedVersion: this.serverVersion, requestId: crypto.randomUUID(), content: editableContent(this.draft, this.topic) }
        const payload = this.pendingServer; this.status = 'Autosaving unfinished draft. Not submitted.'; this.persist(); this.emit()
        try { const result = await this.save(payload); if (this.closed) return; this.serverVersion = result.version; this.pendingServer = null; this.lastSaved = Date.now(); this.failures = 0; this.status = 'Autosaved draft v' + result.version + '. Not submitted; click Submit when finished.'; this.persist(); this.emit(); if (!equal(payload.content, editableContent(this.draft, this.topic))) this.schedule(6000) }
        catch (error) { if (this.closed) return
            if ([409, 401, 403, 410].includes(error.status)) { this.blocked = true; this.compared = false; this.pendingServer = null; this.status = error.message + ' Your local text is kept.'; this.persist() }
            else if (error.status && error.status < 500 && error.status !== 429) { this.pendingServer = null; this.status = error.message + ' Local text kept; correct it before retrying.'; this.persist() }
            else { this.failures++; this.status = 'Autosave waiting. Local text kept; retrying the same request.'; this.schedule(Math.min(60000, 3000 * 2 ** Math.min(this.failures, 4))) } this.emit()
        } finally { this.busy = false }
    }
    move(direction) { const from = direction === 'undo' ? this.undoStack : this.redoStack; if (this.closed || this.draft.pending || this.draft.receipt || !from.length) return; const current = editableContent(this.draft, this.topic), restored = from.at(-1); if (direction === 'undo') { this.undoStack = from.slice(0, -1); this.redoStack = [...this.redoStack, current].slice(-30) } else { this.redoStack = from.slice(0, -1); this.undoStack = [...this.undoStack, current].slice(-30) } this.draft = { ...this.draft, ...restored }; this.lastEdit = { field: '', at: 0 }; this.persist(); this.emit(); this.schedule() }
    undo() { this.move('undo') } redo() { this.move('redo') }
    async compare() { try { const rows = await this.load(true); if (this.closed) return; this.remote = rows.find(row => row.topic === this.topic) || null; this.compared = true; this.emit() } catch (error) { if (!this.closed) { this.status = error.message; this.emit() } } }
    rebase(value) { if (this.closed || this.draft.pending || this.draft.receipt || this.busy || this.blocked && !this.compared || value && !valid(value, this.topic)) return; this.undoStack = [...this.undoStack, editableContent(this.draft, this.topic)].slice(-30); this.redoStack = []; this.serverVersion = this.remote?.version || 0; if (value) this.draft = { ...this.draft, ...value }; this.blocked = false; this.ready = true; this.pendingServer = null; try { const previous = JSON.parse(this.storage.getItem(this.key) || 'null'); this.observedRevision = count(previous?.revision); this.revision = Math.max(this.revision, this.observedRevision) } catch { /* storage unavailable */ } this.status = 'Draft restored using compared saved version. Not submitted.'; this.persist(); this.emit(); this.schedule() }
    otherTab(raw) { if (!raw || this.closed) return; try { const value = JSON.parse(raw); if (value.writer !== this.writer) { this.blocked = true; this.compared = false; this.status = 'Another tab changed this draft. Your current text is kept in this page.'; clearTimeout(this.saveTimer); this.emit() } } catch { /* malformed events never replace answers */ } }
    retry() { if (this.closed) return; if (!this.ready && !this.blocked) this.recover(); else this.schedule(0) }
    close() { this.persist(); this.closed = true; clearTimeout(this.saveTimer); clearTimeout(this.recoveryTimer); clearTimeout(this.localTimer) }
}
