'use client'
import { useState } from 'react'
import Image from 'next/image'

export default function FilamentColourPreview({ preview, name, compact = false }) {
  const [failedSource, setFailedSource] = useState(null)
  const label = preview?.label || name
  const photo = preview?.kind === 'image' && failedSource !== preview.src
  const swatch = preview?.kind === 'swatch' && preview.colours?.length > 0
  const unavailableReason = preview?.kind === 'image' && failedSource === preview.src ? 'The manufacturer photo could not be loaded.' : preview?.reason || 'A verified preview is not available for this selection.'
  const dimensions = compact ? 'h-12 w-12' : 'h-24 w-24'
  return <span className={'flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-300 bg-white ' + dimensions}>
    {photo ? <Image src={preview.src} width={96} height={96} unoptimized referrerPolicy="no-referrer" alt={`${preview.material} ${label} manufacturer product photo`} className="h-full w-full object-contain" onError={() => setFailedSource(preview.src)}/> :
      swatch ? <span role="img" aria-label={`${preview.material} ${label} manufacturer colour reference${preview.colours.length > 1 ? ' pair' : ''}`} className="flex h-full w-full gap-0.5 p-1">
        {preview.colours.map((colour, index) => <span key={index} className="h-full flex-1 rounded" style={{ backgroundColor: colour }}/>)}</span> :
        <span role="img" aria-label={label + ": preview unavailable. " + unavailableReason} title={unavailableReason} className="px-1 text-center text-[10px] leading-tight text-slate-500">Preview unavailable</span>}
  </span>
}
