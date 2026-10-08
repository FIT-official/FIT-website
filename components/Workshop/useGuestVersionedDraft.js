'use client'
import { useEffect, useRef, useState } from 'react'
import { DraftController } from './draftController'
export { editableContent } from './draftController'
const cache = new Map()
export function clearDraftCache() { cache.clear() }
async function request(url, method = 'GET', payload) {
    const response = await fetch(url, { method, cache: 'no-store', ...(payload ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}) }), result = await response.json()
    if (!response.ok) throw Object.assign(Error(result.error || 'Draft recovery unavailable.'), { status: response.status })
    return result
}
const draftUrl = (seat, group) => '/api/workshop/guest/drafts?homeGroup=' + group
async function loadSeat(seat, group, fresh = false) {
    if (fresh) cache.delete(seat)
    if (!cache.has(seat)) cache.set(seat, request(draftUrl(seat, group)).then(result => { if (result.seat !== seat) throw Object.assign(Error('Your session changed. Your draft is kept; enter again.'), { status: 403 }); return result.drafts }).catch(error => { cache.delete(seat); throw error }))
    return cache.get(seat)
}
export function useVersionedDraft(key, seat, topic, create, enabled = true, group) {
    const factory = useRef(create); factory.current = create
    const controller = useRef(null), [view, setView] = useState(null)
    useEffect(() => {
        const model = new DraftController({ key, seat, topic, enabled, create: factory.current, storage: localStorage, online: () => navigator.onLine !== false, load: fresh => loadSeat(seat, group, fresh), save: async payload => { const result = await request(draftUrl(seat, group), 'POST', payload); cache.delete(seat); return result }, onChange: setView })
        controller.current = model; model.start()
        const changed = event => { if (event.key === key) model.otherTab(event.newValue) }, online = () => model.retry()
        window.addEventListener('storage', changed); window.addEventListener('online', online)
        return () => { model.close(); controller.current = null; window.removeEventListener('storage', changed); window.removeEventListener('online', online) }
    }, [key, seat, topic, enabled, group])
    const current = view?.key === key ? view : null, call = method => (...args) => controller.current?.key === key ? controller.current[method](...args) : undefined
    return [current?.draft || null, call('edit'), current?.status || 'Restoring draft.', { undo: call('undo'), redo: call('redo'), canUndo: Boolean(current?.canUndo), canRedo: Boolean(current?.canRedo), conflict: Boolean(current?.conflict), compare: call('compare'), rebase: call('rebase'), retry: call('retry'), remote: current?.remote || null }]
}
