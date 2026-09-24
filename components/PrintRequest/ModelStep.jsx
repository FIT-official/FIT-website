'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import DesignLinkInput from '@/components/Editor/DesignLinkInput'
import { MAX_PRINT_FILE_BYTES } from '@/lib/printRequestDraft'

const Viewer = dynamic(() => import('@/components/Editor/viewer'), { ssr: false, loading: () => <p className="p-6 text-sm">Preparing preview…</p> })

const mm = value => (Number(value) * 10).toFixed(1)

export default function ModelStep({ file, fileName, scene, metrics, source, formats, parsing, importing, disabled, modelLocked,
  colourHex, layerHeight, grams, tooBig, limitMessage, onChooseFile, onImport, onSource, onBusyChange }) {
  const [dragging, setDragging] = useState(false)
  const hasModel = Boolean(scene)
  const busy = disabled || parsing || importing
  const accept = formats.map(format => `.${format}`).join(',')
  const pick = event => {
    const nextFile = event.target.files?.[0]
    event.target.value = ''
    if (nextFile) onChooseFile(nextFile)
  }
  const drop = event => {
    event.preventDefault(); setDragging(false)
    if (busy || modelLocked) return
    const nextFile = event.dataTransfer?.files?.[0]
    if (nextFile) onChooseFile(nextFile)
  }
  return (
    <div className="grid gap-5 sm:grid-cols-[260px_minmax(0,1fr)]">
      <div className="relative aspect-square overflow-hidden rounded-md border border-borderColor bg-[#f4f3ef]">
        {hasModel ? <Viewer scene={scene} fileName={fileName} layerHeight={layerHeight} autoRotate meshColors={{ default: colourHex || '#e5e7eb' }} />
          : <div className="flex h-full items-center justify-center px-6 text-center text-sm text-lightColor">{parsing ? 'Reading your model…' : 'Your model appears here, and rotates so you can check it.'}</div>}
        {hasModel && fileName && <span className="absolute left-2 top-2 max-w-[90%] truncate rounded bg-background/80 px-2 py-0.5 font-mono text-[11px]">{fileName}</span>}
      </div>
      <div className="min-w-0 space-y-4">
        {hasModel ? <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{fileName}</p><p className="text-xs text-lightColor">Checked and measured</p></div>
            {!modelLocked && <label className={`shrink-0 cursor-pointer rounded-md border border-borderColor px-3 py-1.5 text-xs font-semibold ${busy ? 'opacity-50' : 'hover:border-textColor'}`}>Change file
              <input type="file" aria-label="Choose a 3D model file" accept={accept} disabled={busy} onChange={pick} className="sr-only" /></label>}
          </div>
          {metrics && <dl className="grid grid-cols-3 gap-2">
            <div className="rounded-md bg-baseColor px-3 py-2"><dd className="font-mono text-sm font-semibold">{Number(metrics.volumeCm3) < 0.1 ? '<0.1' : Number(metrics.volumeCm3).toFixed(1)} cm³</dd><dt className="text-[11px] uppercase tracking-wide text-lightColor">Volume</dt></div>
            <div className="rounded-md bg-baseColor px-3 py-2"><dd className="font-mono text-sm font-semibold">{metrics.dimensionsCm ? ['length', 'width', 'height'].map(axis => mm(metrics.dimensionsCm[axis])).join(' × ') : '–'}</dd><dt className="text-[11px] uppercase tracking-wide text-lightColor">mm</dt></div>
            <div className="rounded-md bg-baseColor px-3 py-2"><dd className="font-mono text-sm font-semibold">{grams != null ? `${Math.round(grams)} g` : '–'}</dd><dt className="text-[11px] uppercase tracking-wide text-lightColor">Per part</dt></div>
          </dl>}
          {metrics?.confidence === 'low' && <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">This model has small gaps. The estimate is approximate and the final price is confirmed after review.</p>}
          {tooBig && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{limitMessage || 'Too large for this printer. Scale it down or split it into parts.'}</p>}
          {modelLocked && <p className="text-xs text-lightColor">This request already has a quoted model. Start a new request to print a different file.</p>}
        </> : <>
          <label onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={drop}
            className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed p-5 text-center text-sm text-lightColor focus-within:ring-2 focus-within:ring-textColor/30 ${dragging ? 'border-textColor bg-baseColor' : 'border-borderColor hover:border-textColor'}`}>
            <span className="text-base font-semibold text-textColor">{file ? file.name : 'Drop your model here'}</span>
            <span>or click to choose a file</span>
            <span className="text-xs">{formats.map(format => format.toUpperCase()).join(', ')} · up to {Math.round(MAX_PRINT_FILE_BYTES / 1024 / 1024)} MB</span>
            <input type="file" aria-label="Choose a 3D model file" accept={accept} disabled={busy} onChange={pick} className="sr-only" />
          </label>
        </>}
        {/* One stable slot so a pending import keeps its state when the model above changes. */}
        {!modelLocked && <details open={!hasModel} className={hasModel ? 'rounded-md border border-borderColor bg-baseColor px-3' : ''}>
          <summary className={hasModel ? 'cursor-pointer py-2 text-xs font-semibold' : 'flex cursor-default items-center gap-3 text-xs text-lightColor'}>
            {hasModel ? 'Replace with a design link' : <><span className="h-px flex-1 bg-borderColor" />or paste a design link<span className="h-px flex-1 bg-borderColor" /></>}</summary>
          <div className={hasModel ? 'pb-3' : 'pt-3'}><DesignLinkInput disabled={busy} onBusyChange={onBusyChange} onImport={onImport} onSource={onSource} /></div>
        </details>}
        {source && <p className="break-all text-xs text-lightColor">Design source: <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline">{new URL(source.url).hostname}</a>{source.attribution ? ` · ${source.attribution}` : ''}</p>}
        <p className="text-xs text-lightColor">Use designs you have permission to print. Selling prints may require the designer’s commercial licence.</p>
      </div>
    </div>
  )
}
