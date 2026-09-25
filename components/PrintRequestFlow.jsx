'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { SignInButton, useUser } from '@clerk/nextjs'
import { useToast } from '@/components/General/ToastProvider'
import { getMimeType, putWithProgress } from '@/utils/uploadHelpers'
import useStore from '@/utils/store'
import StepCard from '@/components/PrintRequest/StepCard'
import ModelStep from '@/components/PrintRequest/ModelStep'
import MaterialColourStep from '@/components/PrintRequest/MaterialColourStep'
import PrintSettingsStep from '@/components/PrintRequest/PrintSettingsStep'
import DeliveryStep, { EMPTY_ADDRESS } from '@/components/PrintRequest/DeliveryStep'
import PricePanel from '@/components/PrintRequest/PricePanel'
import { DEFAULT_EDITOR_PRINT_SETTINGS, PURPOSE_PRESETS, mapPurposeToConfiguration } from '@/lib/quoting/genericPresets'
import { printSettingsToQuoteSettings } from '@/lib/quoting/printSettingsToQuote'
import { checkMachineLimits } from '@/lib/quoting/machineLimits'
import { DEFAULT_FIT_COLOURS } from '@/lib/filamentCatalogue'
import { MATERIAL_DESCRIPTIONS, coloursForFilament } from '@/lib/customPrint/materials'
import { addressComplete } from '@/lib/customPrint/deliveryOptions'
import { addressesEqual } from '@/lib/checkoutAddressGate'
import { DEFAULT_OPTIONS, buildChecklist, buildGeneric, buildPrintSettings, pickOptions, restoreFromRequest,
  strengthFromSettings, qualityFromSettings } from '@/lib/customPrint/requestState'
import { clearStoredDraft, readStoredDraft, writeStoredDraft } from '@/lib/customPrint/draftStorage'
import { normalizeDesignSource, validatePrintFile } from '@/lib/printRequestDraft'

const primary = 'min-h-11 w-full rounded-lg bg-textColor px-5 py-3 text-sm font-semibold text-background disabled:opacity-50'
const DEFAULT_CONFIG = { deliveryTypes: [], machineLimits: null, state: 'loading' }
const TOO_LARGE = /larger than we can print/i

async function readJson(response) { return response.json().catch(() => ({})) }

export default function PrintRequestFlow() {
  const { user, isLoaded } = useUser()
  const router = useRouter()
  const toast = useToast()
  const searchParams = useSearchParams()
  const creatorSlug = searchParams?.get('creator') || ''
  const requestIdParam = searchParams?.get('requestId') || ''
  const signedIn = isLoaded && Boolean(user)

  // Creator print service (?creator=): the creator prices and prints the job.
  const [creator, setCreator] = useState(null)
  const [service, setService] = useState(null)
  const [creatorState, setCreatorState] = useState(creatorSlug ? 'loading' : 'none')
  // The farm's public pricing profile: materials, colours, delivery options,
  // lead time and machine limits. Prices come from the server (/api/quote).
  const [farmProfile, setFarmProfile] = useState(null)
  const [purpose, setPurpose] = useState('')

  // Catalogue, stock and delivery options.
  const [colours, setColours] = useState(DEFAULT_FIT_COLOURS)
  const [config, setConfig] = useState(DEFAULT_CONFIG)

  // Step 1: the model.
  const [file, setFile] = useState(null)
  const [storedModel, setStoredModel] = useState(null)
  const [scene, setScene] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [source, setSource] = useState(null)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)

  // Steps 2 and 3: material, colour and print settings.
  const [filament, setFilament] = useState('pla')
  const [colour, setColour] = useState('Jade White')
  // Colours chosen per part in the 3D editor travel with the request unchanged.
  const [perPartColours, setPerPartColours] = useState(null)
  const [printSettings, setPrintSettings] = useState(DEFAULT_EDITOR_PRINT_SETTINGS)
  const [note, setNote] = useState('')
  const [options, setOptions] = useState(DEFAULT_OPTIONS)

  // Step 4: delivery and address.
  const [deliveryType, setDeliveryType] = useState('')
  const [savedAddress, setSavedAddress] = useState(null)
  const [addressDraft, setAddressDraft] = useState(EMPTY_ADDRESS)
  const [editingAddress, setEditingAddress] = useState(false)
  const [addressSaving, setAddressSaving] = useState(false)

  // Saved request (?requestId=) and submission.
  const [requestId, setRequestId] = useState(requestIdParam)
  const [loadState, setLoadState] = useState(requestIdParam ? 'loading' : 'ready')
  const [loadError, setLoadError] = useState('')
  const [locked, setLocked] = useState(false)
  const [lockReason, setLockReason] = useState('')
  const [notice, setNotice] = useState('')
  const [modelLocked, setModelLocked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [busyAction, setBusyAction] = useState('')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [quote, setQuote] = useState(null)
  const [quoteState, setQuoteState] = useState('idle')
  const [quoteError, setQuoteError] = useState('')
  const loadVersion = useRef(0)
  const draft = useRef({ creatorSlug, requestId: requestIdParam || null })

  useEffect(() => {
    let cancelled = false
    fetch('/api/filament-availability').then((res) => res.ok ? res.json() : null).then((data) => {
      if (!cancelled && data?.colours?.length) setColours(data.colours)
    }).catch(() => {})
    fetch('/api/quote/config').then((res) => res.ok ? res.json() : null).then((data) => {
      if (cancelled) return
      // Without the real options the cart would charge a delivery type this
      // page never showed, so a failed config disables Add to cart instead.
      if (!data?.deliveryTypes?.length) { setConfig({ deliveryTypes: [], machineLimits: null, state: 'error' }); return }
      setConfig({ deliveryTypes: data.deliveryTypes, machineLimits: data.machineLimits || null, state: 'ready' })
    }).catch(() => { if (!cancelled) setConfig({ deliveryTypes: [], machineLimits: null, state: 'error' }) })
    return () => { cancelled = true; loadVersion.current += 1 }
  }, [])

  // A full-page sign-in (social providers) reloads this page: keep the choices
  // and address, though not the file, so only the model needs adding again.
  const draftRestored = useRef(false)
  useEffect(() => {
    if (requestIdParam || creatorSlug || draftRestored.current) return
    draftRestored.current = true
    const stored = readStoredDraft()
    if (!stored) return
    if (stored.filament) setFilament(stored.filament)
    if (stored.colour) setColour(stored.colour)
    if (stored.printSettings) setPrintSettings({ ...DEFAULT_EDITOR_PRINT_SETTINGS, ...stored.printSettings })
    if (stored.options) setOptions(pickOptions(stored.options))
    if (typeof stored.note === 'string') setNote(stored.note)
    if (stored.deliveryType) setDeliveryType(stored.deliveryType)
    if (stored.address) setAddressDraft({ ...EMPTY_ADDRESS, ...stored.address })
  }, [requestIdParam, creatorSlug])
  useEffect(() => {
    if (requestIdParam || creatorSlug || !draftRestored.current) return
    writeStoredDraft({ filament, colour, printSettings, options, note, deliveryType, address: addressDraft })
  }, [requestIdParam, creatorSlug, filament, colour, printSettings, options, note, deliveryType, addressDraft])

  useEffect(() => {
    if (!creatorSlug) { setCreatorState('none'); setCreator(null); setService(null); setFarmProfile(null); return }
    let cancelled = false
    setCreatorState('loading')
    fetch(`/api/creators/${encodeURIComponent(creatorSlug)}/print-service`)
      .then((res) => res.ok ? res.json() : null).then((data) => {
        if (cancelled) return
        if (!data?.enabled || !data.service) { setCreatorState('unavailable'); return }
        const profile = data.profile || { materials: [], deliveryOptions: [], machineLimits: null, offers: {}, leadTimeDays: data.service.leadTimeDays }
        const first = profile.materials.find((item) => item.filament === 'pla') || profile.materials[0]
        setCreator(data.creator); setService(data.service); setFarmProfile(profile)
        setFilament(first?.filament || ''); setColour(first?.colours?.[0]?.name || ''); setPerPartColours(null)
        setCreatorState('ready')
      }).catch(() => { if (!cancelled) setCreatorState('unavailable') })
    return () => { cancelled = true }
  }, [creatorSlug])

  // Delivery options arrive after mount; keep the choice valid. A creator's
  // print farm has its own list (or follows Fix It Today's).
  const farmReady = creatorState === 'ready' && Boolean(farmProfile)
  const deliveryOptions = farmReady ? farmProfile.deliveryOptions : config.deliveryTypes
  useEffect(() => {
    if (!deliveryOptions.some((option) => option.type === deliveryType)) setDeliveryType(deliveryOptions[0]?.type || '')
  }, [deliveryOptions, deliveryType])

  // Saved address for courier delivery. An address typed while signed out is
  // saved to the account on sign-in when the account has none; when the two
  // differ, the typed one stays in the form for the customer to confirm.
  const pendingAddress = useRef(null)
  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    fetch('/api/user/contact/address').then((res) => res.ok ? res.json() : null).then(async (data) => {
      if (cancelled) return
      const typed = pendingAddress.current
      if (addressComplete(data?.address)) {
        setSavedAddress(data.address)
        if (addressComplete(typed) && !addressesEqual(typed, data.address)) setEditingAddress(true)
        return
      }
      if (addressComplete(typed)) {
        const saved = await persistAddress(typed)
        if (!cancelled && saved) setSavedAddress(saved)
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [signedIn])
  useEffect(() => { pendingAddress.current = addressDraft }, [addressDraft])

  async function persistAddress(address) {
    const body = { address }
    const res = await fetch('/api/user/contact/address', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await readJson(res)
    if (!res.ok) throw new Error(data.error || 'The address could not be saved. Check the fields and try again.')
    return data.address || body.address
  }

  async function saveAddress() {
    setError('')
    try {
      setAddressSaving(true)
      const saved = await persistAddress(addressDraft)
      setSavedAddress(saved); setEditingAddress(false)
    } catch (err) { setError(err.message) } finally { setAddressSaving(false) }
  }

  const isCreatorFlow = farmReady && Boolean(creator && service)
  // Material cards for a print farm: only what it offers, with its S$/g.
  // Farm stock is unknown, so colours carry no stock badge.
  const farmMaterials = useMemo(() => (farmProfile?.materials || []).map((item) => ({
    value: item.filament, label: item.label, description: MATERIAL_DESCRIPTIONS[item.filament] || '', recommended: false,
    ratePerGram: item.ratePerGram, colours: (item.colours || []).map((entry) => ({ ...entry, stockStatus: 'farm' })),
  })), [farmProfile])
  const selectedMaterial = isCreatorFlow ? farmMaterials.find((item) => item.value === filament) || null : null
  const availableColours = useMemo(() => isCreatorFlow ? selectedMaterial?.colours || [] : coloursForFilament(colours, filament),
    [isCreatorFlow, selectedMaterial, colours, filament])
  const selectedColour = availableColours.find((item) => item.name === colour)
  const colourHex = selectedColour?.hex || null
  const stockStatus = selectedColour?.stockStatus || 'unknown'
  // Fix It Today: rush and priority need an in-stock colour. A print farm
  // offers them only when it set those fees.
  const rushAllowed = isCreatorFlow ? Boolean(farmProfile?.offers?.expedite) : stockStatus === 'in_stock'
  const priorityAllowed = isCreatorFlow ? Boolean(farmProfile?.offers?.priority) : rushAllowed
  const effectiveSettings = useMemo(() => buildPrintSettings({ filament, settings: printSettings }), [filament, printSettings])
  const creatorConfiguration = useMemo(() => mapPurposeToConfiguration({ purpose, colour, filament: filament || 'pla' }, []), [purpose, colour, filament])
  const quoteSettings = useMemo(() => printSettingsToQuoteSettings(isCreatorFlow ? creatorConfiguration.printSettings : effectiveSettings),
    [isCreatorFlow, creatorConfiguration, effectiveSettings])
  const formats = isCreatorFlow ? service.acceptedFormats : ['stl', 'obj', '3mf']
  const fileError = file ? validatePrintFile(file, formats) : null
  const hasModel = Boolean(scene && metrics)
  const useStoredModel = Boolean(requestId && storedModel && !file)
  const deliveryOption = deliveryOptions.find((option) => option.type === deliveryType) || deliveryOptions[0] || null
  const useSavedAddress = Boolean(savedAddress) && !editingAddress
  const effectiveAddress = useSavedAddress ? savedAddress : addressDraft
  const machineLimits = isCreatorFlow ? farmProfile.machineLimits : config.machineLimits
  const clientLimits = metrics ? checkMachineLimits(metrics.dimensionsCm, null, machineLimits) : { fits: true }
  const tooBig = hasModel && (!clientLimits.fits || (quoteState === 'error' && TOO_LARGE.test(quoteError)))
  const checklist = useMemo(() => {
    // The creator arranges delivery with the customer directly, so a print
    // farm's courier option needs no address on this page.
    const items = buildChecklist({ hasModel, fits: !tooBig, hasColour: isCreatorFlow ? Boolean(selectedMaterial && colour) : Boolean(colour || perPartColours),
      delivery: isCreatorFlow && deliveryOption ? { ...deliveryOption, needsAddress: false } : deliveryOption, address: effectiveAddress })
    if (isCreatorFlow) items[3] = { ...items[3], label: 'Delivery option chosen' }
    return items
  }, [hasModel, tooBig, isCreatorFlow, selectedMaterial, colour, perPartColours, deliveryOption, effectiveAddress])
  const ready = checklist.every((item) => item.ok) && !fileError
  const busy = submitting || parsing || importing || loadState === 'loading' || locked
  // A print farm's price is always an estimate: the creator confirms it.
  const estimateOnly = isCreatorFlow || metrics?.confidence === 'low' || quote?.confidence === 'low'

  useEffect(() => {
    if ((!rushAllowed && options.expedite) || (!priorityAllowed && options.priority)) {
      setOptions((current) => ({ ...current, expedite: rushAllowed && current.expedite, priority: priorityAllowed && current.priority }))
    }
  }, [rushAllowed, priorityAllowed, options.expedite, options.priority])

  useEffect(() => {
    setQuote(null); setQuoteError('')
    if (!(metrics?.volumeCm3 > 0) || (isCreatorFlow && !(filament && colour))) { setQuoteState('idle'); return }
    const abort = new AbortController()
    setQuoteState('loading')
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.signal,
          body: JSON.stringify({ volumeCm3: metrics.volumeCm3, dimensionsCm: metrics.dimensionsCm, confidence: metrics.confidence,
            settings: quoteSettings, options: pickOptions(options),
            ...(colour ? { selection: { filament, colour } } : {}),
            // A print farm's estimate is priced on the server with the farm's
            // saved profile. A saved model is re-measured on the server so the
            // preview shows the same number the cart will charge.
            ...(isCreatorFlow ? { creatorUserId: creator.userId, preview: true } : useStoredModel ? { requestId, preview: true } : {}) }) })
        const data = await readJson(res)
        if (!res.ok || !Number.isFinite(data.quote?.total)) throw new Error(data.error || 'The instant estimate is unavailable. You can still send the model for review.')
        if (!abort.signal.aborted) { setQuote(data.quote); setQuoteState('ready') }
      } catch (err) {
        if (!abort.signal.aborted) { setQuoteError(err.message); setQuoteState('error') }
      }
    }, 350)
    return () => { clearTimeout(timer); abort.abort() }
  }, [metrics, quoteSettings, options, filament, colour, isCreatorFlow, creator, useStoredModel, requestId])

  const loadBuffer = useCallback(async (name, buffer, version) => {
    const store = useStore.getState()
    store.setFileName(name)
    store.setBuffers(new Map([[name, buffer]]))
    await store.generateScene({})
    if (version !== loadVersion.current) return null
    const loaded = useStore.getState()
    if (!loaded.scene) throw new Error(loaded.loadError || 'This file could not be previewed. Try exporting it as STL or OBJ.')
    setScene(loaded.scene); setMetrics(loaded.geometryMetrics)
    return loaded
  }, [])

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
      const loaded = await loadBuffer(nextFile.name, buffer, version)
      if (loaded) setFile(nextFile)
    } catch (err) {
      if (version === loadVersion.current) setError(err.message || 'The model could not be read.')
      throw err
    } finally { if (version === loadVersion.current) setParsing(false) }
  }

  // ?requestId= re-opens a saved request with every choice filled in.
  useEffect(() => {
    if (!requestIdParam || !isLoaded || !user) return
    let cancelled = false
    const version = ++loadVersion.current
    setLoadState('loading'); setLoadError(''); setNotice('')
    ;(async () => {
      const res = await fetch(`/api/custom-print?requestId=${encodeURIComponent(requestIdParam)}`)
      const data = await readJson(res)
      if (!res.ok || !data.request) {
        // Unknown or not ours: forget the id so nothing below tries to save to it.
        if (cancelled) return
        setRequestId(''); draft.current.requestId = null; setStoredModel(null)
        setNotice(`${data.error || 'That print request could not be found.'} You can start a fresh request below.`)
        setLoadState('ready')
        return
      }
      if (cancelled) return
      const request = data.request
      const restored = restoreFromRequest(request, colours)
      setRequestId(request.requestId); draft.current.requestId = request.requestId
      setPrintSettings(restored.printSettings); setFilament(restored.filament)
      setPerPartColours(restored.perPartColours ? restored.meshColors : null)
      setColour(restored.perPartColours ? '' : restored.colour || coloursForFilament(colours, restored.filament)[0]?.name || '')
      setOptions(restored.options); setNote(restored.note); setSource(restored.source)
      setLocked(restored.locked); setLockReason(restored.lockReason); setModelLocked(restored.modelLocked)
      if (request.modelFile?.s3Key) {
        setStoredModel(request.modelFile)
        const modelResponse = await fetch(`/api/proxy?key=${encodeURIComponent(request.modelFile.s3Key)}`)
        if (!modelResponse.ok) throw new Error('The saved model could not be downloaded. Reload this page to retry.')
        const buffer = await modelResponse.arrayBuffer()
        if (cancelled) return
        await loadBuffer(request.modelFile.originalName || request.modelFile.s3Key.split('/').pop(), buffer, version)
      }
      if (!cancelled) setLoadState('ready')
    })().catch((err) => { if (!cancelled) { setLoadError(err.message || 'This print request could not be opened.'); setLoadState('error') } })
    return () => { cancelled = true }
    // colours only name the restored colour; a later stock refresh must not reload the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestIdParam, isLoaded, user, loadBuffer])

  async function uploadModel() {
    const contentType = getMimeType(file.name.split('.').pop().toLowerCase())
    const signedRes = await fetch('/api/upload/models', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, contentType, fileSize: file.size }) })
    const signed = await readJson(signedRes)
    if (!signedRes.ok || !signed.url) throw new Error(signed.error || 'Unable to prepare your model upload.')
    await putWithProgress({ url: signed.url, body: file, contentType, onProgress: setProgress })
    return { originalName: file.name, s3Key: signed.key, fileSize: file.size }
  }

  // Creates the request on first save, uploads a newly chosen model and stores
  // the note. Returns the request id. A lost response may follow a successful
  // save, so the upload is retained rather than deleted on failure.
  async function saveDraft() {
    if (draft.current.creatorSlug !== creatorSlug) draft.current = { creatorSlug, requestId: null }
    let id = draft.current.requestId
    if (!id) {
      const res = await fetch('/api/custom-print', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isCreatorFlow ? { creatorUserId: creator.userId } : {}) })
      const data = await readJson(res)
      if (!res.ok || !data.requestId) throw new Error(data.error || 'Unable to start your request. Please try again.')
      id = data.requestId
      draft.current.requestId = id
      setRequestId(id)
    }
    const modelFile = file ? await uploadModel() : null
    // Per-part colours from the editor are carried unchanged and carry no
    // single generic colour; otherwise every part takes the chosen swatch.
    const meshColors = perPartColours ? { ...perPartColours } : {}
    if (!perPartColours && !isCreatorFlow && colourHex) scene?.traverse((mesh) => { if (mesh.isMesh) meshColors[mesh.name] = colourHex })
    const generic = perPartColours ? null : buildGeneric({ printSettings: effectiveSettings, colour })
    const printConfiguration = isCreatorFlow
      ? { generic: { ...creatorConfiguration.generic, material: selectedMaterial.label, filament, colour: colour || null }, isConfigured: true }
      : { ...(generic ? { generic } : {}), printSettings: effectiveSettings, meshColors, isConfigured: true }
    // An already quoted request only accepts its note here; its settings go
    // through /api/custom-print/config, which re-quotes them.
    const saved = await fetch('/api/custom-print', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: id, customerNote: note.slice(0, 1000), ...(modelLocked ? {} : { printConfiguration }),
        ...(modelFile ? { modelFile, designSource: source } : {}) }) })
    if (!saved.ok) throw new Error((await readJson(saved)).error || 'Unable to save your print request.')
    if (modelFile) { setStoredModel(modelFile); setFile(null) }
    return { id, meshColors, generic }
  }

  async function run(action, work) {
    if (submitting || importing || parsing) return
    setError('')
    if (!signedIn) { setError('Sign in to save your request. Your model stays on this page.'); return }
    const problem = file ? validatePrintFile(file, formats) : hasModel ? null : 'Choose a 3D model file.'
    if (problem) { setError(problem); return }
    if (isCreatorFlow && !selectedMaterial) { setError('Choose a material.'); return }
    try {
      setSubmitting(true); setBusyAction(action); setProgress(0)
      await work()
    } catch (err) {
      setError(err.message || 'Unable to save your print request.'); setProgress(0)
    } finally { setSubmitting(false); setBusyAction('') }
  }

  const addToCart = (event) => {
    event?.preventDefault?.()
    run('cart', async () => {
      // A typed (or edited) courier address is saved first; checkout needs it.
      if (!isCreatorFlow && deliveryOption?.needsAddress && !useSavedAddress) {
        const saved = await persistAddress(addressDraft)
        setSavedAddress(saved); setEditingAddress(false)
      }
      const { id, meshColors, generic } = await saveDraft()
      if (isCreatorFlow) {
        // The farm's estimate is re-measured and saved on the request for the
        // creator to confirm. It is never a cart price: payment is arranged
        // directly with the creator. A failed estimate still sends the request.
        const estimateRes = await fetch('/api/custom-print/estimate', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: id, options: pickOptions(options), ...(deliveryOption ? { deliveryType: deliveryOption.type } : {}) }) }).catch(() => null)
        if (!estimateRes?.ok) toast?.showToast?.(`Request sent. ${creator.displayName} will price it on review.`, 'info')
        router.push('/account/prints'); return
      }
      const configRes = await fetch('/api/custom-print/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: id, mode: 'instant', printSettings: effectiveSettings, meshColors,
          ...(generic ? { generic } : {}), options: pickOptions(options) }) })
      const configData = await readJson(configRes)
      if (!configRes.ok) throw new Error(configData.error || 'Could not save your print settings.')
      if (!configData.quote) {
        const quoteRes = await fetch('/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: id, mode: 'instant', volumeCm3: metrics.volumeCm3, dimensionsCm: metrics.dimensionsCm,
            confidence: metrics.confidence || 'low', settings: quoteSettings, options: pickOptions(options) }) })
        const quoteData = await readJson(quoteRes)
        if (!quoteRes.ok) throw new Error(quoteData.error || 'Your settings were saved, but the price could not be confirmed. Please try again.')
      }
      const cartRes = await fetch('/api/cart/custom-print', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: id }) })
      if (!cartRes.ok) throw new Error((await readJson(cartRes)).error || 'Could not add this print to your cart.')
      if (deliveryOption && !deliveryOption.fallback) {
        // The cart stores the delivery choice on its line; a failure here only
        // leaves the cart's default, which the customer can change there.
        const deliveryRes = await fetch('/api/user/cart/delivery', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: `custom-print:${id}`, variantId: null, selectedVariants: null, chosenDeliveryType: deliveryOption.type }) }).catch(() => null)
        if (!deliveryRes?.ok) toast?.showToast?.(`Added to cart, but ${deliveryOption.displayName} could not be set. Pick the delivery option in the cart.`, 'error')
      }
      clearStoredDraft()
      router.push('/cart')
    })
  }

  const openEditor = () => run('editor', async () => {
    const { id } = await saveDraft()
    const returnTo = `/prints/request?requestId=${encodeURIComponent(id)}`
    router.push(`/editor?requestId=${encodeURIComponent(id)}&returnTo=${encodeURIComponent(returnTo)}`)
  })

  const requestManualQuote = () => run('manual', async () => {
    const { id, meshColors, generic } = await saveDraft()
    const res = await fetch('/api/custom-print/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: id, mode: 'manual', printSettings: effectiveSettings, meshColors, ...(generic ? { generic } : {}) }) })
    if (!res.ok) throw new Error((await readJson(res)).error || 'Could not send your request for a manual quote.')
    clearStoredDraft()
    router.push('/account/prints')
  })

  if (creatorState === 'loading') return <p className="mx-auto max-w-6xl p-8">Loading print service…</p>
  if (creatorState === 'unavailable') return <div className="mx-auto max-w-2xl p-8"><h1 className="text-2xl font-semibold">Print service unavailable</h1><p className="my-4">This creator is not accepting print requests right now.</p><Link href="/prints/request" className="underline">Request a print from Fix It Today</Link></div>
  if (requestIdParam && isLoaded && !user) {
    const here = `/prints/request?requestId=${encodeURIComponent(requestIdParam)}`
    return <div className="mx-auto max-w-2xl p-8 text-center"><h1 className="text-2xl font-semibold">Your saved print request</h1><p className="my-4 text-sm text-lightColor">Sign in to open this request and continue where you left off.</p>
      <SignInButton mode="modal" forceRedirectUrl={here}><button type="button" className="rounded-lg bg-textColor px-5 py-3 text-sm font-semibold text-background">Sign in</button></SignInButton></div>
  }

  const printedBy = isCreatorFlow ? creator.displayName : 'Fix It Today'
  const modelSummary = hasModel ? (file?.name || storedModel?.originalName || 'Model ready') : 'STL, OBJ, 3MF'
  const settingsSummary = `${strengthFromSettings(effectiveSettings) || 'Custom'} · ${qualityFromSettings(effectiveSettings) || 'Custom'}`
  const grams = quote?.inputs?.weightGrams ?? null
  const fileName = file?.name || storedModel?.originalName || ''
  const cartLabel = busyAction === 'cart' ? (progress > 0 && progress < 100 ? `Uploading ${progress}%` : 'Saving your request…')
    : isCreatorFlow ? `Send request to ${creator.displayName}` : 'Add to cart'
  const leadTimeDays = farmProfile?.leadTimeDays || service?.leadTimeDays

  return (
    <div className="min-h-screen bg-[#f7f8fa] px-4 py-8 text-textColor sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-lightColor">{printedBy} · 3D printing</p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Get a 3D print made</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-lightColor">{isCreatorFlow
              ? `${service.headline} · About ${leadTimeDays} days. Payment is arranged directly with the creator.`
              : 'Upload a model, choose material and colour, and see the price as you go. Nothing is charged until you check out.'}</p>
          </div>
          {!signedIn && <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-blue-800">No account needed to get a price</span>}
        </div>
        {loadError && <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{loadError} <Link href="/account/prints" className="underline">Your print requests</Link></p>}
        {notice && <p role="status" className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">{notice} <Link href="/account/prints" className="underline">Your print requests</Link></p>}
        {locked && <p role="status" className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">{lockReason} <Link href="/account/prints" className="underline">View your print requests</Link> or <Link href="/prints/request" className="underline">start a new one</Link>.</p>}
        <form onSubmit={addToCart} className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="min-w-0 space-y-4">
            <StepCard number={1} title="Your model" summary={modelSummary} done={hasModel}>
              <ModelStep file={file} fileName={fileName} scene={scene} metrics={metrics} source={source} formats={formats} parsing={parsing} importing={importing}
                disabled={busy} modelLocked={modelLocked} colourHex={colourHex} meshColors={perPartColours} layerHeight={effectiveSettings.layerHeight}
                grams={grams} tooBig={tooBig} limitMessage={quoteState === 'error' && TOO_LARGE.test(quoteError) ? quoteError : ''}
                onChooseFile={(nextFile) => chooseFile(nextFile, source).catch(() => {})} onImport={chooseFile} onBusyChange={setImporting}
                onSource={(value) => { loadVersion.current += 1; setFile(null); setScene(null); setMetrics(null); setQuote(null); setSource(normalizeDesignSource(value)) }} />
            </StepCard>
            <StepCard number={2} title="Material and colour" summary={isCreatorFlow ? [selectedMaterial?.label, colour].filter(Boolean).join(' · ') : ''} done={isCreatorFlow ? Boolean(selectedMaterial && colour) : Boolean(colour)}>
              {isCreatorFlow ? farmMaterials.length ? <MaterialColourStep materials={farmMaterials} filament={filament} colour={colour} disabled={busy}
                note={`Materials and colours ${creator.displayName} offers. Tell them about strength or appearance needs in your note.`}
                onChange={(next) => { setFilament(next.filament); setColour(next.colour) }} />
                : <p role="status" className="text-sm text-amber-800">{creator.displayName} has not listed any materials yet. Check back soon.</p>
                : <MaterialColourStep colours={colours} filament={filament} colour={colour} perPart={Boolean(perPartColours)} disabled={busy}
                onChange={(next) => { setPerPartColours(null); setFilament(next.filament); setColour(next.colour) }} />}
            </StepCard>
            <StepCard number={3} title="How it should be printed" summary={isCreatorFlow ? (purpose || 'Balanced') : settingsSummary} done>
              {isCreatorFlow ? <div className="space-y-4">
                <fieldset disabled={busy}>
                  <legend className="text-sm font-medium">Purpose <span className="font-normal text-lightColor">(optional)</span></legend>
                  <div className="mt-2 grid grid-cols-3 gap-2">{Object.keys(PURPOSE_PRESETS).map((item) => <button key={item} type="button" aria-pressed={purpose === item}
                    onClick={() => setPurpose(item)} className={`min-h-11 rounded-lg border px-2 text-sm ${purpose === item ? 'border-slate-900 bg-textColor text-background' : 'border-borderColor'}`}>{item}</button>)}</div>
                  <button type="button" onClick={() => setPurpose('')} className="mt-2 text-xs underline underline-offset-4">Use balanced defaults</button>
                  <p className="mt-2 text-xs text-lightColor">These are preferences for the creator to review. They will confirm the material, printing process and final settings.</p>
                </fieldset>
                <div className="flex flex-wrap gap-5 text-sm">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={options.postProcessing} disabled={busy}
                    onChange={(event) => setOptions({ ...options, postProcessing: event.target.checked })} />Sand and finish</label>
                  {rushAllowed && <label className="flex items-center gap-2"><input type="checkbox" checked={options.expedite} disabled={busy}
                    onChange={(event) => setOptions({ ...options, expedite: event.target.checked })} />Rush, sooner</label>}
                  {priorityAllowed && <label className="flex items-center gap-2"><input type="checkbox" checked={options.priority} disabled={busy}
                    onChange={(event) => setOptions({ ...options, priority: event.target.checked })} />Priority</label>}
                </div>
                <label htmlFor="notes" className="block text-sm font-medium">Anything else? <span className="font-normal text-lightColor">Optional</span>
                  <textarea id="notes" rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Deadline, fit, finish or how you will use the part" className="mt-2 w-full rounded-lg border border-borderColor p-3 text-sm font-normal" /></label>
              </div> : <PrintSettingsStep printSettings={effectiveSettings} onSettings={setPrintSettings} note={note} onNote={setNote} options={options} onOptions={setOptions}
                rushAllowed={rushAllowed} quoteLines={quote?.lines} disabled={busy} onOpenEditor={openEditor} onManualQuote={requestManualQuote}
                busyAction={busyAction} signedIn={signedIn} canSave={hasModel && !fileError} />}
            </StepCard>
            <StepCard number={4} title="Delivery" summary={deliveryOption?.displayName || ''} done={checklist[3]?.ok}>
              {isCreatorFlow ? deliveryOptions.length ? <DeliveryStep options={deliveryOptions} value={deliveryOption?.type || ''} onSelect={setDeliveryType} disabled={busy}
                addressNote={`${creator.displayName} arranges collection or courier with you directly once they confirm the price.`} />
                : <p className="text-sm text-lightColor">{creator.displayName} arranges collection or courier with you directly.</p>
                : config.state === 'error' ? <p role="alert" className="text-sm text-red-700">Delivery options unavailable. Reload this page to try again.</p>
                : config.state === 'loading' ? <p className="text-sm text-lightColor">Loading delivery options…</p> : <DeliveryStep options={deliveryOptions} value={deliveryOption?.type || ''} onSelect={setDeliveryType} savedAddress={savedAddress} editing={editingAddress}
                onEdit={() => { setAddressDraft({ ...EMPTY_ADDRESS, ...savedAddress }); setEditingAddress(true) }} address={addressDraft} onAddress={setAddressDraft}
                onSaveAddress={saveAddress} saving={addressSaving} signedIn={signedIn} disabled={busy} />}
            </StepCard>
          </div>
          <PricePanel quote={quote} quoteState={quoteState} quoteError={quoteError} delivery={deliveryOption} filament={filament}
            checklist={checklist} ready={ready} printedBy={printedBy} estimateOnly={estimateOnly} submitting={submitting} progress={progress} error={error || fileError}
            hasModel={hasModel} hint={isCreatorFlow ? `${creator.displayName} confirms the final quote before printing.` : 'You can still edit everything in the cart.'}
            totalNote={isCreatorFlow ? `${creator.displayName} confirms the final price. Payment is arranged directly with the creator.` : undefined}
            checklistLabel={isCreatorFlow ? 'Before you send your request' : undefined}
            cta={!signedIn ? <><SignInButton mode="modal"><button type="button" disabled={!ready || busy} className={primary}>{isCreatorFlow ? 'Sign in to send your request' : 'Sign in to add to cart'}</button></SignInButton>
              <p className="text-center text-xs text-lightColor">Signing in with Google reloads this page; your choices are kept, but the file will need to be added again.</p></>
              : <button type="submit" disabled={!ready || busy || !isLoaded} className={primary}>{cartLabel}</button>}>
            {isCreatorFlow && leadTimeDays && <p className="pb-1 text-xs text-lightColor">Ready in about {leadTimeDays} days once {creator.displayName} confirms.</p>}
          </PricePanel>
        </form>
      </div>
    </div>
  )
}
