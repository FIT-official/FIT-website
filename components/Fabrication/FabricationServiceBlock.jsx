'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function FabricationServiceBlock({ creator }) {
  const id = creator?.id || creator?.userId
  const [catalog, setCatalog] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    setCatalog(null)
    if (!id) return
    const controller = new AbortController()
    fetch(`/api/creators/${encodeURIComponent(id)}/fabrication-service`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (!controller.signal.aborted && data?.enabled) setCatalog(data) })
      .catch(() => {})
    return () => controller.abort()
  }, [id])
  if (!catalog?.offers?.length) return null
  async function loadMore() {
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/creators/${encodeURIComponent(id)}/fabrication-service?cursor=${encodeURIComponent(catalog.nextCursor)}`)
      if (!response.ok) throw new Error('Could not load more services. Please try again.')
      const page = await response.json()
      setCatalog(current => ({ ...current, nextCursor: page.nextCursor || null, offers: [...current.offers, ...(page.offers || []).filter(offer => !current.offers.some(existing => existing.id === offer.id))] }))
    } catch (cause) { setError(cause.message) } finally { setBusy(false) }
  }
  return <section className="space-y-4" aria-label="Custom services">
    <div><h2 className="text-xl font-semibold text-textColor">Made for your project</h2><p className="mt-1 text-sm text-lightColor">Choose a service, personalise your design and request a quote.</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      {catalog.offers.filter(offer => offer.enabled).map(offer => <article key={offer.id} className="rounded-xl border border-borderColor bg-background p-5">
        <h3 className="font-semibold text-textColor">{offer.name}</h3>
        <p className="mt-2 text-sm text-lightColor">{offer.description}</p>
        <p className="mt-3 text-xs text-lightColor">{offer.materials.map(material => `${material.name}${material.thicknessMm ? ` · ${material.thicknessMm} mm` : ''}`).join(' / ')}</p>
        <Link className="mt-4 inline-flex rounded-lg bg-textColor px-4 py-2 text-sm text-background" href={`/services/request?creator=${encodeURIComponent(id)}&offer=${encodeURIComponent(offer.id)}`}>Customise & get estimate</Link>
      </article>)}
    </div>
    {catalog.nextCursor && <button type="button" className="formBlackButton w-fit" disabled={busy} onClick={loadMore}>{busy ? 'Loading…' : 'More services'}</button>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>
}
