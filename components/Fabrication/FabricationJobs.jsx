'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { SignInButton, useUser } from '@clerk/nextjs'
import PersonalizationEditor from './PersonalizationEditor'
import { Field, fieldClass, cardClass, buttonClass, minorButtonClass, readResponse, defaultPersonalization, money, EstimateBreakdown } from './shared'

const statusLabels = { submitted: 'Awaiting review', quoted: 'Quote ready', in_progress: 'In production', completed: 'Completed', cancelled: 'Cancelled' }

function Job({ job, provider, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [personalization, setPersonalization] = useState(job.personalization || job.snapshot?.personalization || defaultPersonalization())
  const [status, setStatus] = useState(job.status)
  const [note, setNote] = useState(job.providerNote || '')
  const [price, setPrice] = useState(job.confirmedPrice ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const snapshot = job.snapshot || {}
  const imageUrl = job.image?.imageUrl
  const choices = job.status === 'submitted' ? ['submitted','quoted','cancelled'] : job.status === 'quoted' ? ['quoted','in_progress','cancelled'] : job.status === 'in_progress' ? ['in_progress','completed','cancelled'] : [job.status]
  const terminal = ['completed','cancelled'].includes(job.status)
  async function save() {
    setBusy(true); setError('')
    try {
      const body = { expectedUpdatedAt: job.updatedAt, status, providerNote: note,
        ...(price !== '' ? { confirmedPrice: Number(price) } : {}),
        ...(imageUrl && personalization.text?.trim() ? { personalization: { text: personalization.text, region: personalization.region, fontFamily: personalization.fontFamily, textColor: personalization.textColor } } : {}),
      }
      const data = await readResponse(await fetch(`/api/fabrication/requests/${encodeURIComponent(job.requestId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
      onSaved(data.request); setEditing(false)
    } catch (cause) { setError(cause.message) } finally { setBusy(false) }
  }
  return <article className={`${cardClass} space-y-5`}>
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-lightColor">{new Date(job.createdAt).toLocaleDateString('en-SG')} · {job.requestId}</p><h2 className="mt-2 text-lg font-semibold">{snapshot.offer?.name || 'Custom service'}</h2><p className="mt-1 text-sm text-lightColor">{snapshot.material?.name}{snapshot.material?.thicknessMm ? ` · ${snapshot.material.thicknessMm} mm` : ''} · Quantity {snapshot.quantity}</p></div><span className="rounded-full bg-baseColor px-3 py-1 text-xs font-medium text-textColor">{statusLabels[job.status] || job.status}</span></header>
    {(provider ? job.customerUserId : job.creatorUserId) && <button type="button" className={minorButtonClass} onClick={() => window.dispatchEvent(new CustomEvent('fit:openCreatorChat', { detail: { targetUserId: provider ? job.customerUserId : job.creatorUserId, displayName: provider ? 'Customer' : 'Service provider', imageUrl: null } }))}>{provider ? 'Message customer' : 'Message provider'}</button>}
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="min-w-0 space-y-4">
        {snapshot.dimensions?.widthMm && <p className="text-sm text-lightColor">Finished size: {[snapshot.dimensions.widthMm, snapshot.dimensions.heightMm, snapshot.dimensions.depthMm].filter(value => value > 0).join(' × ')} mm</p>}
        {snapshot.estimate?.options?.length > 0 && <ul className="space-y-1 text-sm text-lightColor">{snapshot.estimate.options.map(option => <li key={option.groupId}>{option.groupName}: {option.label}</li>)}</ul>}
        {imageUrl && <PersonalizationEditor imageUrl={imageUrl} imageWidth={job.image?.width} imageHeight={job.image?.height} value={personalization} onChange={setPersonalization} readOnly={!provider || !editing || busy} allowRegionEdit={provider && editing} allowAutoSuggest={provider && editing} />}
        {snapshot.customerNote && <div><p className="text-xs font-medium text-lightColor">Customer brief</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{snapshot.customerNote}</p></div>}
        {job.reference?.fileUrl && <a href={job.reference.fileUrl} className="inline-block break-all text-sm underline" target="_blank" rel="noreferrer">Download {job.reference.originalName || 'reference file'}</a>}
        {provider && job.customerEmail && <p className="text-xs text-lightColor">Customer: {job.customerName || ''} · {job.customerEmail}</p>}
      </div>
      <div className="min-w-0 space-y-4">
        {Number.isFinite(job.confirmedPrice) ? <div className="rounded-xl bg-baseColor p-4"><p className="text-xs font-medium text-textColor">Provider-confirmed quote</p><p className="mt-1 text-2xl font-semibold">{money(job.confirmedPrice)}</p><p className="mt-2 text-xs text-lightColor">Arrange payment and production approval directly with the provider. This status does not record payment.</p></div> : <EstimateBreakdown snapshot={snapshot} />}
        {job.providerNote && !editing && <div><p className="text-xs font-medium text-lightColor">Provider update</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{job.providerNote}</p></div>}
        {provider && !terminal && !editing && <button type="button" className={minorButtonClass} onClick={() => setEditing(true)}>Review design & quote</button>}
        {provider && editing && <fieldset disabled={busy} className="space-y-4">
          <p className="text-xs text-lightColor">You can manually adjust the text area on the image. Saved changes are visible to the customer.</p>
          <Field label="Status"><select className={fieldClass} value={status} onChange={event => setStatus(event.target.value)}>{choices.map(choice => <option key={choice} value={choice}>{statusLabels[choice]}</option>)}</select></Field>
          <Field label="Confirmed total (S$)" hint="Include the scope and any delivery or finishing charges in your note."><input type="number" min="0.01" max="100000" step="0.01" className={fieldClass} value={price} onChange={event => setPrice(event.target.value)} /></Field>
          <Field label="Note to customer"><textarea className={fieldClass} rows={3} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} /></Field>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} onClick={save}>{busy ? 'Saving…' : 'Save review'}</button><button type="button" className={minorButtonClass} onClick={() => { setEditing(false); setStatus(job.status); setPrice(job.confirmedPrice ?? ''); setNote(job.providerNote || ''); setPersonalization(job.personalization || snapshot.personalization || defaultPersonalization()); setError('') }}>Cancel changes</button></div>
        </fieldset>}
      </div>
    </div>
  </article>
}

export default function FabricationJobs({ role = 'customer' }) {
  const provider = role === 'provider'
  const { user, isLoaded } = useUser()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [nextCursor, setNextCursor] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)
  useEffect(() => {
    if (!isLoaded) return
    if (!user) { setLoading(false); setJobs([]); return }
    const controller = new AbortController()
    setLoading(true); setError('')
    fetch(`/api/fabrication/requests?role=${role}`, { signal: controller.signal }).then(readResponse)
      .then(data => { if (!controller.signal.aborted) { setJobs(data.requests || []); setNextCursor(data.nextCursor || null) } })
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [user, isLoaded, role, revision])
  async function loadMore() {
    setLoadingMore(true); setError('')
    try {
      const data = await readResponse(await fetch(`/api/fabrication/requests?role=${role}&cursor=${encodeURIComponent(nextCursor)}`))
      setJobs(current => [...current, ...(data.requests || []).filter(job => !current.some(existing => existing.requestId === job.requestId))]); setNextCursor(data.nextCursor || null)
    } catch (cause) { setError(cause.message) } finally { setLoadingMore(false) }
  }
  return <div className="space-y-6 text-textColor">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs uppercase tracking-widest text-lightColor">Custom services</p><h1 className="mt-2">{provider ? 'Service jobs' : 'Service requests'}</h1><p className="mt-3 text-sm text-lightColor">{provider ? 'Review artwork, adjust name placement and confirm each quote.' : 'Follow your artwork, personalisation and provider-confirmed quotes.'}</p></div><button type="button" className={minorButtonClass} disabled={loading} onClick={() => setRevision(current => current + 1)}>Refresh</button></header>
    {provider && <Link href="/dashboard/services" className="inline-block text-sm underline">Manage your service catalogue →</Link>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {loading ? <p className="text-sm">Loading service requests…</p> : !user ? <SignInButton mode="modal"><button className={buttonClass}>Sign in to view requests</button></SignInButton> : jobs.length ? jobs.map(job => <Job key={`${job.requestId}:${job.updatedAt}`} job={job} provider={provider} onSaved={saved => setJobs(current => current.map(item => item.requestId === saved.requestId ? saved : item))} />) : !error && <div className={cardClass}><h2 className="text-lg">No service requests yet</h2><p className="mt-2 text-sm text-lightColor">{provider ? 'Publish an offer from Custom services to let customers request a job.' : 'Choose a custom service from a provider’s storefront to get started.'}</p></div>}
    {!loading && nextCursor && <button type="button" className={minorButtonClass} disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Loading…' : 'Older requests'}</button>}
  </div>
}
