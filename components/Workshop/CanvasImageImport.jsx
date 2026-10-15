'use client'
/* eslint-disable @next/next/no-img-element -- local object URL preview; server validates before storing */
import { useEffect, useRef, useState } from 'react'
import { CANVAS_IMAGE_LIMITS, canvasImageMatches, validCanvasImage } from '@/lib/workshopCanvasImageRef'
import styles from './Canvas.module.css'
export default function CanvasImageImport({ seat, group, idea, disabled, onUse }) {
    const [file, setFile] = useState(null), [preview, setPreview] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [validPreview, setValidPreview] = useState(false), dialog = useRef(null), picker = useRef(null), request = useRef(null), generation = useRef(0), lock = useRef(false)
    function close() { generation.current++; request.current?.abort(); setFile(null); setMessage(''); setBusy(false); lock.current = false; dialog.current?.close(); picker.current?.focus() }
    useEffect(() => { if (!file) return; const url = URL.createObjectURL(file); setPreview(url); setValidPreview(false); dialog.current?.showModal(); return () => URL.revokeObjectURL(url) }, [file])
    useEffect(() => () => { request.current?.abort() }, [seat, group, idea])
    useEffect(() => { if (disabled) { request.current?.abort(); dialog.current?.close() } }, [disabled])
    async function upload() {
        if (!file || disabled || !validPreview || lock.current) return
        lock.current = true; setBusy(true); setMessage('Preparing your image. Your drawing is kept.'); const token = ++generation.current, controller = new AbortController(); request.current = controller
        try {
            const response = await fetch('/api/workshop/guest/canvas-images?' + new URLSearchParams({ homeGroup: group, idea }), { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': file.type }, body: file, signal: controller.signal }), result = await response.json()
            if (controller.signal.aborted || token !== generation.current) return
            if (!response.ok) throw Error(result.error || 'Image could not upload. Your drawing is unchanged.')
            if (!validCanvasImage(result.image) || !canvasImageMatches(result.image, group, idea)) throw Error('This image response does not match your drawing. Your drawing is unchanged.')
            if (!onUse(result.image)) throw Error('Your drawing changed or is read-only. Compare it or start a new revision before adding this image.')
            close()
        } catch (error) { if (!controller.signal.aborted && token === generation.current) setMessage(error.message) }
        finally { if (token === generation.current) { lock.current = false; setBusy(false) } }
    }
    function choose(event) { const next = event.target.files?.[0]; event.target.value = ''; setMessage(''); if (!next) return; if (!['image/png', 'image/jpeg'].includes(next.type) || !next.size || next.size > CANVAS_IMAGE_LIMITS.inputBytes) { setMessage('Choose a PNG or JPEG smaller than 4 MB. Your drawing is unchanged.'); return }; setFile(next) }
    return <><label className={styles.uploadButton} aria-disabled={disabled}><span>↑ Add image</span><input ref={picker} type="file" accept="image/png,image/jpeg" aria-label="Add PNG or JPEG design image" disabled={disabled || busy} onChange={choose} /></label>{!file && message && <p role="status">{message}</p>}{file && <dialog ref={dialog} className={styles.dialog} aria-label="Preview design image" onCancel={event => { event.preventDefault(); close() }}><h4>Preview your design image</h4><p>PNG or JPEG, up to 4 MB. Use a design picture without names or faces.</p>{preview && <img src={preview} alt="Selected design preview" className={styles.importPreview} onLoad={() => setValidPreview(true)} onError={() => { setValidPreview(false); setMessage('This image cannot be previewed. Choose a valid PNG or JPEG; your drawing is unchanged.') }} />}<p>The image fits inside the same drawing board. Your marks stay in place; the earlier picture and saved versions are kept.</p><p role="status" aria-live="polite">{message}</p><div className={styles.actions}><button type="button" className={styles.primary} disabled={busy || disabled || !validPreview} onClick={upload}>{busy ? 'Adding image…' : 'Use image in my draft'}</button><button type="button" onClick={close}>Cancel image</button></div></dialog>}</>
}
