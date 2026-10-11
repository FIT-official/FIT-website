'use client'
import { useEffect, useState } from 'react'

export default function BusinessReportsPanel() {
  const [period, setPeriod] = useState('daily'), [revision, setRevision] = useState(0)
  const [data, setData] = useState(null), [error, setError] = useState('')
  const [retrying, setRetrying] = useState(null), [actionMessage, setActionMessage] = useState('')
  async function retry(id) {
    setRetrying(id); setActionMessage('')
    try {
      const response = await fetch('/api/admin/business-reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'retry_known_failure', id }) })
      const result = await response.json()
      setActionMessage(response.ok ? `Delivery status: ${result.status}.` : result.error || 'This notification cannot be safely retried.')
    } catch { setActionMessage('Retry outcome unavailable. Refresh delivery status before trying again.') }
    finally { setRetrying(null); setRevision(v => v + 1) }
  }
  useEffect(() => {
    const controller = new AbortController()
    setData(null); setError('')
    fetch(`/api/admin/business-reports?period=${period}`, { signal: controller.signal, cache: 'no-store' })
      .then(async r => { if (!r.ok) throw Error('Business report unavailable. Try again.'); return r.json() })
      .then(d => { if (!controller.signal.aborted) setData(d) })
      .catch(e => { if (!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  }, [period, revision])
  const r = data?.report
  return <section aria-label="Business reports" className="rounded-xl border border-borderColor bg-white p-5 space-y-4">
    <div className="flex flex-wrap items-center gap-3 justify-between">
      <div><h2 className="text-lg font-semibold">Business reports</h2><p className="text-sm text-gray-600">Completed Singapore calendar periods | summaries at 8am</p></div>
      <div className="flex gap-2"><label className="text-sm">Period <select aria-label="Business report period" value={period} onChange={e => setPeriod(e.target.value)} className="border rounded px-2 py-1"><option value="daily">Previous day</option><option value="weekly">Previous week</option><option value="monthly">Previous month</option></select></label>
        <button type="button" onClick={() => setRevision(v => v + 1)} className="border rounded px-3 py-1 text-sm">Refresh</button></div>
    </div>
    {error && <p role="alert">{error}</p>}
    {!r && !error && <p role="status">Loading business report…</p>}
    {r && <>
      {!data.configuration.enabled && <p className="text-sm">Reporting and new owner alerts have not been activated.</p>}
      <p className="text-sm">{r.period.label}{r.coverage.partial ? ' | Partial business-event coverage' : ''}</p>
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        {[['Paid orders', r.kinds['order.paid'] || 0], ['Enquiries', r.kinds['enquiry.submitted'] || 0], ['New chat messages', r.kinds['chat.message.new'] || 0], ['Consented visitors', r.visitors.available ? r.visitors.uniqueVisitors : 'Unavailable']].map(([label,value]) => <div key={label}><dt className="text-gray-600">{label}</dt><dd className="text-xl font-semibold">{value}</dd></div>)}
      </dl>
      <ul className="text-sm">{Object.entries(r.currencies).map(([currency,c]) => <li key={currency}>{currency} {(c.grossPaidMinor / 100).toFixed(2)} gross paid | {c.orders} orders | {c.items} items</li>)}</ul>
      <p className="text-xs text-gray-600">{r.coverage.notes} Visitor statistics include consenting visitors only. {r.visitors.available && !r.visitors.complete ? 'Visitor result is partial.' : ''}</p>
      <div className="flex flex-wrap gap-4 text-sm"><a className="underline" href={`/api/admin/business-reports?period=${period}&download=events.csv`}>Download event CSV</a><a className="underline" href={`/api/admin/business-reports?period=${period}&download=summary.json`}>Download summary JSON</a></div>
      <div className="text-sm"><h3 className="font-medium">Owner notification delivery</h3><p>Email: {data.configuration.ownerEmail} | Telegram: {data.configuration.telegramConfigured ? 'configured; verified before each send' : 'not configured'}</p><p>{Object.entries(data.health.counts).map(([k,v]) => `${k}: ${v}`).join(' | ') || 'No new notification records.'}</p><p className="text-xs text-gray-600">Provider acceptance does not confirm reading. Uncertain deliveries need review before resending. Records above 2,000 events can be downloaded completely with the E-drive exporter.</p></div>
      {actionMessage && <p role="status" className="text-sm">{actionMessage}</p>}
      {!!data.health.review?.length && <ul className="space-y-2 text-sm">{data.health.review.map(n => <li key={n.id} className="flex flex-wrap gap-2 items-center"><span>{n.channel}: {n.status} ({n.reason}); attempts {n.attempts}</span>{n.canRetry && <button type="button" className="border rounded px-2 py-1" disabled={!!retrying} onClick={() => retry(n.id)}>Retry known failure</button>}</li>)}</ul>}
    </>}
  </section>
}
