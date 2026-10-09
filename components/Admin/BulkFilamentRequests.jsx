'use client'
import { bulkEmailCopy } from '@/lib/bulkEmailCopy'
import { filamentOptionLabel } from '@/lib/filamentLabels'
import { useCallback, useEffect, useState } from 'react'
function RequestCard({ row, onSaved }) {
  const [status,setStatus] = useState(row.status), [note,setNote] = useState(row.ownerNote || '')
  const [busy,setBusy] = useState(false), [error,setError] = useState('')
  const emailStatus = row.ownerEmailStatus || (typeof row.notifications?.email === 'object' ? row.notifications.email.status : row.notifications?.email)
  const canRetry = ['pending','failed','not_configured'].includes(emailStatus) && typeof row.notifications?.email === 'object' && row.notifications.email.attempts < 3
  async function retryEmail() {
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/admin/bulk-filament', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: row._id, action: 'retry_owner_email' }) })
      const data = await response.json()
      if (!response.ok) throw Error(data.error || 'Could not check email status.')
      onSaved(data.request)
    } catch(e) { setError(e.message) } finally { setBusy(false) }
  }
  async function save() {
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/admin/bulk-filament', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: row._id, revision: row.revision, status, ownerNote: note }) })
      const data = await response.json()
      if (!response.ok) throw Error(data.error || 'Could not save.')
      onSaved(data.request)
    } catch(e) { setError(e.message) } finally { setBusy(false) }
  }
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-950">
    <div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold text-slate-950!">{row.customer.name}</h3><p className="text-sm">{row.customer.phone} · {row.customer.email}</p>
      {row.customer.organisation && <p>{row.customer.organisation}</p>}<p className="mt-2 text-sm">{row.fulfilment === 'delivery' ? 'Delivery enquiry: ' + row.address : 'Collection — arrangements to confirm'}</p></div>
      <div className="text-xs text-slate-500"><p>{new Date(row.createdAt).toLocaleString('en-SG')}</p><p className="break-all">{row._id}</p></div></div>
    <p className="mt-4 text-sm font-semibold">Preparation / availability check</p>
    <ul className="mt-2 space-y-3">{row.lines.map((line,i) => <li key={i} className="rounded-xl bg-slate-50 p-3 text-sm">
      <strong>{line.productName}</strong><p>{line.options.map(o => o.type + ': ' + filamentOptionLabel(o.type,o.name)).join(' · ')}</p>
      <p className="mt-1 font-medium">Total requested: {line.quantity ?? line.recordedQuantity + line.extraQuantity} rolls</p>
      <p className="mt-1">{line.recordedQuantity} from recorded stock requested + <strong>{line.extraQuantity} extra rolls to confirm</strong></p>
      <p>Public list price at submission: {line.publicUnitPrice ? line.publicUnitPrice.currency + ' ' + line.publicUnitPrice.amount.toFixed(2) + ' / roll' : 'Quotation required'}</p>
      {line.discountAmount?.amount > 0 && <p>Discount at submission: {line.discountAmount.currency} {line.discountAmount.amount.toFixed(2)}</p>}
      {line.estimatedLineTotal && <p>Estimated line total at submission: {line.estimatedLineTotal.currency} {line.estimatedLineTotal.amount.toFixed(2)}</p>}
      {line.remarks && <p className="mt-1 whitespace-pre-wrap">Remarks: {line.remarks}</p>}
    </li>)}</ul>
    {row.estimatedTotals?.totals.map(total => <p key={total.currency} className="mt-3 font-semibold">{row.estimatedTotals.unpricedLines ? 'Priced selections estimate' : 'Estimated filament total'} at submission: {total.currency} {total.total.toFixed(2)}</p>)}
    {row.notes && <p className="mt-3 whitespace-pre-wrap text-sm">Customer notes: {row.notes}</p>}
    <p className="mt-3 text-xs text-amber-900">Request only. No stock reserved, payment taken or delivery promised. Telegram alerts are not configured for this form.</p>
    <div className="mt-3 rounded-xl border border-slate-200 p-3 text-sm" aria-label="Owner email status">
      <p>{bulkEmailCopy(emailStatus)}</p>
      {row.notifications?.email?.recipient && <p className="mt-1 break-all">Recipient: {row.notifications.email.recipient}</p>}
      {row.notifications?.email?.attempts > 0 && <p>Attempts: {row.notifications.email.attempts} / 3</p>}
      {emailStatus === 'uncertain' && <p>Check the owner inbox and provider records using this request reference before any manual follow-up. Automatic resend is disabled to prevent duplicate alerts.</p>}
      {canRetry && <button className="mt-2 rounded-lg border px-3 py-2 disabled:opacity-50" disabled={busy} onClick={retryEmail}>Retry owner email</button>}
    </div>
    <div className="mt-5 grid gap-3 sm:grid-cols-[160px_1fr_auto]">
      <label className="text-sm">Status<select className="mt-1 w-full rounded-lg border p-2" value={status} onChange={e => setStatus(e.target.value)}>{['new','reviewing','contacted','closed'].map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="text-sm">Internal owner note<textarea className="mt-1 w-full rounded-lg border p-2" maxLength={2000} value={note} onChange={e => setNote(e.target.value)}/></label>
      <button className="self-end rounded-lg bg-slate-900 px-4 py-3 text-sm text-white disabled:opacity-50" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save review'}</button>
    </div><p className="mt-2 text-xs text-slate-500">Status and notes are internal. Saving does not send a message or confirm an order.</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </article>
}
export default function BulkFilamentRequests() {
  const [rows,setRows] = useState([]), [error,setError] = useState(''), [loading,setLoading] = useState(true), [next,setNext] = useState(null)
  const load = useCallback(async (before = null) => {
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/admin/bulk-filament' + (before ? '?before=' + encodeURIComponent(before) : ''), { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw Error(data.error || 'Unable to load requests.')
      setRows(old => before ? [...old, ...data.requests] : data.requests); setNext(data.next)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  return <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2>Bulk filament requests</h2><p className="mt-1 text-sm text-slate-500">Check physical availability, then contact the customer to agree the quotation and fulfilment.</p></div><button className="rounded-lg border px-4 py-2 text-sm" onClick={() => load()} disabled={loading}>Refresh requests</button></div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {loading && <p role="status">Loading requests…</p>}
    {!loading && !error && !rows.length && <p className="rounded-xl border p-6">No bulk requests yet.</p>}
    {rows.map(row => <RequestCard key={row._id + ':' + row.revision} row={row} onSaved={updated => setRows(old => old.map(r => r._id === updated._id ? updated : r))}/>)}
    {next && <button className="rounded-lg border px-4 py-2" disabled={loading} onClick={() => load(next)}>Load older requests</button>}
  </section>
}
