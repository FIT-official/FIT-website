'use client'

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { clampRegion, DEFAULT_TEXT_REGION, regionFromPoints } from '@/lib/fabrication/regionSuggestion'
import { fitTextToRegion, MAX_PERSONALIZATION_TEXT, PREVIEW_FONTS, suggestRegionFromImage } from '@/lib/fabrication/imagePreview'

const FIELD_LABELS = { x: 'Left', y: 'Top', width: 'Width', height: 'Height' }
const FALLBACK_COLOUR = '#111827'

export default function PersonalizationEditor({ imageUrl, imageWidth, imageHeight, value = {}, onChange,
  allowRegionEdit = true, allowAutoSuggest = true, readOnly = false }) {
  const id = useId().replace(/:/g, ''), clipId = id + '-text-clip'
  const imageRef = useRef(null), stageRef = useRef(null), drag = useRef(null), latest = useRef(null)
  const generation = useRef(0), analysisTimer = useRef(null), automaticImage = useRef(null)
  const [imageState, setImageState] = useState({ url: null, loaded: false, error: false, cors: true })
  const [draftRegion, setDraftRegion] = useState(null), [notice, setNotice] = useState('')
  const [analysing, setAnalysing] = useState(false)
  const [measurement, setMeasurement] = useState(null)
  const canEditRegion = allowRegionEdit && !readOnly
  const loaded = imageState.url === imageUrl && imageState.loaded
  const failed = imageState.url === imageUrl && imageState.error
  const cors = imageState.url === imageUrl ? imageState.cors : true
  const naturalWidth = loaded ? imageState.width : Number(imageWidth) > 0 ? Number(imageWidth) : 1000
  const naturalHeight = loaded ? imageState.height : Number(imageHeight) > 0 ? Number(imageHeight) : 700
  const region = draftRegion || clampRegion(value.region)
  const text = String(value.text || '').slice(0, MAX_PERSONALIZATION_TEXT)
  const fontKey = Object.hasOwn(PREVIEW_FONTS, value.fontFamily) ? value.fontFamily : 'sans'
  const textColor = /^#[0-9a-f]{6}$/i.test(value.textColor || '') ? value.textColor : FALLBACK_COLOUR
  latest.current = { value, onChange, fontKey, textColor, text, canEditRegion, readOnly }
  const cancelAnalysis = useCallback(() => {
    generation.current++
    clearTimeout(analysisTimer.current)
  }, [])

  useEffect(() => {
    cancelAnalysis()
    // A cached image may finish before this passive effect; keep its load result.
    setImageState(current => current.url === imageUrl ? current : { url: imageUrl, loaded: false, error: false, cors: true })
    setDraftRegion(null); setNotice(''); setAnalysing(false)
    drag.current = null; automaticImage.current = null
    return cancelAnalysis
  }, [imageUrl, cancelAnalysis])

  useEffect(() => {
    // Measurement is optional; the conservative fallback also works without a
    // readable canvas. Only the three local font families can enter this context.
    try { setMeasurement(document.createElement('canvas').getContext('2d')) } catch { /* use fallback */ }
  }, [])

  useEffect(() => {
    if (!canEditRegion) { drag.current = null; setDraftRegion(null) }
  }, [canEditRegion])

  const emit = useCallback(patch => {
    const current = latest.current
    if (current.readOnly) return
    current.onChange?.({ ...current.value, text: current.text, fontFamily: current.fontKey, textColor: current.textColor,
      ...patch, ...(patch.region ? { region: clampRegion(patch.region) } : {}) })
  }, [])

  const suggest = useCallback(({ automatic = false } = {}) => {
    if (!imageRef.current || !latest.current.canEditRegion) return
    const version = generation.current, source = imageRef.current
    clearTimeout(analysisTimer.current)
    setAnalysing(true); setNotice('')
    analysisTimer.current = setTimeout(() => {
      if (version !== generation.current) return
      if (automatic && latest.current.value.region) { setAnalysing(false); return }
      try {
        const result = suggestRegionFromImage(source)
        if (version !== generation.current || !latest.current.canEditRegion) return
        if (result.region) {
          emit({ region: result.region })
          setNotice('Suggested text area—check placement')
        } else setNotice('No clear text area was found. Draw an area on the image or use the percentage controls.')
      } catch {
        if (version === generation.current) setNotice('Automatic placement is unavailable for this image. Use the percentage controls or draw an area manually.')
      } finally { if (version === generation.current) setAnalysing(false) }
    }, 0)
  }, [emit])

  useEffect(() => {
    if (loaded && allowAutoSuggest && canEditRegion && !value.region && automaticImage.current !== imageUrl) {
      automaticImage.current = imageUrl
      suggest({ automatic: true })
    }
  }, [loaded, allowAutoSuggest, canEditRegion, imageUrl, value.region, suggest])

  const fitted = useMemo(() => fitTextToRegion({ text, width: naturalWidth * region.width * 0.9,
    height: naturalHeight * region.height * 0.8,
    ...(measurement ? { measureText: (line, size) => {
      measurement.font = `${size}px ${PREVIEW_FONTS[fontKey]}`
      return measurement.measureText(line).width
    } } : {}),
  }), [text, naturalWidth, naturalHeight, region.width, region.height, measurement, fontKey])

  function manualRegion(next) {
    if (!canEditRegion) return
    // A pending auto suggestion must not replace a user's manual placement.
    generation.current++; clearTimeout(analysisTimer.current); setAnalysing(false)
    automaticImage.current = imageUrl
    setNotice('Text area set manually. Check the preview before continuing.')
    emit({ region: next })
  }

  function point(event) {
    const bounds = stageRef.current?.getBoundingClientRect()
    if (!(bounds?.width > 0 && bounds?.height > 0)) return null
    return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) }
  }

  function pointerDown(event) {
    if (!loaded || !canEditRegion || event.button > 0 || drag.current) return
    const start = point(event)
    if (!start) return
    generation.current++; clearTimeout(analysisTimer.current); setAnalysing(false)
    automaticImage.current = imageUrl
    drag.current = { start, pointerId: event.pointerId }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    event.preventDefault()
  }

  function pointerMove(event) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return
    const end = point(event)
    if (end) setDraftRegion(regionFromPoints(drag.current.start, end))
  }

  function pointerEnd(event, cancelled = false) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return
    const active = drag.current, end = point(event)
    drag.current = null; setDraftRegion(null)
    if (!cancelled && end && (Math.abs(active.start.x - end.x) > 0.02 || Math.abs(active.start.y - end.y) > 0.02)) {
      manualRegion(regionFromPoints(active.start, end))
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  function loadedImage(event) {
    const image = event.currentTarget
    if (image !== imageRef.current) return
    if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) { setImageState(current => ({ ...current, loaded: false, error: true })); return }
    setImageState({ url: imageUrl, loaded: true, error: false, cors, width: image.naturalWidth, height: image.naturalHeight })
  }

  function failedImage() {
    // A signed cross-origin image can remain usable for manual placement even
    // when its host does not permit canvas inspection.
    if (cors) setImageState({ url: imageUrl, loaded: false, error: false, cors: false })
    else setImageState({ url: imageUrl, loaded: false, error: true, cors: false })
  }

  const x = region.x * naturalWidth, y = region.y * naturalHeight
  const width = region.width * naturalWidth, height = region.height * naturalHeight
  const firstBaseline = y + height / 2 - (fitted.lines.length - 1) * fitted.lineHeight / 2
  const inputClass = 'mt-1 w-full rounded-lg border border-borderColor bg-background px-3 py-2 text-sm disabled:opacity-60'
  return <section aria-label="Image personalization" className="space-y-4 text-textColor">
    <div className="flex items-center justify-center overflow-hidden rounded-xl border border-borderColor bg-slate-100 p-2">
      {!imageUrl ? <p role="status" className="p-10 text-center text-sm text-lightColor">Add an image to place your text.</p>
        : failed ? <p role="alert" className="p-10 text-center text-sm text-lightColor">This image could not be displayed. Choose another image or reload it.</p>
          : <div ref={stageRef} role="group" aria-label="Image personalization preview"
            aria-describedby={id + '-instructions'} className="relative w-full overflow-hidden"
            style={{ aspectRatio: `${naturalWidth} / ${naturalHeight}`, maxWidth: Math.min(1000, 520 * naturalWidth / naturalHeight),
              touchAction: loaded && canEditRegion ? 'none' : 'auto', cursor: loaded && canEditRegion ? 'crosshair' : 'default' }}
            onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={event => pointerEnd(event)}
            onPointerCancel={event => pointerEnd(event, true)} onLostPointerCapture={() => { drag.current = null; setDraftRegion(null) }}>
            {/* The caller supplies a local blob or a controlled signed image URL. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={`${imageUrl}-${cors}`} ref={imageRef} src={imageUrl} crossOrigin={cors ? 'anonymous' : undefined}
              alt="Item to personalize" draggable={false} onLoad={loadedImage} onError={failedImage}
              className="absolute inset-0 h-full w-full select-none object-contain" />
            {!loaded && <p role="status" className="absolute inset-0 flex items-center justify-center bg-background/80 p-4 text-sm text-lightColor">Loading image…</p>}
            {loaded && <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${naturalWidth} ${naturalHeight}`}
              aria-label={text ? `Text preview: ${text}` : 'Empty text area'} role="img">
              <defs><clipPath id={clipId}><rect x={x} y={y} width={width} height={height} /></clipPath></defs>
              <rect x={x} y={y} width={width} height={height} fill="rgba(59,130,246,0.06)" stroke="#2563eb"
                strokeWidth="1.5" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
              <text x={x + width / 2} fill={textColor} fontFamily={PREVIEW_FONTS[fontKey]} fontSize={fitted.fontSize}
                textAnchor="middle" dominantBaseline="central" clipPath={`url(#${clipId})`}>
                {fitted.lines.map((line, index) => <tspan key={index} x={x + width / 2} y={firstBaseline + index * fitted.lineHeight}>{line || ' '}</tspan>)}
              </text>
            </svg>}
          </div>}
    </div>
    <p id={id + '-instructions'} className="text-xs leading-relaxed text-light">
      {canEditRegion ? 'Drag across the image to draw a text area, or adjust its position below.' : 'The text area is fixed for this item.'}
      {' '}This preview shows placement; the provider checks the final production layout.
    </p>
    {allowAutoSuggest && allowRegionEdit && <button type="button" onClick={suggest} disabled={!loaded || readOnly || analysing}
      className="rounded-full border border-borderColor px-4 py-2 text-sm disabled:opacity-50">
      {analysing ? 'Finding a text area…' : 'Suggest text area'}</button>}
    {notice && <p role="status" className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">{notice}</p>}
    {canEditRegion && !value.region && <button type="button" disabled={!loaded || analysing} onClick={() => manualRegion(region)} className="rounded-lg border border-borderColor px-3 py-2 text-sm disabled:opacity-50">Use this text area</button>}
    <label htmlFor={id + '-text'} className="block text-sm font-medium">Your text
      <textarea id={id + '-text'} aria-label="Personalization text" value={text} rows={2} maxLength={MAX_PERSONALIZATION_TEXT}
        readOnly={readOnly} className={inputClass} onChange={event => emit({ text: event.target.value })} placeholder="Add a name or short message" />
      <span className="mt-1 block text-xs font-normal text-light">Text automatically fits the selected area. {text.length}/{MAX_PERSONALIZATION_TEXT} characters.</span>
    </label>
    <div className="grid grid-cols-2 gap-3">
      <label htmlFor={id + '-font'} className="text-sm font-medium">Font
        <select id={id + '-font'} value={fontKey} disabled={readOnly} onChange={event => emit({ fontFamily: event.target.value })} className={inputClass}>
          <option value="sans">Sans serif</option><option value="serif">Serif</option><option value="mono">Monospace</option>
        </select>
      </label>
      <label htmlFor={id + '-colour'} className="text-sm font-medium">Text colour
        <input id={id + '-colour'} type="color" value={textColor} disabled={readOnly} onChange={event => emit({ textColor: event.target.value })}
          className="mt-1 h-10 w-full rounded-lg border border-borderColor bg-background p-1 disabled:opacity-60" />
      </label>
    </div>
    {allowRegionEdit && <details><summary className="cursor-pointer text-sm font-medium">Adjust text position precisely</summary><fieldset disabled={readOnly || !loaded} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <legend className="mb-2 text-sm font-medium">Text area <span className="font-normal text-light">(% of image)</span></legend>
      {Object.entries(FIELD_LABELS).map(([key, label]) => <label key={key} htmlFor={`${id}-${key}`} className="text-xs font-medium">{label} (%)
        <input id={`${id}-${key}`} type="number" min={key === 'width' || key === 'height' ? 0.1 : 0} max="100" step="0.1"
          value={Number((region[key] * 100).toFixed(3))} className={inputClass} onChange={event => {
            if (event.target.value === '' || !Number.isFinite(event.target.valueAsNumber)) return
            manualRegion(clampRegion({ ...region, [key]: event.target.valueAsNumber / 100 }))
          }} />
      </label>)}
    </fieldset></details>}
  </section>
}

export { DEFAULT_TEXT_REGION }
