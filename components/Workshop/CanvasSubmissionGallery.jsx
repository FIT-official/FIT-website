'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { WORKSHOP_SESSION } from '@/lib/workshopFeedback'
import { validCanvas } from '@/lib/workshopCanvasModel'
import { referenceMatchesIdea } from '@/lib/workshopPublication'
import { canvasImageMatches } from '@/lib/workshopCanvasImageRef'
import { CanvasPreviewQueue } from '@/lib/workshopCanvasPreviewQueue'
import CanvasDrawing from './CanvasDrawing'
import CanvasImageDownload from './CanvasImageDownload'
import CanvasDrawingPrompts from './CanvasDrawingPrompts'
import styles from './CanvasSubmissionGallery.module.css'

const endpoint = '/api/admin/workshop/canvas-submissions'
export const submissionLabel = item => `Group ${item.group.slice(1)} · Idea ${item.idea} · submitted v${item.version}`
const validMeta = item => item && item.session === WORKSHOP_SESSION && /^g(?:[1-9]|10)$/.test(item.group) && ['1', '2'].includes(item.idea) && Number.isSafeInteger(item.version) && item.version > 0 && item.id === `${WORKSHOP_SESSION}:${item.group}:${item.idea}:v${item.version}` && typeof item.submittedAt === 'string' && Number.isFinite(Date.parse(item.submittedAt))
async function request(url, signal) { const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', signal }); const value = await response.json(); if (!response.ok) throw Object.assign(Error(value.error || 'Drawing could not load.'), { status: response.status }); return value }
export async function loadSubmittedDrawing(item, signal) {
    const row = await request(endpoint + '?' + new URLSearchParams({ group: item.group, idea: item.idea, version: String(item.version) }), signal)
    if (!validMeta(row) || row.id !== item.id || row.submittedAt !== item.submittedAt || !validCanvas(row.document) || !referenceMatchesIdea(row.document.reference, item.group, item.idea) || !canvasImageMatches(row.document.image, item.group, item.idea)) throw Error('This response does not match the selected submission. Retry to view it.')
    return row
}
function Card({ item, queue, onOpen }) {
    const element = useRef(null), [visible, setVisible] = useState(false), [preview, setPreview] = useState(null), [error, setError] = useState(false)
    useEffect(() => { if (!window.IntersectionObserver) { setVisible(true); return }; const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)), { rootMargin: '120px' }); observer.observe(element.current); return () => observer.disconnect() }, [])
    useEffect(() => { setPreview(null); setError(false); if (!visible) return; return queue.subscribe(item, (error, row) => { setError(Boolean(error)); setPreview(row || null) }) }, [visible, item, queue])
    return <button type="button" ref={element} className={styles.card} aria-label={'Inspect ' + submissionLabel(item)} onClick={event => onOpen(item, event.currentTarget)}><span className={styles.label}>{submissionLabel(item)}<small><time dateTime={item.submittedAt}>{new Date(item.submittedAt).toLocaleString()}</time></small></span><span className={styles.preview} aria-hidden="true">{visible && preview ? <CanvasDrawing document={preview.document} /> : error ? 'Preview unavailable · click to inspect or retry' : visible ? 'Loading preview…' : 'Drawing preview'}</span></button>
}
export default function CanvasSubmissionGallery() {
    const [group, setGroup] = useState('all'), [idea, setIdea] = useState('all'), [tick, setTick] = useState(0), [items, setItems] = useState([]), [cursor, setCursor] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [denied, setDenied] = useState(false), [selected, setSelected] = useState(null), [detail, setDetail] = useState(null), [detailError, setDetailError] = useState(''), [detailTick, setDetailTick] = useState(0), [zoom, setZoom] = useState(1), [promptEpoch, setPromptEpoch] = useState(0)
    const listGeneration = useRef(0), detailGeneration = useRef(0), listController = useRef(null), detailController = useRef(null), queue = useRef(null), opener = useRef(null), dialog = useRef(null), heading = useRef(null), mounted = useRef(true), listBusy = useRef(false)
    const invalidateList = useCallback(() => { listGeneration.current++; listController.current?.abort() }, [])
    const invalidateDetail = useCallback(() => { detailGeneration.current++; detailController.current?.abort() }, [])
    const clearPrivate = useCallback(() => { if (!mounted.current) return; listGeneration.current++; detailGeneration.current++; listController.current?.abort(); detailController.current?.abort(); queue.current?.close(); setItems([]); setCursor(null); setSelected(null); setDetail(null); setDetailError(''); setDenied(true); setLoading(false); setPromptEpoch(value => value + 1); setError('Teacher access changed. Reopen the teacher classroom to continue.'); dialog.current?.close() }, [])
    const closeDetail = useCallback(() => { const restoreFocus = dialog.current?.open; detailGeneration.current++; detailController.current?.abort(); setSelected(null); setDetail(null); setDetailError(''); if (dialog.current?.open) dialog.current.close(); if (restoreFocus) { if (opener.current?.isConnected) opener.current.focus(); else heading.current?.focus() } }, [])
    const loadPage = useCallback(async (nextCursor = null) => {
        if (listBusy.current) return
        listBusy.current = true; setLoading(true); setError(''); const token = ++listGeneration.current, controller = new AbortController(); listController.current?.abort(); listController.current = controller
        try {
            const params = new URLSearchParams({ group, idea, limit: '8' }); if (nextCursor) params.set('cursor', nextCursor)
            const row = await request(endpoint + '?' + params, controller.signal)
            if (!mounted.current || token !== listGeneration.current) return
            if (!Array.isArray(row.items) || row.items.length > 8 || !row.items.every(validMeta) || !(row.nextCursor === null || typeof row.nextCursor === 'string' && row.nextCursor.length <= 768)) throw Error('Gallery response could not be verified.')
            setItems(old => [...new Map([...(nextCursor ? old : []), ...row.items].map(item => [item.id, item])).values()]); setCursor(row.nextCursor)
        } catch (error) { if (!mounted.current || token !== listGeneration.current || controller.signal.aborted) return; if ([401, 403].includes(error.status)) clearPrivate(); else setError(error.message || 'Gallery could not load. Retry to continue.') }
        finally { if (token === listGeneration.current) { listBusy.current = false; setLoading(false) } }
    }, [group, idea, clearPrivate])
    useEffect(() => {
        mounted.current = true; listBusy.current = false; setDenied(false); setItems([]); setCursor(null); closeDetail(); queue.current?.close(); queue.current = new CanvasPreviewQueue(loadSubmittedDrawing, { onAuthFailure: clearPrivate }); loadPage()
        return () => { invalidateList(); listBusy.current = false; invalidateDetail(); queue.current?.close() }
    }, [loadPage, tick, clearPrivate, closeDetail, invalidateList, invalidateDetail])
    useEffect(() => () => { mounted.current = false; invalidateList(); invalidateDetail(); queue.current?.close() }, [invalidateList, invalidateDetail])
    useEffect(() => {
        if (!selected) return
        const token = ++detailGeneration.current, controller = new AbortController(); detailController.current = controller; setDetail(null); setDetailError(''); setZoom(1)
        if (!dialog.current?.open) dialog.current?.showModal()
        loadSubmittedDrawing(selected, controller.signal).then(row => { if (mounted.current && token === detailGeneration.current) setDetail(row) }).catch(error => { if (!mounted.current || token !== detailGeneration.current || controller.signal.aborted) return; if ([401, 403].includes(error.status)) clearPrivate(); else setDetailError(error.message || 'This submission could not load.') })
        return () => { controller.abort(); invalidateDetail() }
    }, [selected, detailTick, clearPrivate, invalidateDetail])
    const open = (item, button) => { opener.current = button; setSelected(item); setDetail(null); setDetailError('') }
    return <section className={styles.root + ' ph-mask ph-no-capture'} aria-label="Submitted drawing gallery"><h3 ref={heading} tabIndex={-1}>Submitted drawing gallery</h3><p>Every submitted version is kept here, including earlier submissions when a group has started a new draft. Click a card to inspect that exact version.</p><div className={styles.toolbar}><label>Gallery group<select value={group} onChange={event => setGroup(event.target.value)}><option value="all">All groups</option>{Array.from({ length: 10 }, (_, n) => <option key={n} value={'g' + (n + 1)}>Group {n + 1}</option>)}</select></label><label>Gallery idea<select value={idea} onChange={event => setIdea(event.target.value)}><option value="all">Both ideas</option><option value="1">Idea 1</option><option value="2">Idea 2</option></select></label><button type="button" disabled={loading} onClick={() => setTick(value => value + 1)}>Refresh submissions</button></div><p className={styles.notice}>Teacher-only, read-only gallery. New submissions appear on Refresh; loading more keeps the current snapshot.</p>
        {error && <div role="alert" className={styles.error}><p>{error}</p>{!denied && <button type="button" onClick={() => loadPage(cursor)}>Retry gallery</button>}</div>}<p role="status" aria-live="polite">{loading ? 'Loading submitted drawings…' : `${items.length} submitted versions loaded${cursor ? ' · more available' : ''}.`}</p>
        {!loading && !error && !items.length && <p className={styles.empty}>No submitted drawings match these filters yet. Drafts are not listed.</p>}<div className={styles.grid}>{queue.current && items.map(item => <Card key={item.id} item={item} queue={queue.current} onOpen={open} />)}</div>{cursor && !denied && <div className={styles.actions}><button type="button" disabled={loading} onClick={() => loadPage(cursor)}>Load more submitted versions</button></div>}
        {!denied && <CanvasDrawingPrompts key={promptEpoch} />}
        {selected && <dialog ref={dialog} className={styles.dialog + ' ph-mask ph-no-capture'} aria-label={submissionLabel(selected)} onCancel={event => { event.preventDefault(); closeDetail() }}><header><div><h4>{submissionLabel(selected)}</h4><p><time dateTime={selected.submittedAt}>{new Date(selected.submittedAt).toLocaleString()}</time> · historical submission · read-only</p></div><button type="button" autoFocus onClick={closeDetail}>Close drawing</button></header>{!detail && !detailError && <p role="status">Loading this submitted version…</p>}{detailError && <div role="alert" className={styles.error}><p>{detailError}</p><button type="button" onClick={() => setDetailTick(value => value + 1)}>Retry selected drawing</button></div>}{detail && <><div className={styles.actions}><button type="button" disabled={zoom <= .5} onClick={() => setZoom(value => Math.max(.5, value - .25))}>Zoom out</button><span>{Math.round(zoom * 100)}%</span><button type="button" disabled={zoom >= 3} onClick={() => setZoom(value => Math.min(3, value + .25))}>Zoom in</button><button type="button" onClick={() => setZoom(1)}>Reset view</button></div><div className={styles.viewport} tabIndex={0} role="region" aria-label="Read-only drawing viewport"><div className={styles.drawing} style={{ width: `${zoom * 100}%` }}><CanvasDrawing document={detail.document} label={submissionLabel(selected) + ' full drawing'} /></div></div><p>Scroll or use the keyboard in the drawing viewport after zooming. The original and submitted versions remain unchanged.</p><CanvasImageDownload document={detail.document} group={selected.group} idea={selected.idea + '-v' + selected.version} /></>}</dialog>}
    </section>
}
