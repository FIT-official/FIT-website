'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import saveAs from 'file-saver'
import useStore from '@/utils/store'
import Viewer from './viewer'
import QuotePanel from './QuotePanel'
import SimplePrintSettings from './SimplePrintSettings'
import AdvancedPrintSettings from './AdvancedPrintSettings'
import { applySimpleSelection, DEFAULT_PRINT_COLOURS, DEFAULT_SIMPLE_SELECTION,
  mapPurposeToConfiguration, purposeFromPrintSettings, restorePrintConfiguration } from '@/lib/quoting/genericPresets'
import { printSettingsToQuoteSettings } from '@/lib/quoting/printSettingsToQuote'
import { useToast } from '@/components/General/ToastProvider'
import posthog from 'posthog-js'

const EDITABLE_STATUSES = ['pending_upload', 'pending_config', 'configured', 'quoted']
const INITIAL_OPTIONS = { postProcessing: false, specialRequest: false, priority: false, expedite: false }

export default function Result() {
  const { fileName, scene, buffers, generateScene, productId, variantId, requestId, geometryMetrics,
    returnTo, productPrintConfig, productColours, colourVariantName, loadError: modelLoadError } = useStore()
  const { showToast } = useToast()
  const router = useRouter()
  const isProductPrint = !!productPrintConfig
  const savedRequestId = isProductPrint ? null : requestId || variantId
  const [colours, setColours] = useState(DEFAULT_PRINT_COLOURS)
  const [configuration, setConfiguration] = useState(() => restorePrintConfiguration())
  const [quoteOptions, setQuoteOptions] = useState(INITIAL_OPTIONS)
  const [advanced, setAdvanced] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [configLoaded, setConfigLoaded] = useState(!savedRequestId)
  const [loadError, setLoadError] = useState('')
  const [locked, setLocked] = useState(false)
  const [creatorManaged, setCreatorManaged] = useState(false)
  const [wireframe, setWireframe] = useState(false)
  const [autoRotate, setAutoRotate] = useState(false)
  const [background, setBackground] = useState('#f4f3ef')
  const viewerContainer = useRef(null)
  const { printSettings, selection } = configuration
  const meshNames = useMemo(() => {
    const names = []
    scene?.traverse(object => { if (object.isMesh && object.name) names.push(object.name) })
    return [...new Set(names)]
  }, [scene])
  const effectiveColours = useMemo(() => isProductPrint && productColours?.length
    ? productColours.map(colour => ({ name: colour.name,
      hex: colour.hex || colours.find(entry => entry.name === colour.name)?.hex || '#cccccc' }))
    : colours, [isProductPrint, productColours, colours])
  const selectedHex = effectiveColours.find(colour => colour.name === selection.colour)?.hex || '#ffffff'
  const meshColors = useMemo(() => Object.fromEntries(meshNames.map(name =>
    [name, configuration.meshColors[name] || selectedHex])), [meshNames, configuration.meshColors, selectedHex])
  const quoteSettings = useMemo(() => printSettingsToQuoteSettings(printSettings), [printSettings])
  const matchedPurpose = purposeFromPrintSettings(printSettings)
  const needsReview = printSettings.materialType !== 'plastic'

  useEffect(() => {
    let active = true
    fetch('/api/quote/config').then(response => response.ok ? response.json() : null)
      .then(data => { if (active && data?.printColours?.length) setColours(data.printColours) }).catch(() => {})
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!buffers || !fileName) return
    Promise.resolve(generateScene()).catch(error => showToast(error?.message || 'Could not load model', 'error'))
  }, [buffers, fileName, generateScene, showToast])

  useEffect(() => {
    let active = true
    setLoadError('')
    setLocked(false)
    setCreatorManaged(false)
    if (isProductPrint) {
      setConfiguration(restorePrintConfiguration({ printSettings: productPrintConfig,
        generic: { colour: productColours?.[0]?.name || 'White' } }))
      setConfigLoaded(true)
    } else if (!savedRequestId) {
      setConfiguration({ ...restorePrintConfiguration(), selection: { ...DEFAULT_SIMPLE_SELECTION } })
      setConfigLoaded(true)
    } else {
      setConfigLoaded(false)
      fetch('/api/custom-print?requestId=' + encodeURIComponent(savedRequestId))
        .then(async response => {
          const data = await response.json()
          if (!response.ok) throw new Error(data.error || 'Could not load saved settings')
          return data
        }).then(data => {
          if (!active) return
          const request = data.request
          if (!request) throw new Error('Saved print request was not found')
          setConfiguration(restorePrintConfiguration(request.printConfiguration))
          setQuoteOptions({ ...INITIAL_OPTIONS,
            ...Object.fromEntries(['postProcessing', 'specialRequest', 'priority'].map(key =>
              [key, !!request.quote?.lines?.find(line => line.key === key && line.amount > 0)])),
            expedite: !!request.quote?.expedite?.applied, ...request.quote?.inputs?.options })
          setCreatorManaged(!!request.creatorUserId)
          setLocked(!EDITABLE_STATUSES.includes(request.status) || !!request.paidAt || !!request.stripeSessionId
            || !!request.stripePaymentIntentId || !!request.creatorUserId || request.source === 'product')
          setConfigLoaded(true)
        }).catch(error => { if (active) setLoadError(error.message) })
    }
    return () => { active = false }
  }, [isProductPrint, productPrintConfig, productColours, savedRequestId])

  function changeSimple(next, { field } = {}) {
    const changedField = field || Object.keys(next).find(key => next[key] !== selection[key])
    setConfiguration(current => applySimpleSelection(current, next, changedField, meshNames, effectiveColours))
  }

  function changeDetailed(settings) {
    setConfiguration(current => ({ ...current, printSettings: settings,
      selection: { ...current.selection, purpose: purposeFromPrintSettings(settings), material: settings.materialType } }))
  }

  function resetSettings() {
    setConfiguration(isProductPrint
      ? restorePrintConfiguration({ printSettings: productPrintConfig, generic: { colour: productColours?.[0]?.name || 'White' } })
      : { ...restorePrintConfiguration(), selection: { ...DEFAULT_SIMPLE_SELECTION } })
    setQuoteOptions(INITIAL_OPTIONS)
    setWireframe(false)
    setAutoRotate(false)
    setBackground('#f4f3ef')
  }

  async function downloadImage() {
    try {
      const canvas = viewerContainer.current?.querySelector('canvas')
      if (!canvas) throw new Error('Model preview is not ready')
      saveAs(canvas.toDataURL('image/png'), (fileName?.split('.')[0] || 'model') + '.png')
    } catch (error) { showToast(error.message || 'Could not download image', 'error') }
  }

  async function saveConfiguration(mode) {
    if (!savedRequestId || !configLoaded || locked || submitting) return
    setSubmitting(true)
    try {
      const mapped = mapPurposeToConfiguration({ ...selection, purpose: matchedPurpose }, effectiveColours)
      const response = await fetch('/api/custom-print/config', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: savedRequestId, printSettings, meshColors, mode,
          generic: matchedPurpose && effectiveColours.some(colour => colour.name === selection.colour)
            && Object.values(meshColors).every(hex => hex.toLowerCase() === selectedHex.toLowerCase()) ? mapped.generic : null }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not save print settings')
      if (mode === 'instant') {
        const quoteResponse = await fetch('/api/quote', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: savedRequestId, mode: 'instant',
            volumeCm3: geometryMetrics?.volumeCm3, dimensionsCm: geometryMetrics?.dimensionsCm,
            confidence: geometryMetrics?.confidence || 'low', settings: quoteSettings, options: quoteOptions }),
        })
        const quoteData = await quoteResponse.json()
        if (!quoteResponse.ok) throw new Error(quoteData.error || 'Settings saved, but the quote could not be refreshed. Please try again.')
      }
      posthog.capture('print_config_saved', { mode, used_generic_mode: !!matchedPurpose })
      showToast(mode === 'instant' ? 'Settings and quote saved.' : 'Settings sent for a manual quote.', 'success')
      router.push(returnTo || '/cart')
    } catch (error) { showToast(error.message || 'Could not save print settings', 'error') }
    finally { setSubmitting(false) }
  }

  async function addProductPrint() {
    setSubmitting(true)
    try {
      const response = await fetch('/api/user/cart', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cartItem: { productId, quantity: 1, chosenDeliveryType: 'printDelivery',
          selectedVariants: colourVariantName ? { [colourVariantName]: selection.colour } : {} } }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not add this print to cart')
      showToast('Added to cart.', 'success')
      router.push(returnTo || '/cart')
    } catch (error) { showToast(error.message || 'Could not add this print to cart', 'error') }
    finally { setSubmitting(false) }
  }

  const disabled = submitting || !configLoaded || locked
  return <div className="h-full w-full overflow-y-auto bg-background text-textColor lg:overflow-hidden">
    <div className="grid min-h-full grid-cols-1 lg:h-full lg:grid-cols-[minmax(0,1fr)_380px]">
      <section ref={viewerContainer} aria-label="3D model preview" className="relative flex h-[48vh] min-h-[390px] min-w-0 flex-col lg:h-full">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-borderColor px-4 py-3">
          <p className="min-w-0 truncate text-sm font-medium">{fileName || 'Your model'}</p>
          <p className="shrink-0 text-xs text-lightColor">Drag to rotate · scroll to zoom</p>
        </div>
        <div className="relative min-h-0 flex-1">
        {scene ? <Viewer background={background} wireframe={wireframe} materialType={printSettings.materialType}
          layerHeight={printSettings.layerHeight} showLayers={true} intensity={1} autoRotate={autoRotate} meshColors={meshColors} />
          : modelLoadError ? <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm" role="alert">
            <p>{modelLoadError}</p><a href="/prints/request" className="underline underline-offset-4">Choose another model</a></div>
            : <div className="flex h-full items-center justify-center text-sm text-light" role="status">Preparing model preview…</div>}
        </div>
      </section>
      <aside aria-label="Print settings and estimate" className="border-t border-borderColor bg-baseColor p-5 lg:overflow-y-auto lg:border-l lg:border-t-0">
        <div className="mb-5"><h1 className="text-xl font-semibold">Your print</h1>
          <p className="mt-1 text-sm leading-relaxed text-light">Choose a finish and see the estimate update.</p></div>
        {loadError && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{loadError}. Reload this page before saving.</p>}
        {locked && <p role="status" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{creatorManaged
          ? 'Your print service manages this request. Contact the creator to change its settings or quote.'
          : 'This request is in payment or fulfilment. Its saved print settings are locked.'}</p>}
        <div className="mb-5 rounded-xl border border-borderColor bg-background p-4">
          {isProductPrint ? <p className="text-sm leading-relaxed">This product uses the maker’s saved print price and settings. Your selected colour and final total are shown in the cart.</p>
            : locked ? <Link href="/account/prints" className="text-sm underline underline-offset-4">View your request and confirmed pricing</Link>
            : needsReview ? <p className="text-sm leading-relaxed text-amber-800">This material needs a manual quote. Availability and the printing process will be confirmed during review.</p>
            : <QuotePanel embedded metrics={geometryMetrics} settings={quoteSettings} options={quoteOptions}
              onOptionsChange={setQuoteOptions} requestId={savedRequestId} disabled={disabled} />}
        </div>
        <SimplePrintSettings value={selection} onChange={changeSimple} colours={effectiveColours}
          fixed={isProductPrint} disabled={disabled} customSettings={!matchedPurpose} />
        {!isProductPrint && <details open={advanced} onToggle={event => setAdvanced(event.currentTarget.open)} className="mt-5 border-t border-borderColor pt-4">
          <summary className="cursor-pointer text-sm font-semibold">Advanced settings</summary>
          <div className="mt-4 space-y-4">
            <AdvancedPrintSettings settings={printSettings} onChange={changeDetailed} disabled={disabled} />
            {meshNames.length > 1 && <fieldset disabled={disabled} className="space-y-2"><legend className="mb-2 text-xs font-semibold">Colour by model part</legend>
              {meshNames.map(name => <label key={name} className="flex items-center justify-between gap-3 text-xs"><span className="truncate">{name}</span>
                <input aria-label={'Colour for ' + name} type="color" value={meshColors[name]}
                  onChange={event => setConfiguration(current => ({ ...current, selection: { ...current.selection, colour: 'Custom colours' },
                    meshColors: { ...meshColors, [name]: event.target.value } }))} />
              </label>)}</fieldset>}
          </div>
        </details>}
        <details className="mt-4 border-t border-borderColor pt-4"><summary className="cursor-pointer text-sm font-medium">Preview options</summary>
          <div className="mt-3 space-y-3 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={autoRotate} onChange={event => setAutoRotate(event.target.checked)} />Auto-rotate</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={wireframe} onChange={event => setWireframe(event.target.checked)} />Show mesh edges</label>
            <label className="flex items-center justify-between">Background<input type="color" value={background} onChange={event => setBackground(event.target.value)} /></label>
            <button type="button" onClick={downloadImage} className="underline underline-offset-4">Download preview image</button>
          </div>
        </details>
        <div className="mt-5 space-y-3">
          {isProductPrint ? <button type="button" onClick={addProductPrint} disabled={disabled}
            className="min-h-11 w-full rounded-full bg-textColor px-4 text-sm font-semibold text-background disabled:opacity-50">{submitting ? 'Adding…' : 'Add to cart'}</button>
            : savedRequestId ? <>
              <button type="button" onClick={() => saveConfiguration(needsReview ? 'manual' : 'instant')}
                disabled={disabled || !scene || (!needsReview && !(geometryMetrics?.volumeCm3 > 0))}
                className="min-h-11 w-full rounded-full bg-textColor px-4 text-sm font-semibold text-background disabled:opacity-50">
                {submitting ? 'Saving…' : needsReview ? 'Request a manual quote' : 'Save settings & quote'}</button>
              {!needsReview && <button type="button" onClick={() => saveConfiguration('manual')} disabled={disabled}
                className="min-h-10 w-full rounded-full border border-borderColor px-4 text-sm disabled:opacity-50">Ask for a manual quote</button>}
              {!needsReview && <p className="text-xs leading-relaxed text-light">For a manual quote, confirm any extra services with the store.</p>}
            </> : <p className="text-sm leading-relaxed text-light">Start a print request to save this model and its settings.</p>}
          <button type="button" onClick={resetSettings} disabled={disabled}
            className="text-xs text-light underline underline-offset-4 disabled:opacity-50">Reset print settings</button>
        </div>
      </aside>
    </div>
  </div>
}
