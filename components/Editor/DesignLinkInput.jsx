'use client'

import { useEffect, useRef, useState } from 'react'

function headerText(response, name, fallback = '') {
  try { return decodeURIComponent(response.headers.get(name) || fallback) } catch { return fallback }
}

export default function DesignLinkInput({ onImport, onSource, onBusyChange, disabled = false }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState([])
  const controller = useRef(null)
  useEffect(() => () => controller.current?.abort(), [])

  async function importLink(selectionUrl) {
    controller.current?.abort()
    const active = new AbortController()
    controller.current = active
    setBusy(true)
    onBusyChange?.(true)
    setMessage('Checking the design and finding printable files…')
    setFiles([])
    try {
      const parsed = new URL(url.trim())
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Enter a public HTTPS design link.')
      onSource?.({ url: parsed.href })
      const response = await fetch('/api/models/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: parsed.href, ...(selectionUrl ? { selectionUrl } : {}) }),
        signal: active.signal,
      })
      if ((response.headers.get('content-type') || '').includes('application/json')) {
        const data = await response.json()
        if (active.signal.aborted || controller.current !== active) return
        if (data.source) onSource?.(data.source)
        if (data.status === 'select_file') {
          setFiles(data.files || [])
          setMessage('Choose the file you want printed. Each file is quoted separately.')
          return
        }
        throw new Error(data.message || data.error || 'This design could not be imported. Download its STL, OBJ or 3MF file and upload it below.')
      }
      if (!response.ok) throw new Error('The design could not be downloaded. Upload the model file below instead.')
      const filename = headerText(response, 'X-Model-Filename', 'model.stl')
      const blob = await response.blob()
      if (active.signal.aborted || controller.current !== active) return
      const source = {
        url: headerText(response, 'X-Model-Source-Url', parsed.href),
        attribution: headerText(response, 'X-Model-Attribution'),
      }
      await onImport(new File([blob], filename, { type: blob.type }), source)
      if (active.signal.aborted || controller.current !== active) return
      setMessage(`Imported ${filename}. Your preview and estimate update below.`)
    } catch (error) {
      if (!active.signal.aborted && controller.current === active && error.name !== 'AbortError') setMessage(error.message || 'Unable to import this link. You can upload the model file below.')
    } finally {
      if (controller.current === active) { setBusy(false); onBusyChange?.(false) }
    }
  }

  return (
    <div className="space-y-3">
      <label htmlFor="design-link" className="block text-sm font-medium">Paste a design link</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id="design-link" type="url" value={url} disabled={busy || disabled}
          onChange={(event) => { setUrl(event.target.value); setFiles([]); setMessage('') }}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (url && !busy) importLink() } }}
          placeholder="https://makerworld.com/en/models/…" className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900" />
        <button type="button" disabled={!url.trim() || busy || disabled} onClick={() => importLink()}
          className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-50">
          {busy ? 'Importing…' : 'Import design'}
        </button>
      </div>
      <p className="text-xs leading-relaxed text-slate-500">MakerWorld, Printables, Thingiverse or a direct STL, OBJ or 3MF link. Public downloads up to 4 MB can be imported; larger or restricted files can be uploaded below.</p>
      {message && <p role="status" aria-live="polite" className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">{message}</p>}
      {files.length > 0 && <div className="space-y-2">{files.map((file) => (
        <button type="button" key={file.url} disabled={busy || disabled} onClick={() => importLink(file.url)}
          className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50">
          <span className="break-all">{file.name}</span><span className="ml-3 uppercase text-slate-500">{file.format}</span>
        </button>
      ))}</div>}
    </div>
  )
}
