'use client'
import { useId, useState } from 'react'
import { inspectModelLink } from '@/lib/customPrint/modelInput'

const field = 'mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base'

// The two quickest ways to say what to print: drop a model file, or paste a link to one. Both are optional and neither is
// fetched, opened or previewed automatically; the link card only shows what the person typed.
export default function ModelDrop({ file, fileCheck, checking, fileError, canPreview, previewing, previewed, link, onLink, onFile, onRemoveFile, onPreview, storage, disabled }) {
  const [dragging, setDragging] = useState(false)
  const [dropNote, setDropNote] = useState('')
  const hintId = useId(), linkErrorId = useId()
  const inspection = inspectModelLink(link)
  const pick = event => { const next = event.target.files?.[0]; event.target.value = ''; setDropNote(''); if (next) onFile(next) }
  const drop = event => {
    event.preventDefault(); setDragging(false)
    if (disabled) return
    const files = Array.from(event.dataTransfer?.files || [])
    if (files.length > 1) { setDropNote('Drop one model at a time.'); return }
    setDropNote('')
    if (files[0]) onFile(files[0])
  }
  return <div className="mt-4 grid gap-3 md:grid-cols-2 md:gap-4" data-testid="model-quickstart">
    <div className="min-w-0">
      <label onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={drop}
        className={`flex min-h-[104px] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed p-4 text-center text-sm sm:min-h-[150px] sm:p-5 focus-within:ring-2 focus-within:ring-slate-900 ${dragging ? 'border-slate-900 bg-slate-100' : 'border-slate-300 bg-slate-50 hover:border-slate-900'} ${disabled ? 'opacity-60' : ''}`}>
        <span className="text-base font-semibold">{file ? file.name : checking ? 'Checking the file…' : 'Drop a model file here'}</span>
        <span className="text-slate-600">{file ? 'Choose a different file' : 'or tap to choose one'}</span>
        <span className="text-xs text-slate-600" id={hintId}>STL, OBJ or 3MF · one file · up to 3 MB</span>
        <input type="file" aria-label="Attach a model (optional)" aria-describedby={hintId} accept=".stl,.obj,.3mf" disabled={disabled} onChange={pick} className="sr-only" />
      </label>
      {dropNote && <p role="alert" className="mt-2 text-sm text-red-700">{dropNote}</p>}
      {fileError && <p role="alert" className="mt-2 break-words text-sm text-red-700">{fileError}</p>}
      {storage !== 'ready' && <p role="status" className="mt-2 text-xs text-amber-900">{storage === 'loading' ? 'Checking private uploads…' : 'Private uploads are unavailable. You can still send a link or description.'}</p>}
      {file && fileCheck?.ok && <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm" data-testid="file-card">
        <p className="break-all font-medium">{file.name}</p>
        <p className="text-slate-600">{fileCheck.kind.toUpperCase().replace('-', ' ')} · {fileCheck.sizeLabel}</p>
        <p className="mt-1 text-xs text-slate-600">{fileCheck.note} Nothing is uploaded until you send the enquiry.</p>
        <div className="mt-2 flex flex-wrap gap-3">
          {canPreview && !previewed && <button type="button" className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm font-medium disabled:opacity-50" disabled={disabled || previewing} onClick={onPreview}>{previewing ? 'Preparing 3D preview…' : 'Preview in 3D (optional)'}</button>}
          <button type="button" className="min-h-[44px] px-1 text-sm underline" disabled={disabled} onClick={onRemoveFile}>Remove file</button>
        </div>
      </div>}
    </div>
    <div className="min-w-0">
      <label className="block text-sm font-medium">Model reference link (optional)
        <input type="url" inputMode="url" autoComplete="off" spellCheck={false} className={field} maxLength={2048} value={link} disabled={disabled} onChange={event => onLink(event.target.value)} placeholder="Paste a link to the model, https://…" aria-invalid={inspection.state === 'invalid'} aria-describedby={inspection.state === 'invalid' ? linkErrorId : undefined} />
      </label>
      {inspection.state === 'invalid' && <p role="alert" id={linkErrorId} className="mt-2 break-words text-sm text-red-700">{inspection.message}</p>}
      {inspection.state === 'ok' && <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm" data-testid="link-card">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Model link ready for review</p>
        <p className="mt-1 break-all font-medium">{inspection.site ? `${inspection.site} · ` : ''}{inspection.host}</p>
        <p className="mt-1 text-xs text-slate-600">FIT has not opened this page, so no title or picture is shown. It is added to your enquiry when you send it.</p>
        <div className="mt-2 flex flex-wrap gap-3"><a className="inline-flex min-h-[44px] items-center text-sm underline" href={inspection.href} target="_blank" rel="noopener noreferrer">Open the link in a new tab <span aria-hidden="true">↗</span></a>
          <button type="button" className="min-h-[44px] px-1 text-sm underline" disabled={disabled} onClick={() => onLink('')}>Remove link</button></div>
      </div>}
      <p className="mt-2 text-xs text-slate-600">FIT does not open, download or embed the linked page.</p>
    </div>
  </div>
}
