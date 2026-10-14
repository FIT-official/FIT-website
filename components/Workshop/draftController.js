import { allRefinementFields } from '@/lib/workshopRefinement'
const revisionFields = allRefinementFields, feedbackFields = ['idea', 'whatWorks', 'question', 'improvement']
const optional = new Set(['problemStatement', 'solutionDescription', 'illustrationNotes'])
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const fields = (draft, keys) => Object.fromEntries(keys.filter(key => !optional.has(key) || draft[key] !== undefined).map(key => [key, draft[key]]))
const restoredDraft = (draft, restored, topic) => { const next = { ...draft }; for (const key of topic === 'refinement' ? ['ideas'] : topic.startsWith('refinement-') ? revisionFields : feedbackFields) delete next[key]; return { ...next, ...restored } }
export function editableContent(draft, topic) { return topic === 'refinement' ? { ideas: draft.ideas.map(idea => fields(idea, revisionFields)) } : fields(draft, topic.startsWith('refinement-') ? revisionFields : feedbackFields) }
function content(value, topic) { try { return editableContent(value, topic) } catch { return null } }
function valid(value, topic) {
    try {
        const rows = topic === 'refinement' ? value.ideas : [value], keys = topic.startsWith('refinement') ? revisionFields : feedbackFields
        return (topic !== 'refinement' || rows.length === 2) && rows.every(row => keys.every(key => optional.has(key) && row[key] === undefined || typeof row[key] === 'string' && row[key].length <= 600))
    } catch { return false }
}
function hasText(value) { return value && Object.entries(value).some(([key, text]) => key !== 'idea' && (typeof text === 'string' ? text.length : text?.some(idea => Object.values(idea).some(Boolean)))) }
const count = value => Number.isSafeInteger(value) && value >= 0 && value < 1e9 ? value : 0
const storageWarning = 'Browser storage is unavailable or full. This page may be the only copy of recent changes. Keep it open, copy your writing, and retry Save draft.'

export class DraftController {
    constructor(options) {
        Object.assign(this, options)
        this.writer = crypto.randomUUID(); this.branchKey = this.key + ':recovery:' + this.writer
        this.closed = false; this.ready = !this.enabled; this.blocked = false; this.busy = false; this.failures = 0; this.lastSaved = 0
        this.lastEdit = { field: '', at: 0 }; this.remote = null; this.status = 'Restoring draft.'; this.localSaved = false; this.storageError = false; this.changedAt = Date.now()
        let stored
        try { const raw = this.storage.getItem(this.key); if (raw?.length < 220000) stored = JSON.parse(raw) } catch { this.storageError = true }
        if (!stored && /:feedback:g\d+:idea:[12]$/.test(this.key)) { try { const legacy = JSON.parse(this.storage.getItem(this.key.replace(/:idea:[12]$/, '')) || 'null'); if (legacy?.idea === this.topic.slice(-1)) stored = legacy } catch { /* retain original storage */ } }
        if (!stored && /:refinement-g\d+-idea[12]$/.test(this.key)) { try { const legacy = JSON.parse(this.storage.getItem(this.key.replace(/:refinement-g\d+-idea[12]$/, ':refinement')) || 'null'), value = legacy?.draft || legacy; if (Array.isArray(value?.ideas)) stored = value.ideas[Number(this.topic.slice(-1)) - 1] } catch { /* retain the combined legacy draft */ } }
        this.localBranches = this.readBranches()
        const newest = this.localBranches.at(-1)
        if (newest && newest.updatedAt >= (stored?.updatedAt || 0) && !equal(content(newest.draft, this.topic), content(stored?.draft || stored, this.topic))) {
            stored = newest; this.blocked = true; this.status = 'Recovered a different tab draft. Compare before continuing; every recovery copy is retained.'
        }
        const candidate = stored?.draft || stored
        this.hasLocalDraft = Boolean(candidate && valid(content(candidate, this.topic), this.topic))
        this.draft = this.hasLocalDraft ? candidate : this.create()
        this.undoStack = (Array.isArray(stored?.undo) ? stored.undo : []).filter(row => valid(row, this.topic)).slice(-30)
        this.redoStack = (Array.isArray(stored?.redo) ? stored.redo : []).filter(row => valid(row, this.topic)).slice(-30)
        this.revision = count(stored?.revision); this.observedRevision = this.revision; this.serverVersion = count(stored?.serverVersion)
        this.changedAt = stored?.updatedAt || this.changedAt
        const pending = stored?.pendingServer
        this.pendingServer = pending?.seat === this.seat && pending.topic === this.topic && typeof pending.requestId === 'string' && count(pending.expectedVersion) === pending.expectedVersion && valid(pending.content, this.topic) ? pending : null
    }
    readBranches() {
        const rows = []
        try {
            for (let i = 0; i < (this.storage.length || 0); i++) {
                const key = this.storage.key(i)
                if (!key?.startsWith(this.key + ':recovery:')) continue
                const raw = this.storage.getItem(key)
                if (!raw || raw.length > 220000) continue
                try { const row = JSON.parse(raw); if (valid(content(row.draft, this.topic), this.topic)) rows.push({ ...row, key }) } catch { /* retain malformed backups */ }
            }
        } catch { this.storageError = true }
        return rows.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))
    }
    emit() {
        if (!this.closed) this.onChange({ key: this.key, draft: this.draft, status: this.storageError ? storageWarning : this.status, localSaved: this.localSaved, storageError: this.storageError, canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0, conflict: this.blocked, remote: this.remote, localBranches: this.localBranches.map(row => ({ key: row.key, savedAt: new Date(row.updatedAt || 0).toISOString(), content: editableContent(row.draft, this.topic) })) })
    }
    persist() {
        if (this.closed) return false
        const envelope = { draft: this.draft, undo: this.undoStack, redo: this.redoStack, revision: this.revision + 1, writer: this.writer, serverVersion: this.serverVersion, pendingServer: this.pendingServer, updatedAt: this.changedAt }
        try {
            // Every tab writes its own recovery copy before contending for the shared pointer.
            this.storage.setItem(this.branchKey, JSON.stringify(envelope)); this.localSaved = true
            if (this.blocked) { this.storageError = false; return false }
            let previous; try { previous = JSON.parse(this.storage.getItem(this.key) || 'null') } catch { previous = null }
            if (previous?.writer && previous.writer !== this.writer && count(previous.revision) > this.observedRevision && !equal(previous.draft, this.draft)) {
                this.blocked = true; this.compared = false; this.storageError = false
                this.status = 'Another tab changed this draft. A separate recovery copy is saved on this device; compare before continuing.'
                this.localBranches = this.readBranches(); return false
            }
            envelope.revision = Math.max(envelope.revision, count(previous?.revision) + 1)
            this.storage.setItem(this.key, JSON.stringify(envelope))
            this.revision = envelope.revision; this.observedRevision = this.revision; this.storageError = false; return true
        } catch { this.storageError = true; return false }
    }
    start() { this.emit(); if (this.enabled) this.recover(); else { this.status = 'Draft kept on this browser. Not submitted.'; this.persist(); this.emit() } }
    async recover() {
        if (this.closed || this.recovering) return; this.recovering = true
        try {
            const rows = await this.load(false); if (this.closed) return
            this.remote = rows.find(row => row.topic === this.topic) || null
            if (this.pendingServer && !this.draft.receipt && !this.draft.pending && !this.blocked) { this.ready = true; await this.autosave(); if (this.closed || this.blocked || this.pendingServer) return }
            const latest = this.remote?.snapshots.at(-1), current = editableContent(this.draft, this.topic)
            if (latest && (!this.hasLocalDraft || !hasText(current)) && !this.draft.pending && !this.draft.receipt && !this.blocked) this.draft = { ...this.draft, ...latest.content }
            else if (latest && hasText(current) && !equal(current, latest.content) && this.remote.version !== this.serverVersion) { this.blocked = true; this.status = 'A newer saved draft exists. Your text is kept; compare before replacing it.' }
            this.serverVersion = Math.max(this.serverVersion, this.remote?.version || 0); this.ready = true; this.failures = 0
            if (!this.blocked) this.status = latest && equal(editableContent(this.draft, this.topic), latest.content) ? 'Recovered draft v' + this.serverVersion + '. Not submitted.' : 'Draft changes waiting to save.'
            this.persist(); this.emit(); this.schedule()
        } catch (error) {
            if (this.closed) return; this.ready = false; this.status = error.message + ' Recovery will retry.'
            if ([401, 403, 410].includes(error.status)) this.blocked = true; else this.scheduleRecovery(); this.emit()
        } finally { this.recovering = false }
    }
    scheduleRecovery() { clearTimeout(this.recoveryTimer); this.failures++; this.recoveryTimer = setTimeout(() => this.recover(), Math.min(60000, 2000 * 2 ** Math.min(this.failures, 4))) }
    schedule(delay) { if (this.closed || !this.enabled || this.blocked || this.draft.pending || this.draft.receipt) return; clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.autosave(), delay ?? Math.max(1500, 6000 - (Date.now() - this.lastSaved))) }
    edit(next) {
        if (this.closed) return
        const before = editableContent(this.draft, this.topic), after = editableContent(next, this.topic)
        if (!valid(after, this.topic)) return
        if (!equal(before, after)) {
            this.status = this.online() ? 'Draft changes waiting to save.' : 'Offline. Draft queued on this device; reconnect to autosave.'
            const field = this.topic === 'refinement' ? before.ideas.flatMap((idea, i) => Object.keys(idea).filter(key => idea[key] !== after.ideas[i][key]).map(key => i + ':' + key)).join(',') : [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(key => before[key] !== after[key]).join(',')
            const now = Date.now()
            if (field !== this.lastEdit.field || now - this.lastEdit.at > 800) this.undoStack = [...this.undoStack, before].slice(-30)
            this.redoStack = []; this.lastEdit = { field, at: now }; this.changedAt = now
        }
        this.draft = next; this.hasLocalDraft = true; this.persist(); this.emit(); this.schedule()
    }
    async autosave() {
        if (this.closed || !this.enabled || !this.ready || this.blocked || this.draft.pending || this.draft.receipt) return
        if (this.busy) { this.schedule(1500); return }
        if (!this.online()) { this.status = 'Offline. Draft queued on this device; reconnect to autosave.'; this.persist(); this.emit(); return }
        this.busy = true
        this.pendingServer ||= { seat: this.seat, topic: this.topic, expectedVersion: this.serverVersion, requestId: crypto.randomUUID(), content: editableContent(this.draft, this.topic) }
        const payload = this.pendingServer
        this.status = 'Autosaving unfinished draft. Not submitted.'; this.persist(); this.emit()
        if (this.blocked) { this.busy = false; return }
        try {
            const result = await this.save(payload); if (this.closed) return
            if (!Number.isSafeInteger(result.version) || result.version < payload.expectedVersion || result.saved === false) throw Error('Server did not acknowledge the draft')
            this.serverVersion = result.version; this.pendingServer = null; this.lastSaved = Date.now(); this.failures = 0
            const stillDirty = !equal(payload.content, editableContent(this.draft, this.topic))
            this.status = stillDirty ? 'Draft changes waiting to save. Earlier changes were acknowledged.' : 'Autosaved draft v' + result.version + '. Not submitted; click Submit when finished.'
            this.persist(); this.emit(); if (stillDirty) this.schedule(1500)
        } catch (error) {
            if (this.closed) return
            if ([409, 401, 403, 410].includes(error.status)) { this.blocked = true; this.compared = false; this.pendingServer = null; this.status = error.message + ' Your draft is retained for comparison.'; this.persist() }
            else if (error.status && error.status < 500 && error.status !== 429) { this.pendingServer = null; this.status = error.message + ' Correct it before retrying.'; this.persist() }
            else { this.failures++; this.status = 'Autosave waiting. Retrying the same request.'; this.schedule(Math.min(60000, 3000 * 2 ** Math.min(this.failures, 4))) }
            this.emit()
        } finally { this.busy = false }
    }
    move(direction) {
        const from = direction === 'undo' ? this.undoStack : this.redoStack
        if (this.closed || this.draft.pending || this.draft.receipt || !from.length) return
        const current = editableContent(this.draft, this.topic), restored = from.at(-1)
        if (direction === 'undo') { this.undoStack = from.slice(0, -1); this.redoStack = [...this.redoStack, current].slice(-30) }
        else { this.redoStack = from.slice(0, -1); this.undoStack = [...this.undoStack, current].slice(-30) }
        this.draft = restoredDraft(this.draft, restored, this.topic); this.changedAt = Date.now(); this.lastEdit = { field: '', at: 0 }; this.status = 'Draft restored. Saving as a new revision.'
        this.persist(); this.emit(); this.schedule()
    }
    undo() { this.move('undo') }
    redo() { this.move('redo') }
    async compare() { try { const rows = await this.load(true); if (this.closed) return; this.remote = rows.find(row => row.topic === this.topic) || null; this.localBranches = this.readBranches(); this.compared = true; this.emit() } catch (error) { if (!this.closed) { this.status = error.message; this.emit() } } }
    rebase(value) {
        if (this.closed || this.draft.pending || this.draft.receipt || this.busy || this.blocked && !this.compared || value && !valid(value, this.topic)) return
        this.undoStack = [...this.undoStack, editableContent(this.draft, this.topic)].slice(-30); this.redoStack = []; this.serverVersion = this.remote?.version || 0
        if (value) this.draft = restoredDraft(this.draft, value, this.topic)
        this.blocked = false; this.ready = true; this.pendingServer = null; this.changedAt = Date.now()
        try { const previous = JSON.parse(this.storage.getItem(this.key) || 'null'); this.observedRevision = count(previous?.revision); this.revision = Math.max(this.revision, this.observedRevision) } catch { this.storageError = true }
        this.status = 'Draft restored using compared saved version. Not submitted.'; this.persist(); this.emit(); this.schedule()
    }
    otherTab(raw) { if (!raw || this.closed) return; try { const value = JSON.parse(raw); if (value.writer !== this.writer && count(value.revision) > this.observedRevision) { if (equal(value.draft, this.draft)) { this.observedRevision = value.revision; this.serverVersion = Math.max(this.serverVersion, count(value.serverVersion)); return }; this.blocked = true; this.compared = false; this.status = 'Another tab changed this draft. A separate device recovery copy is retained.'; this.persist(); this.localBranches = this.readBranches(); clearTimeout(this.saveTimer); this.emit() } } catch { /* malformed events never replace answers */ } }
    retry() { if (this.closed) return; this.persist(); this.emit(); if (!this.ready && !this.blocked) this.recover(); else this.schedule(0) }
    close() { this.persist(); this.closed = true; clearTimeout(this.saveTimer); clearTimeout(this.recoveryTimer) }
}
