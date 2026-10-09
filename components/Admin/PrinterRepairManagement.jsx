'use client'
import { useCallback, useEffect, useState } from 'react'
import styles from '@/components/Services/PrinterRepairFlow.module.css'
async function read(url, signal) {
  const response = await fetch(url, { signal, cache: 'no-store' }), body = await response.json()
  if (!response.ok) {
    const reference = ['rate_limit_unavailable', 'service_unavailable', 'storage_unavailable'].includes(body.code) ? ` Reference: ${body.code}.` : ''
    throw new Error(`${body.error || 'Assessment requests could not be loaded.'}${reference}`)
  }
  return body
}
const date = value => new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Singapore' }).format(new Date(value))
const emailLabel = email => ({
  pending: 'Owner email pending.', sending: 'Owner email send in progress. Do not resend.',
  accepted: 'Accepted by the mail provider. Inbox delivery is not confirmed.',
  failed: 'Owner email was rejected before acceptance.', not_configured: 'Owner mail configuration is unavailable.',
  uncertain: 'Owner email outcome is uncertain. Check provider records before any further action.',
}[email?.status] || 'No owner email delivery record.')
export default function PrinterRepairManagement() {
  const [status, setStatus] = useState('assessment_requested')
  const [rows, setRows] = useState([]), [cursor, setCursor] = useState(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [detail, setDetail] = useState(null)
  const [revision, setRevision] = useState(0)
  const load = useCallback(async (next, signal) => {
    setBusy(true); setError('')
    try {
      const body = await read(`/api/admin/printer-repair?status=${status}${next ? `&cursor=${encodeURIComponent(next)}` : ''}`, signal)
      if (signal?.aborted) return
      setRows(previous => next ? [...previous, ...body.requests] : body.requests); setCursor(body.nextCursor)
    } catch (failure) { if (!signal?.aborted) setError(failure.message) }
    finally { if (!signal?.aborted) setBusy(false) }
  }, [status])
  useEffect(() => { const controller = new AbortController(); setDetail(null); setRows([]); setCursor(null); load(null, controller.signal); return () => controller.abort() }, [load, revision])
  async function open(requestId) {
    setBusy(true); setError(''); setDetail(null)
    try { const body = await read(`/api/admin/printer-repair/${encodeURIComponent(requestId)}`); setDetail(body.triage) }
    catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  async function retryEmail(requestId) {
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/admin/printer-repair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'retry_owner_email', requestId }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'The email retry could not be checked. Refresh the request before trying again.')
      setRows(previous => previous.map(row => row.requestId === requestId ? { ...row, ownerEmail: body.ownerEmail } : row))
      setDetail(previous => previous?.request.requestId === requestId ? { ...previous, ownerEmail: body.ownerEmail } : previous)
    } catch (failure) { setError(failure.message); setRows(previous => previous.map(row => row.requestId === requestId ? { ...row, ownerEmail: { ...row.ownerEmail, canRetry: false } } : row)) }
    finally { setBusy(false) }
  }
  return <section className="space-y-5 p-4 text-textColor sm:p-6" aria-label="Printer assessment requests">
    <header><h2 className="text-xl font-semibold">Printer assessment requests</h2><p className="mt-2 text-sm text-lightColor">Review the printer, symptoms and contact details. Agree support, handover and any cost with the customer before arranging work. Nothing here books a slot or creates a charge. Owner email retries go only to fixittoday.contact@gmail.com.</p></header>
    <div className="flex flex-wrap items-end gap-3"><label className="text-sm">Status<select className="ml-2 rounded border border-borderColor p-2" value={status} onChange={event => setStatus(event.target.value)}><option value="assessment_requested">Assessment requested</option><option value="withdrawn">Withdrawn</option><option value="all">All requests</option></select></label><button className={styles.secondary} disabled={busy} onClick={() => setRevision(value => value + 1)}>Refresh requests</button></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}{busy && <p role="status">Loading assessment requests.</p>}
    {!busy && !error && !rows.length && <p>No requests in this view yet.</p>}
    <ul className="space-y-3">{rows.map(row => <li key={row.requestId} className="rounded border border-borderColor p-4"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-medium">{row.brief.brand} {row.brief.model}</h3><p className="mt-1 text-sm">{emailLabel(row.ownerEmail)}</p><p className="mt-1 text-sm">{row.brief.contactName} · {date(row.createdAt)}</p><p className="mt-1 text-sm text-lightColor">{row.status === 'withdrawn' ? 'Withdrawn' : 'Assessment requested'} · {row.photoCount} photo{row.photoCount === 1 ? '' : 's'}</p></div><button className={styles.secondary} disabled={busy} onClick={() => open(row.requestId)}>View request</button>{row.ownerEmail?.canRetry && <button className={styles.secondary} disabled={busy} onClick={() => retryEmail(row.requestId)}>Retry owner email</button>}</div></li>)}</ul>
    {cursor && <button className={styles.secondary} disabled={busy} onClick={() => load(cursor)}>Load older requests</button>}
    {detail && <article className="space-y-4 rounded border border-borderColor p-5" aria-label="Selected assessment request"><h3 className="text-lg font-semibold">{detail.request.brief.brand} {detail.request.brief.model}</h3><p>{emailLabel(detail.ownerEmail)}</p><p className="break-all text-sm">Reference: {detail.request.requestId}</p><p>{detail.request.status === 'withdrawn' ? 'Withdrawn: the quote handoff is closed.' : 'Needs assessment: no repair, cost or appointment has been agreed.'}</p><dl className={styles.summary}>{[['Customer', detail.request.brief.contactName], ['Email', detail.request.brief.email], ['Phone', detail.request.brief.phone], ['Organisation', detail.request.brief.organisation], ['Symptoms', detail.request.brief.details], ['Error message', detail.request.brief.errorCode], ['Checks already tried', detail.request.brief.troubleshooting], ['Preferred date', detail.request.brief.preferredDate || 'Discuss with customer'], ['Handover', 'Discuss with customer']].map(([label, value]) => value && <div key={label}><dt>{label}</dt><dd className="whitespace-pre-wrap break-words">{value}</dd></div>)}</dl>{detail.request.preferredDateNeedsDiscussion && <p className={styles.note}>The preferred date has passed. Discuss a new date; no slot was reserved.</p>}<div className="grid gap-3 sm:grid-cols-3">{detail.photos.map(photo => <a key={photo.assetId} href={photo.imageUrl} target="_blank" rel="noopener noreferrer" className="break-words text-sm underline">Open private photo: {photo.originalName || 'Attachment'} (opens a new tab)</a>)}</div><button className={styles.secondary} onClick={() => setDetail(null)}>Close request</button></article>}
  </section>
}
