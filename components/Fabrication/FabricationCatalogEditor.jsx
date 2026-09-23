'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FABRICATION_KINDS, emptyFabricationCatalog, createFabricationOffer, pricingBasisForOffer } from '@/lib/fabrication/catalog'
import PersonalizationEditor from './PersonalizationEditor'
import ServiceOptionsEditor from './ServiceOptionsEditor'
import { Field, AssetInput, fieldClass, cardClass, buttonClass, minorButtonClass, readResponse, uploadFabricationAsset } from './shared'

function cleanCatalog(catalog) {
  return { enabled: Boolean(catalog.enabled), offers: catalog.offers.map(offer => {
    const { template, ...rest } = offer
    return { ...rest, ...(template?.assetId ? { template: { assetId: template.assetId, region: template.region, fontFamily: template.fontFamily || 'sans', textColor: template.textColor || '#182c32' } } : {}) }
  }) }
}

export default function FabricationCatalogEditor() {
  const [catalog, setCatalog] = useState(emptyFabricationCatalog)
  const [access, setAccess] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [newKind, setNewKind] = useState('name_tag')
  const [cursor, setCursor] = useState('')
  const [nextCursor, setNextCursor] = useState(null)
  const [removedOfferIds, setRemovedOfferIds] = useState([])
  const [savedSignature, setSavedSignature] = useState('')
  const [reload, setReload] = useState(0)
  const dirty = removedOfferIds.length > 0 || JSON.stringify(cleanCatalog(catalog)) !== savedSignature
  const uploadsAvailable = access?.uploadsAvailable === true
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetch(`/api/user/fabrication-service${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { signal: controller.signal }).then(readResponse).then(data => {
      if (!controller.signal.aborted) { const loaded = data.catalog || emptyFabricationCatalog(); setCatalog(loaded); setSavedSignature(JSON.stringify(cleanCatalog(loaded))); setRemovedOfferIds([]); setAccess(data); setNextCursor(data.nextCursor || null) }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [cursor, reload])
  const update = (id, patch) => { setMessage(''); setCatalog(current => ({ ...current, offers: current.offers.map(offer => offer.id === id ? { ...offer, ...patch } : offer) })) }
  const materialUpdate = (offer, materialId, key, value) => update(offer.id, { materials: offer.materials.map(material => material.id === materialId ? { ...material, [key]: value, ...(key === 'thicknessMm' ? { maxDepthMm: Math.max(material.maxDepthMm, value) } : {}) } : material) })
  async function addImage(offer, file) {
    if (!file || !uploadsAvailable) return
    setBusy(true); setError(''); setMessage('')
    try {
      const asset = await uploadFabricationAsset(file)
      update(offer.id, { template: { assetId: asset.assetId, imageUrl: asset.imageUrl, width: asset.width, height: asset.height, fontFamily: 'sans', textColor: '#182c32' } })
    } catch (cause) { setError(cause.message) } finally { setBusy(false) }
  }
  async function save(event) {
    event.preventDefault()
    if (catalog.offers.some(offer => offer.template?.assetId && !offer.template.region)) { setError('Choose or confirm the text area for each template image before saving.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      const cleaned = cleanCatalog(catalog)
      const previous = new Map(JSON.parse(savedSignature || '{"offers":[]}').offers.map(offer => [offer.id, offer]))
      const changed = cleaned.offers.filter(offer => JSON.stringify(offer) !== JSON.stringify(previous.get(offer.id)))
      const data = await readResponse(await fetch('/api/user/fabrication-service', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ catalog: { enabled: cleaned.enabled, offers: changed }, ...(removedOfferIds.length ? { removedOfferIds } : {}) }) }))
      const returned = new Map((data.catalog?.offers || []).map(offer => [offer.id, offer]))
      const saved = { ...catalog, enabled: data.catalog?.enabled ?? catalog.enabled, offers: catalog.offers.map(offer => returned.get(offer.id) || offer) }
      setCatalog(saved); setSavedSignature(JSON.stringify(cleanCatalog(saved))); setRemovedOfferIds([])
      setMessage(catalog.enabled ? 'Services saved. Enabled offers are available on your storefront.' : 'Draft saved. Your custom services are hidden.')
    } catch (cause) { setError(cause.message) } finally { setBusy(false) }
  }
  if (loading) return <p className="p-6 text-sm">Loading your services…</p>
  return <div className="space-y-6 text-textColor">
    <header><p className="text-xs uppercase tracking-widest text-lightColor">Pro workspace</p><h1 className="mt-2">Custom services</h1><p className="mt-3 max-w-2xl text-sm text-lightColor">Offer the making services your shop can fulfil, from laser cutting and name tags to CNC work, sewing, casting or specialist printing. Add your own materials, finishes and choices.</p><Link href="/dashboard/service-jobs" className="mt-3 inline-block text-sm underline">View service requests →</Link></header>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {message && <p role="status" className="rounded-lg bg-baseColor p-3 text-sm text-textColor">{message}</p>}
    {access && !access.canManage && <div className={cardClass}><h2 className="text-lg">Custom services are included in Pro</h2><p className="mt-2 text-sm text-lightColor">Your existing service jobs remain available. A verified Pro subscription is needed to publish offers and receive new requests.</p><Link href="/account/subscription" className={`${buttonClass} mt-4`}>View your plan</Link></div>}
    <form onSubmit={save} className="space-y-5">
      <fieldset disabled={busy || !access?.canManage} className="min-w-0 space-y-5 disabled:opacity-60">
        <div className={cardClass}>
          <label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" checked={catalog.enabled} onChange={event => { setMessage(''); setCatalog(current => ({ ...current, enabled: event.target.checked })) }} />Publish custom services on my storefront</label>
          <p className="mt-2 text-xs text-lightColor">There is no plan cap on service varieties. Manage them in pages and add more whenever you need. New offers start disabled. Requests share your plan’s monthly allowance with 3D-print jobs.</p>
        </div>
        {catalog.offers.map(offer => {
          const basis = pricingBasisForOffer(offer)
          const volume = basis.isVolume
          const rateField = basis.id === 'volume' ? ['pricePerCm3', 'S$ per cm³ of bounding volume'] : basis.id === 'length' ? ['pricePerCm', 'S$ per cm of length'] : ['pricePerCm2', 'S$ per cm²']
          return <article key={offer.id} className={`${cardClass} space-y-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{offer.name || 'New service'}</h2><button type="button" className="text-xs text-red-700 underline" onClick={() => { if (JSON.parse(savedSignature || '{"offers":[]}').offers.some(saved => saved.id === offer.id)) setRemovedOfferIds(current => [...new Set([...current, offer.id])]); setCatalog(current => ({ ...current, offers: current.offers.filter(item => item.id !== offer.id) })) }}>Remove offer</button></div>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Service name"><input className={fieldClass} value={offer.name} maxLength={80} onChange={event => update(offer.id, { name: event.target.value })} required /></Field><Field label="Lead time (days)"><input type="number" className={fieldClass} min="1" max="90" value={offer.leadTimeDays} onChange={event => update(offer.id, { leadTimeDays: Number(event.target.value) })} required /></Field></div>
            <Field label="Description"><textarea className={fieldClass} rows={2} maxLength={1000} value={offer.description} onChange={event => update(offer.id, { description: event.target.value })} /></Field>
            {offer.kind === 'custom' && <Field label="How will you price this service?"><select className={fieldClass} value={basis.id} onChange={event => { const pricingBasis = event.target.value; update(offer.id, { pricingBasis, materials: offer.materials.map(material => ({ ...material, thicknessMm: pricingBasis === 'area' ? material.thicknessMm : 0, pricePerCm2: 0, pricePerCm3: 0, pricePerCm: 0 })) }) }}><option value="manual">Review and quote each job</option><option value="area">By area (width × height)</option><option value="volume">By bounding volume (width × height × depth)</option><option value="length">By length</option><option value="item">By item</option></select></Field>}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={offer.enabled} onChange={event => update(offer.id, { enabled: event.target.checked })} />Enable this offer</label>
            <div className="rounded-lg bg-baseColor p-3 text-xs leading-relaxed text-lightColor">Starter rates are examples. Enter your own SGD selling rates. {volume ? 'Volume pricing uses the entire bounding box and requires your geometry review.' : basis.isManual ? 'Customers will see “Provider quote” and can send their brief without an invented price.' : 'Estimates require your confirmation of artwork, complexity and finishing.'}</div>
            <div className="space-y-4">{offer.materials.map(material => <div key={material.id} className="space-y-4 rounded-xl border border-borderColor bg-baseColor p-4">
              <div className="flex justify-between gap-2"><h3 className="text-sm font-semibold text-textColor">Material & pricing</h3>{offer.materials.length > 1 && <button type="button" className="text-xs underline" onClick={() => update(offer.id, { materials: offer.materials.filter(item => item.id !== material.id) })}>Remove material</button>}</div>
              <div className="grid gap-4 sm:grid-cols-2"><Field label="Material / variant"><input required maxLength={60} className={fieldClass} value={material.name} onChange={event => materialUpdate(offer, material.id, 'name', event.target.value)} /></Field>{basis.id === 'area' && <Field label="Thickness (mm)" hint={offer.kind === 'custom' ? 'Use 0 if thickness does not apply.' : undefined}><input required type="number" min={offer.kind === 'custom' ? 0 : .01} max="1000" step="0.01" className={fieldClass} value={material.thicknessMm} onChange={event => materialUpdate(offer, material.id, 'thicknessMm', Number(event.target.value))} /></Field>}</div>
              {!basis.isManual && <div className="grid gap-4 sm:grid-cols-2">{[...(basis.id === 'item' ? [] : [rateField]), ['perItemFee', 'S$ per item'], ['setupFee', 'S$ setup per order'], ['minimumCharge', 'S$ minimum order']].map(([key, label]) => <Field key={key} label={label}><input required type="number" min="0" max="100000" step={key.startsWith('pricePer') ? '0.000001' : '0.01'} className={fieldClass} value={material[key] ?? 0} onChange={event => materialUpdate(offer, material.id, key, Number(event.target.value))} /></Field>)}</div>}
              <details><summary className="cursor-pointer text-sm font-medium">Maximum size</summary><div className="mt-3 grid gap-3 sm:grid-cols-3">{[['maxWidthMm','Width (mm)'],['maxHeightMm','Height (mm)'],['maxDepthMm','Depth (mm)']].filter(([key]) => volume || key !== 'maxDepthMm').map(([key,label]) => <Field key={key} label={label}><input required type="number" min="1" max="5000" className={fieldClass} value={material[key]} onChange={event => materialUpdate(offer, material.id, key, Number(event.target.value))} /></Field>)}</div></details>
            </div>)}</div>
            <button type="button" className={minorButtonClass} onClick={() => { const id = createFabricationOffer(offer.kind).materials[0].id; update(offer.id, { materials: [...offer.materials, { ...offer.materials[0], id, name: '' }] }) }} disabled={offer.materials.length >= 40}>Add material / variant</button>
            <ServiceOptionsEditor value={offer.optionGroups || []} onChange={optionGroups => update(offer.id, { optionGroups })} />
            <div className="space-y-3 border-t border-borderColor pt-5"><h3 className="text-sm font-semibold text-textColor">Personalisation image</h3><p className="text-xs text-lightColor">Optional: add a photo and choose where a customer’s name can go. Use a straight-on photo for a clearer preview. Template images are visible to storefront visitors.</p>{!uploadsAvailable && <p role="status" className="text-sm text-lightColor">Image uploads are not available yet. You can still save your services and prices.</p>}<Field label={offer.template ? 'Replace template image' : 'Upload template image'} hint="PNG, JPEG or WebP · up to 3 MB"><AssetInput accept="image/png,image/jpeg,image/webp" disabled={!uploadsAvailable} label="Choose image" onPick={file => addImage(offer, file)} /></Field>
              {offer.template?.imageUrl && <><PersonalizationEditor readOnly={busy || !access?.canManage} imageUrl={offer.template.imageUrl} imageWidth={offer.template.width} imageHeight={offer.template.height} value={{ ...offer.template, text: 'Your name' }} onChange={value => update(offer.id, { template: { ...offer.template, region: value.region, fontFamily: value.fontFamily, textColor: value.textColor } })} /><button type="button" className="text-xs underline" onClick={() => update(offer.id, { template: undefined })}>Remove template</button></>}
            </div>
          </article>
        })}
        <div className={`${cardClass} flex flex-wrap items-end gap-3`}><Field label="Add a service"><select value={newKind} onChange={event => setNewKind(event.target.value)} className={fieldClass}>{FABRICATION_KINDS.map(kind => <option key={kind.id} value={kind.id}>{kind.label}</option>)}</select></Field><button type="button" className={minorButtonClass} disabled={catalog.offers.length >= 24} onClick={() => { setMessage(''); setCatalog(current => ({ ...current, offers: [...current.offers, createFabricationOffer(newKind)] })) }}>Add offer</button></div>
        <button type="submit" className={buttonClass}>{busy ? 'Saving…' : 'Save services'}</button>
        <div className="flex flex-wrap gap-3"><button type="button" className={minorButtonClass} disabled={dirty} onClick={() => { setCursor(''); setReload(current => current + 1) }}>First services</button>{nextCursor && <button type="button" className={minorButtonClass} disabled={dirty} onClick={() => setCursor(nextCursor)}>Next services</button>}<button type="button" className={minorButtonClass} disabled={dirty} onClick={() => { const next = { enabled: catalog.enabled, offers: [createFabricationOffer(newKind)] }; setCatalog(next); setNextCursor(null); setMessage('Add more services here. Your saved offers remain in your catalogue.') }}>Add more services</button></div>
        {dirty && <p className="text-xs text-lightColor">Save your changes before opening another page of services.</p>}
      </fieldset>
    </form>
  </div>
}
