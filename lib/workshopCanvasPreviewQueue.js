// Per-mounted-gallery queue. No shared account cache or browser persistence.
export class CanvasPreviewQueue {
    constructor(load, { concurrency = 2, capacity = 12, onAuthFailure = () => {} } = {}) { Object.assign(this, { load, concurrency, capacity, onAuthFailure }); this.cache = new Map(); this.tasks = new Map(); this.waiting = []; this.running = 0; this.closed = false }
    subscribe(item, callback) {
        if (this.closed) return () => {}
        const cached = this.cache.get(item.id)
        if (cached) { this.cache.delete(item.id); this.cache.set(item.id, cached); let active = true; queueMicrotask(() => { if (active && !this.closed) callback(null, cached) }); return () => { active = false } }
        let task = this.tasks.get(item.id)
        if (!task) { task = { item, listeners: new Set(), controller: new AbortController(), started: false }; this.tasks.set(item.id, task); this.waiting.push(task) }
        task.listeners.add(callback); this.pump()
        return () => { task.listeners.delete(callback); if (!task.listeners.size) { task.controller.abort(); if (this.tasks.get(item.id) === task) this.tasks.delete(item.id) } }
    }
    pump() {
        while (!this.closed && this.running < this.concurrency && this.waiting.length) {
            const task = this.waiting.shift(); if (!task.listeners.size || task.controller.signal.aborted) continue
            this.running++; task.started = true
            Promise.resolve().then(() => this.load(task.item, task.controller.signal)).then(row => {
                if (this.closed || task.controller.signal.aborted) return
                this.cache.set(task.item.id, row); while (this.cache.size > this.capacity) this.cache.delete(this.cache.keys().next().value)
                for (const listener of task.listeners) listener(null, row)
            }).catch(error => { if (this.closed || task.controller.signal.aborted) return; if ([401, 403].includes(error.status)) this.onAuthFailure(); else for (const listener of task.listeners) listener(error) }).finally(() => { this.running--; if (this.tasks.get(task.item.id) === task) this.tasks.delete(task.item.id); this.pump() })
        }
    }
    close() { this.closed = true; for (const task of this.tasks.values()) task.controller.abort(); this.tasks.clear(); this.waiting = []; this.cache.clear() }
}
