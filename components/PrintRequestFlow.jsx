'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { SignInButton, useUser } from '@clerk/nextjs'
import { getMimeType, putWithProgress } from '@/utils/uploadHelpers'
import useStore from '@/utils/store'
import DesignLinkInput from '@/components/Editor/DesignLinkInput'
import SimplePrintSettings from '@/components/Editor/SimplePrintSettings'
import { DEFAULT_SIMPLE_SELECTION, PURPOSE_PRESETS, mapPurposeToConfiguration } from '@/lib/quoting/genericPresets'
import { printSettingsToQuoteSettings } from '@/lib/quoting/printSettingsToQuote'
import { estimateMaterialGrams } from '@/lib/quoting/materialEstimate'
import { estimateCreatorPrintPrice } from '@/lib/creatorPrintService/estimate'
import { DEFAULT_FIT_COLOURS } from '@/lib/filamentCatalogue'
import { exceedsBuild, normalizeDesignSource, validatePrintFile } from '@/lib/printRequestDraft'

const Viewer = dynamic(() => import('@/components/Editor/viewer'), { ssr: false, loading: () => <p className="p-6 text-sm">Preparing preview…</p> })
const money = (value) => new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' }).format(value)
const card = 'min-w-0 rounded-md border border-borderColor bg-background p-5 sm:p-6'
const primary = 'mt-5 w-full rounded-lg bg-textColor px-5 py-3 text-sm font-medium text-background disabled:opacity-50'

export default function PrintRequestFlow() {
  const { user, isLoaded } = useUser()
  const router = useRouter()
  const searchParams = useSearchParams()
  const creatorSlug = searchParams?.get('creator') || ''
  const [creator, setCreator] = useState(null)
  const [service, setService] = useState(null)
  const [creatorState, setCreatorState] = useState(creatorSlug ? 'loading' : 'none')
  const [note, setNote] = useState('')
  const [material, setMaterial] = useState('')
  const [colour, setColour] = useState('')
  const [file, setFile] = useState(null)
  const [scene, setScene] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [source, setSource] = useState(null)
  const [selection, setSelection] = useState(DEFAULT_SIMPLE_SELECTION)
  const [colours, setColours] = useState(DEFAULT_FIT_COLOURS)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [quote, setQuote] = useState(null)
  const [quoteState, setQuoteState] = useState('idle')
  const [quoteError, setQuoteError] = useState('')
  const loadVersion = useRef(0)
  const draft = useRef({ creatorSlug, requestId: null })

  useEffect(() => {
    let cancelled = false
    fetch('/api/filament-availability').then((res) => res.ok ? res.json() : null).then((data) => {
      if (!cancelled && data?.colours?.length) setColours(data.colours)
    }).catch(() => {})
    return () => { cancelled = true; loadVersion.current += 1 }
  }, [])

  useEffect(() => {
    if (!creatorSlug) { setCreatorState('none'); setCreator(null); setService(null); return }
    let cancelled = false
    setCreatorState('loading')
    fetch(`/api/creators/${encodeURIComponent(creatorSlug)}/print-service`)
      .then((res) => res.ok ? res.json() : null).then((data) => {
        if (cancelled) return
        if (!data?.enabled || !data.service) { setCreatorState('unavailable'); return }
        setCreator(data.creator); setService(data.service)
        setMaterial(data.service.materials?.[0]?.name || '')
        setColour(data.service.materials?.[0]?.colours?.[0] || '')
        setCreatorState('ready')
      }).catch(() => { if (!cancelled) setCreatorState('unavailable') })
    return () => { cancelled = true }
  }, [creatorSlug])

  const isCreatorFlow = creatorState === 'ready' && Boolean(creator && service)
  const materials = service?.materials || []
  const selectedMaterial = materials.find((item) => item.name === material)
  const configuration = useMemo(() => mapPurposeToConfiguration(selection, colours), [selection, colours])
  const quoteSettings = useMemo(() => printSettingsToQuoteSettings(configuration.printSettings), [configuration])
  const creatorGrams = metrics ? estimateMaterialGrams({ ...metrics, ...quoteSettings }) : null
  const creatorEstimate = isCreatorFlow && selectedMaterial ? estimateCreatorPrintPrice({ grams: creatorGrams,
    pricePerGram: selectedMaterial.pricePerGram, minimumCharge: service.minimumCharge }) : null
  const tooBig = isCreatorFlow && exceedsBuild(metrics?.dimensionsCm, service.maxBuildMm)
  const formats = isCreatorFlow ? service.acceptedFormats : ['stl', 'obj', '3mf']
  const fileError = file ? validatePrintFile(file, formats) : null

  useEffect(() => {
    setQuote(null); setQuoteError('')
    if (isCreatorFlow || !(metrics?.volumeCm3 > 0)) { setQuoteState('idle'); return }
    const abort = new AbortController()
    setQuoteState('loading')
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.signal,
          body: JSON.stringify({ volumeCm3: metrics.volumeCm3, dimensionsCm: metrics.dimensionsCm,
            confidence: metrics.confidence, settings: quoteSettings, options: {} }) })
        const data = await res.json()
        if (!res.ok || !Number.isFinite(data.quote?.total)) throw new Error(data.error || 'The instant estimate is unavailable. You can still send the model for review.')
        if (!abort.signal.aborted) { setQuote(data.quote); setQuoteState('ready') }
      } catch (err) {
        if (!abort.signal.aborted) { setQuoteError(err.message); setQuoteState('error') }
      }
    }, 350)
    return () => { clearTimeout(timer); abort.abort() }
  }, [metrics, quoteSettings, isCreatorFlow])

  async function chooseFile(nextFile, designSource = null) {
    const version = ++loadVersion.current
    setError(''); setFile(null); setScene(null); setMetrics(null); setQuote(null)
    setSource(normalizeDesignSource(designSource))
    if (!nextFile) return
    const problem = validatePrintFile(nextFile, formats)
    if (problem) { setError(problem); throw new Error(problem) }
    setParsing(true)
    try {
      const buffer = await nextFile.arrayBuffer()
      if (version !== loadVersion.current) return
      const store = useStore.getState()
      store.setFileName(nextFile.name)
      store.setBuffers(new Map([[nextFile.name, buffer]]))
      await store.generateScene({})
      if (version !== loadVersion.current) return
      const loaded = useStore.getState()
      if (!loaded.scene) throw new Error(loaded.loadError || 'This file could not be previewed. Try exporting it as STL or OBJ.')
      setFile(nextFile); setScene(loaded.scene); setMetrics(loaded.geometryMetrics)
    } catch (err) {
      if (version === loadVersion.current) setError(err.message || 'The model could not be read.')
      throw err
    } finally { if (version === loadVersion.current) setParsing(false) }
  }

  async function submitRequest(event) {
    event.preventDefault()
    if (submitting || importing || parsing) return
    setError('')
    if (!isLoaded || !user) { setError('Sign in to save your request. Your model stays on this page.'); return }
    const problem = validatePrintFile(file, formats)
    if (problem) { setError(problem); return }
    if (isCreatorFlow && !selectedMaterial) { setError('Choose a material.'); return }
    try {
      setSubmitting(true); setProgress(0)
      if (draft.current.creatorSlug !== creatorSlug) draft.current = { creatorSlug, requestId: null }
      let requestId = draft.current.requestId
      if (!requestId) {
        const res = await fetch('/api/custom-print', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(isCreatorFlow ? { creatorUserId: creator.userId } : {}) })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.requestId) throw new Error(data.error || 'Unable to start your request. Please try again.')
        requestId = data.requestId
        draft.current.requestId = requestId
      }
      const contentType = getMimeType(file.name.split('.').pop().toLowerCase())
      const signedRes = await fetch('/api/upload/models', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType, fileSize: file.size }) })
      const signed = await signedRes.json().catch(() => ({}))
      if (!signedRes.ok || !signed.url) throw new Error(signed.error || 'Unable to prepare your model upload.')
      const s3Key = signed.key
      await putWithProgress({ url: signed.url, body: file, contentType, onProgress: setProgress })
      const meshColors = {}
      if (!isCreatorFlow && configuration.colourHex) scene?.traverse((mesh) => { if (mesh.isMesh) meshColors[mesh.name] = configuration.colourHex })
      const printConfiguration = {
        generic: isCreatorFlow ? { ...configuration.generic, material: selectedMaterial.name, colour: colour || null } : configuration.generic,
        ...(!isCreatorFlow ? { printSettings: configuration.printSettings, meshColors } : {}),
        isConfigured: true, configuredAt: new Date().toISOString(),
      }
      const saved = await fetch('/api/custom-print', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, modelFile: { originalName: file.name, s3Key, fileSize: file.size },
          customerNote: note.slice(0, 1000), designSource: source, printConfiguration }) })
      if (!saved.ok) {
        const data = await saved.json().catch(() => ({}))
        throw new Error(data.error || 'Unable to save your print request.')
      }
      router.push(isCreatorFlow ? '/account/prints' : `/editor?requestId=${encodeURIComponent(requestId)}`)
    } catch (err) {
      // A lost response may follow a successful save. Retain the upload rather
      // than deleting a model which a stored request might already reference.
      setError(err.message || 'Unable to save your print request.'); setProgress(0)
    } finally { setSubmitting(false) }
  }

  if (creatorState === 'loading') return <p className="mx-auto max-w-6xl p-8">Loading print service…</p>
  if (creatorState === 'unavailable') return <div className="mx-auto max-w-2xl p-8"><h1 className="text-2xl font-semibold">Print service unavailable</h1><p className="my-4">This creator is not accepting print requests right now.</p><Link href="/prints/request" className="underline">Request a print from Fix It Today</Link></div>

  return (
    <div className="min-h-screen bg-[#f7f8fa] px-4 py-8 text-textColor sm:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-lightColor">{isCreatorFlow ? creator.displayName : 'Fix It Today'} · 3D printing</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your design, ready to print.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-lightColor">Add a model or paste a design link. Preview the part, choose its finish and see an estimate before you send it.</p>
        {isCreatorFlow && <p className="mt-3 text-sm text-lightColor">{service.headline} · About {service.leadTimeDays} days. Payment is arranged directly with the creator.</p>}
        <form onSubmit={submitRequest} className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-5">
            <section className={card}>
              <h2 className="mb-5 text-lg font-semibold">1. Add your design</h2>
              <DesignLinkInput disabled={submitting || parsing} onBusyChange={setImporting} onImport={chooseFile} onSource={(value) => {
                loadVersion.current += 1
                setFile(null); setScene(null); setMetrics(null); setQuote(null)
                setSource(normalizeDesignSource(value))
              }} />
              <div className="my-5 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />or upload a file<span className="h-px flex-1 bg-slate-200" /></div>
              <label htmlFor="file" className="block cursor-pointer rounded-xl border border-dashed border-borderColor bg-baseColor p-5 text-sm focus-within:ring-2 focus-within:ring-slate-700">
                <span className="mb-2 block font-medium">{file ? file.name : 'Choose your 3D model'}</span>
                <input id="file" name="file" type="file" aria-label="Choose a 3D model file" accept={formats.map((format) => `.${format}`).join(',')} disabled={submitting || parsing || importing}
                  onChange={(event) => { const nextFile = event.target.files?.[0]; event.target.value = ''; chooseFile(nextFile, source).catch(() => {}) }} className="sr-only" />
                <span className="inline-block rounded-lg bg-slate-200 px-3 py-2 text-xs font-medium">{file ? 'Replace file' : 'Choose file'}</span>
                <span className="mt-2 block text-xs text-lightColor">{formats.map((format) => format.toUpperCase()).join(', ')} · up to 25 MB</span>
              </label>
              {source && <p className="mt-3 break-all text-xs text-lightColor">Design source: <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline">{new URL(source.url).hostname}</a>{source.attribution ? ` · ${source.attribution}` : ''}</p>}
              <p className="mt-3 text-xs text-lightColor">Use designs you have permission to print. Selling prints may require the designer’s commercial licence.</p>
            </section>
            <section className="overflow-hidden rounded-md border border-borderColor bg-background">
              <div className="flex items-center justify-between gap-3 px-5 py-4"><h2 className="shrink-0 text-sm font-semibold">Part preview</h2><span className="min-w-0 truncate text-xs text-lightColor">{file ? file.name : 'Your model appears here'}</span></div>
              <div className="relative h-[360px] bg-[#f4f3ef] sm:h-[430px]">
                {scene ? <Viewer scene={scene} fileName={file?.name} layerHeight={configuration.printSettings.layerHeight}
                  meshColors={isCreatorFlow ? {} : { default: configuration.colourHex || '#e5e7eb' }} />
                  : <div className="flex h-full items-center justify-center px-8 text-center text-sm text-lightColor">{parsing ? 'Reading your model…' : 'Upload a model or import a link to explore the part in 3D.'}</div>}
              </div>
              {metrics?.dimensionsCm && <div className="px-5 py-3 text-xs text-lightColor">Size (L×W×H): {['length', 'width', 'height'].map(axis => (metrics.dimensionsCm[axis] * 10).toFixed(1)).join(' × ')} mm</div>}
            </section>
          </div>
          <div className="min-w-0 space-y-5">
            <section className={card}>
              <h2 className="mb-4 text-lg font-semibold">2. Choose your finish</h2>
              {isCreatorFlow ? <div className="space-y-4">
                <fieldset disabled={submitting}>
                  <legend className="text-sm font-medium">Purpose <span className="font-normal text-lightColor">(optional)</span></legend>
                  <div className="mt-2 grid grid-cols-3 gap-2">{Object.keys(PURPOSE_PRESETS).map(purpose => <button key={purpose} type="button" aria-pressed={selection.purpose === purpose}
                    onClick={() => setSelection(current => ({ ...current, purpose }))}
                    className={`min-h-11 rounded-lg border px-2 text-sm ${selection.purpose === purpose ? 'border-slate-900 bg-textColor text-background' : 'border-borderColor'}`}>{purpose}</button>)}</div>
                  <button type="button" onClick={() => setSelection(current => ({ ...current, purpose: '' }))} className="mt-2 text-xs underline underline-offset-4">Use balanced defaults</button>
                  <p className="mt-2 text-xs text-lightColor">These are preferences for the creator to review. They will confirm the material, printing process and final settings.</p>
                </fieldset>
                <label className="block text-sm">Material<select aria-label="Material" value={material} onChange={(event) => { setMaterial(event.target.value); setColour(materials.find((item) => item.name === event.target.value)?.colours?.[0] || '') }} className="mt-2 block w-full rounded-lg border p-3">{materials.map((item) => <option key={item.name}>{item.name}</option>)}</select></label>
                {selectedMaterial?.colours?.length > 0 && <label className="block text-sm">Colour<select aria-label="Colour" value={colour} onChange={(event) => setColour(event.target.value)} className="mt-2 block w-full rounded-lg border p-3">{selectedMaterial.colours.map((item) => <option key={item}>{item}</option>)}</select></label>}
                <p className="text-xs text-lightColor">Tell the creator about strength or appearance needs in your note. They will confirm the print settings.</p>
              </div> : <><SimplePrintSettings value={selection} onChange={setSelection} colours={colours} disabled={submitting} /><p className="mt-4 text-xs text-lightColor">Advanced layer, wall, infill and support settings are available on the next screen.</p></>}
              <label htmlFor="notes" className="mt-5 block text-sm font-medium">Anything else? <span className="font-normal text-lightColor">Optional</span></label>
              <textarea id="notes" rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Deadline, fit, finish or how you will use the part" className="mt-2 w-full rounded-lg border border-borderColor p-3 text-sm" />
            </section>
            <section className={card} aria-live="polite">
              <h2 className="text-lg font-semibold">3. Your estimate</h2>
              {!file ? <p className="mt-3 text-sm text-lightColor">Add a model to see your estimate.</p> : isCreatorFlow ? <>
                {creatorEstimate?.ok ? <p className="mt-3 text-3xl font-semibold">From {money(creatorEstimate.amount)}</p> : <p className="mt-3 text-sm">Quote on review</p>}
                <p className="mt-2 text-xs text-lightColor">Indicative price for one model file. {creator.displayName} confirms the final quote, material and settings.</p>
              </> : quoteState === 'loading' ? <p className="mt-3 text-sm">Calculating your estimate…</p> : quote ? <>
                <p className="mt-3 text-3xl font-semibold">{money(quote.total)}</p><p className="mt-2 text-xs text-lightColor">Estimated print price for this file. Delivery and optional services are confirmed later. Final measurements are checked when saved.</p>
              </> : <p className="mt-3 text-sm text-lightColor">{quoteError || 'This model needs a review before it can be priced.'}</p>}
              {tooBig && <p className="mt-3 text-sm text-amber-700">This model may exceed the creator’s build size and need splitting. The creator will review it.</p>}
              {metrics?.confidence === 'low' && <p className="mt-3 text-xs text-amber-700">The mesh may be open or incomplete. This estimate needs a geometry check.</p>}
              {(error || fileError) && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error || fileError}</p>}
              {isLoaded && !user ? <SignInButton mode="modal"><button type="button" disabled={!file || parsing || importing} className={primary}>Sign in to continue</button></SignInButton> : <button type="submit" disabled={!file || Boolean(fileError) || submitting || parsing || importing || !isLoaded} className={primary}>{submitting ? progress > 0 && progress < 100 ? `Uploading ${progress}%` : 'Saving your request…' : isCreatorFlow ? `Send to ${creator.displayName}` : 'Continue to print settings'}</button>}
              {!user && <p className="mt-3 text-center text-xs text-lightColor">Sign in to save your print request.</p>}
            </section>
          </div>
        </form>
      </div>
    </div>
  )
}
