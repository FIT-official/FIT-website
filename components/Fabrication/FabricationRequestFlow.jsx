'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { SignInButton, useUser } from '@clerk/nextjs'
import PersonalizationEditor from './PersonalizationEditor'
import { pricingBasisForOffer } from '@/lib/fabrication/catalog'
import { Field, AssetInput, fieldClass, cardClass, buttonClass, minorButtonClass, readResponse, uploadFabricationAsset, defaultPersonalization, EstimateBreakdown, money } from './shared'

const MAX_BYTES = 3 * 1024 * 1024
const initialChoices = offer => Object.fromEntries((offer?.optionGroups || []).filter(group => group.required && group.choices.length).map(group => [group.id, group.choices[0].id]))

export default function FabricationRequestFlow() {
  const params = useSearchParams()
  const creatorId = params?.get('creator') || ''
  const initialOffer = params?.get('offer') || ''
  const { user, isLoaded } = useUser()
  const [catalog, setCatalog] = useState(null)
  const [loading, setLoading] = useState(true)
  const [offerId, setOfferId] = useState('')
  const [materialId, setMaterialId] = useState('')
  const [dimensions, setDimensions] = useState({ widthMm: 80, heightMm: 30, depthMm: 10 })
  const [quantity, setQuantity] = useState(1)
  const [selectedOptions, setSelectedOptions] = useState({})
  const [note, setNote] = useState('')
  const [personalization, setPersonalization] = useState(defaultPersonalization)
  const [photo, setPhoto] = useState(null)
  const [photoUrl, setPhotoUrl] = useState('')
  const [reference, setReference] = useState(null)
  const [snapshot, setSnapshot] = useState(null)
  const [estimateState, setEstimateState] = useState('idle')
  const [estimateError, setEstimateError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState(false)
  const [submitted, setSubmitted] = useState(null)
  const draft = useRef(null)
  const createAttempted = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setCatalog(null); setError(''); setSubmitted(null); setLocked(false); draft.current = null; createAttempted.current = false
    if (!creatorId) { setLoading(false); return () => controller.abort() }
    fetch(`/api/creators/${encodeURIComponent(creatorId)}/fabrication-service${initialOffer ? `?offerId=${encodeURIComponent(initialOffer)}` : ''}`, { signal: controller.signal })
      .then(readResponse).then(data => {
        if (controller.signal.aborted) return
        if (!data.enabled || !data.offers?.length) throw new Error('This provider is not accepting custom service requests right now.')
        setCatalog(data)
        const selected = data.offers.find(offer => offer.id === initialOffer) || data.offers[0]
        setOfferId(selected.id); setMaterialId(selected.materials[0]?.id || '')
        setSelectedOptions(initialChoices(selected))
        setPersonalization({ ...defaultPersonalization(), ...(selected.template || {}) }); setPhoto(null); setReference(null)
      }).catch(cause => { if (!controller.signal.aborted) setError(cause.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [creatorId, initialOffer])

  useEffect(() => {
    if (!photo) { setPhotoUrl(''); return }
    const url = URL.createObjectURL(photo)
    setPhotoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  const offer = catalog?.offers?.find(item => item.id === offerId)
  const uploadsAvailable = catalog?.uploadsAvailable === true
  const material = offer?.materials?.find(item => item.id === materialId)
  const basis = pricingBasisForOffer(offer || { kind: 'custom' })
  const imageUrl = photoUrl || offer?.template?.imageUrl || ''
  const needsRegion = Boolean(imageUrl && personalization.text?.trim() && !personalization.region)
  const input = useMemo(() => ({
    offerId, materialId,
    ...(basis.requiresWidth ? { widthMm: Number(dimensions.widthMm) } : {}),
    ...(basis.requiresHeight ? { heightMm: Number(dimensions.heightMm) } : {}),
    ...(basis.requiresDepth ? { depthMm: Number(dimensions.depthMm) } : {}), quantity: Number(quantity), customerNote: note, selectedOptions,
    ...(imageUrl && personalization.text?.trim() ? { personalization: { text: personalization.text, region: personalization.region, fontFamily: personalization.fontFamily, textColor: personalization.textColor } } : {}),
  }), [offerId, materialId, dimensions, basis.requiresWidth, basis.requiresHeight, basis.requiresDepth, quantity, note, imageUrl, personalization, selectedOptions])

  useEffect(() => {
    setSnapshot(null); setEstimateError('')
    if (!catalog || !offerId || !materialId) return
    const controller = new AbortController()
    setEstimateState('loading')
    const timer = setTimeout(() => {
      // Placement does not change the rate. Local images remain in the browser
      // until submission, when the server verifies attachment ownership.
      const { personalization: _placement, ...pricingInput } = input
      fetch('/api/fabrication/estimate', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ creatorId, ...pricingInput }) })
        .then(readResponse).then(data => { if (!controller.signal.aborted) { setSnapshot(data.estimate); setEstimateState('ready') } })
        .catch(cause => { if (!controller.signal.aborted) { setEstimateError(cause.message); setEstimateState('error') } })
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [creatorId, catalog, offerId, materialId, input])

  function changeOffer(id) {
    const selected = catalog.offers.find(item => item.id === id)
    setOfferId(id); setMaterialId(selected.materials[0]?.id || ''); setPhoto(null); setReference(null)
    setSelectedOptions(initialChoices(selected))
    setPersonalization({ ...defaultPersonalization(), ...(selected.template || {}) }); setError('')
  }
  function choosePhoto(file) {
    if (!file || !uploadsAvailable) return
    setError('')
    if (file.size > MAX_BYTES || !['image/png','image/jpeg','image/webp'].includes(file.type)) { setError('Choose a PNG, JPEG or WebP image up to 3 MB.'); return }
    setPhoto(file); setPersonalization(current => ({ text: current.text, fontFamily: current.fontFamily, textColor: current.textColor }))
  }
  function chooseReference(file) {
    if (!file || !uploadsAvailable) return
    setError('')
    if (file.size > MAX_BYTES || !/\.(stl|obj|3mf|pdf)$/i.test(file.name)) { setError('Choose an STL, OBJ, 3MF or PDF file up to 3 MB.'); return }
    setReference(file)
  }
  async function submit() {
    if (!user || busy || needsRegion || (!snapshot && !draft.current)) return
    if (!uploadsAvailable && (photo || reference)) { setError('Image and reference uploads are not available yet. Remove the attachments to send your request.'); return }
    setBusy(true); setLocked(true); setError('')
    try {
      if (!draft.current) draft.current = { creatorId, ...input, clientRequestId: crypto.randomUUID(), imageAssetId: photo ? undefined : offer?.template?.assetId }
      if (photo && !draft.current.imageAssetId) draft.current.imageAssetId = (await uploadFabricationAsset(photo)).assetId
      if (reference && !draft.current.referenceAssetId) draft.current.referenceAssetId = (await uploadFabricationAsset(reference)).assetId
      createAttempted.current = true
      const data = await readResponse(await fetch('/api/fabrication/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft.current) }))
      setSubmitted(data.request)
    } catch (cause) {
      if (!createAttempted.current) { setLocked(false); draft.current = null; setError(`${cause.message} Check your files and try again.`) }
      else setError(`${cause.message} Your draft is kept; retrying will use the same request.`)
    } finally { setBusy(false) }
  }

  if (loading) return <p className="p-8 text-sm">Loading custom services…</p>
  if (!creatorId) return <main className="mx-auto max-w-xl space-y-4 px-6 py-14"><h1>Custom services</h1><p>Choose a provider’s service from their storefront to personalise your design and see an estimate.</p><Link href="/creators" className={buttonClass}>Find a provider</Link></main>
  if (!catalog) return <main className="mx-auto max-w-xl space-y-4 px-6 py-14"><h1>Custom services</h1><p role="alert">{error || 'This service is unavailable.'}</p><Link href={`/creators/${encodeURIComponent(creatorId)}`} className="underline">Back to the provider</Link></main>
  if (submitted) return <main className="mx-auto max-w-2xl space-y-5 px-6 py-14"><p className="text-xs uppercase tracking-widest text-lightColor">Request received</p><h1>Your idea is with the provider.</h1><p className="text-lightColor">They will review your material, dimensions and personalisation before confirming the price and production details.</p><p className="text-sm">Reference: {submitted.requestId}</p><Link href="/account/services" className={buttonClass}>View my service requests</Link></main>
  return <main className="bg-baseColor text-textColor">
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-8 max-w-2xl"><Link className="text-xs uppercase tracking-widest text-lightColor" href={`/creators/${encodeURIComponent(creatorId)}`}>{catalog.creator?.name || 'Custom services'}</Link><h1 className="mt-3">Make it yours.</h1><p className="mt-3 text-sm leading-relaxed text-lightColor">Choose your service and material. Add a design or personalise a name tag, then send it to the provider for confirmation.</p></header>
      {error && <p role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <fieldset disabled={busy || locked} className="min-w-0 space-y-6">
          <section className={`${cardClass} space-y-5`}><h2 className="text-lg font-semibold">1. Choose your service</h2>
            <Field label="Service"><select className={fieldClass} value={offerId} onChange={event => changeOffer(event.target.value)}>{catalog.offers.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>
            <Link href={`/creators/${encodeURIComponent(creatorId)}`} className="inline-block text-xs underline">Browse this shop’s other services</Link>
            <p className="text-sm text-lightColor">{offer?.description}</p>
            <Field label={basis.id === 'area' ? 'Material & thickness' : 'Material / variant'}><select className={fieldClass} value={materialId} onChange={event => setMaterialId(event.target.value)}>{offer?.materials.map(item => <option value={item.id} key={item.id}>{item.name}{item.thicknessMm ? ` · ${item.thicknessMm} mm` : ''}</option>)}</select></Field>
            <div className="grid grid-cols-2 gap-4">{[...(basis.requiresWidth ? [['widthMm',basis.id === 'length' ? 'Length (mm)' : 'Width (mm)',material?.maxWidthMm]] : []),...(basis.requiresHeight ? [['heightMm','Height (mm)',material?.maxHeightMm]] : []),...(basis.requiresDepth ? [['depthMm','Depth (mm)',material?.maxDepthMm]] : [])].map(([key,label,max]) => <Field key={key} label={label}><input type="number" className={fieldClass} min="0.1" step="0.1" max={max} value={dimensions[key]} onChange={event => setDimensions(current => ({ ...current, [key]: event.target.value }))} /></Field>)}<Field label="Quantity"><input type="number" min="1" max="1000" step="1" className={fieldClass} value={quantity} onChange={event => setQuantity(event.target.value)} /></Field></div>
            {(offer?.optionGroups || []).map(group => <Field key={group.id} label={`${group.name}${group.required ? '' : ' (optional)'}`}><select className={fieldClass} value={selectedOptions[group.id] || ''} onChange={event => setSelectedOptions(current => { const next = { ...current }; if (event.target.value) next[group.id] = event.target.value; else delete next[group.id]; return next })}>{!group.required && <option value="">No extra option</option>}{group.choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}{choice.priceDelta > 0 ? ` (+${money(choice.priceDelta)} / item)` : ''}</option>)}</select></Field>)}
            <p className="text-xs text-lightColor">{basis.requiresWidth ? 'Enter the real finished size. Photos do not establish physical dimensions. ' : ''}Typical lead time: {offer?.leadTimeDays} days after approval.</p>
          </section>
          <section className={`${cardClass} space-y-4`}><h2 className="text-lg font-semibold">2. Your design</h2>
            {!uploadsAvailable && <p role="status" className="text-sm text-lightColor">Image and reference uploads are not available yet. You can still describe your request below.</p>}
            <Field label="Add your image (optional)" hint="PNG, JPEG or WebP · up to 3 MB · a straight-on photo works best"><AssetInput accept="image/png,image/jpeg,image/webp" disabled={!uploadsAvailable} label={photo ? 'Replace image' : 'Choose image'} onPick={choosePhoto} /></Field>
            {photo && <div className="flex flex-wrap items-center gap-2 text-xs"><span className="break-all">{photo.name}</span><button type="button" className="underline" onClick={() => { setPhoto(null); setPersonalization({ ...defaultPersonalization(), ...(offer.template || {}) }) }}>Use provider template / remove photo</button></div>}
            {imageUrl ? <><PersonalizationEditor readOnly={busy || locked} imageUrl={imageUrl} imageWidth={photo ? undefined : offer.template?.width} imageHeight={photo ? undefined : offer.template?.height} value={personalization} onChange={setPersonalization} allowRegionEdit={Boolean(photo)} allowAutoSuggest={Boolean(photo)} /><p className="text-xs text-lightColor">{photo ? 'Suggested placement is a starting point. Adjust it if needed; the provider can revise the text area before production.' : 'The text area is set by your provider.'} Preview colour represents the layout; the marking process determines the final finish.</p></> : uploadsAvailable && <p className="rounded-lg bg-baseColor p-4 text-sm text-lightColor">Upload an image to preview a name or marking area.</p>}
            <Field label="Production or reference file (optional)" hint="STL, OBJ, 3MF or PDF · up to 3 MB · reviewed by the provider"><AssetInput accept=".stl,.obj,.3mf,.pdf" disabled={!uploadsAvailable} label={reference ? 'Replace file' : 'Choose file'} onPick={chooseReference} /></Field>
            {reference && <div className="flex flex-wrap items-center gap-2 text-xs"><span className="break-all">{reference.name}</span><button type="button" className="underline" onClick={() => setReference(null)}>Remove file</button></div>}
            <Field label="Anything else? (optional)" hint="Finish, artwork details, deadline or a design reference link"><textarea className={fieldClass} rows={3} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} /></Field>
          </section>
        </fieldset>
        <aside className={`${cardClass} space-y-5 lg:sticky lg:top-6`}><h2 className="text-lg font-semibold">3. Your estimate</h2>
          {estimateState === 'loading' && <p className="text-sm text-lightColor" role="status">Updating estimate…</p>}
          {estimateError && <p role="alert" className="text-sm text-red-700">{estimateError}</p>}
          <EstimateBreakdown snapshot={snapshot} />
          {needsRegion && <p className="text-sm text-amber-800">Choose or confirm a text area on your image before sending.</p>}
          {!isLoaded ? <p className="text-sm">Loading account…</p> : user ? <button type="button" className={`${buttonClass} w-full`} onClick={submit} disabled={busy || needsRegion || (!snapshot && !draft.current)}>{busy ? 'Sending request…' : locked ? 'Retry submitting request' : 'Send to provider'}</button> : <SignInButton mode="modal"><button type="button" className={`${buttonClass} w-full`} disabled={!snapshot || needsRegion}>Sign in to send request</button></SignInButton>}
          <p className="text-xs leading-relaxed text-lightColor">Preview before signing in. {uploadsAvailable && 'Your files are uploaded when you send the request and are shared with the provider. '}No payment is collected here.</p>
          {locked && !busy && <Link href="/account/services" className={`${minorButtonClass} w-full`}>Check my existing requests</Link>}
        </aside>
      </div>
    </div>
  </main>
}
