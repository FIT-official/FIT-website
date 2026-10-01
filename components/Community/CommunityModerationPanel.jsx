'use client'
import { useCallback, useEffect, useState } from 'react'
import { ABUSE_REASONS } from '@/lib/community/policy'
import styles from './Community.module.css'
async function read(url, options) {
  const response = await fetch(url, { cache: 'no-store', ...options }), body = await response.json()
  if (!response.ok) throw new Error(body.error || 'Moderation could not be completed.')
  return body
}
export default function CommunityModerationPanel() {
  const [view, setView] = useState('flagged'), [data, setData] = useState(null), [chosen, setChosen] = useState(null)
  const [action, setAction] = useState(''), [reason, setReason] = useState(''), [abuseReason, setAbuseReason] = useState(''), [until, setUntil] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const load = useCallback(async (cursor, signal) => {
    setBusy(true); setError('')
    try { const next = await read('/api/admin/community?view=' + view + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), { signal }); if (!signal?.aborted) setData(old => cursor ? { ...next, entries: [...(old?.entries || []), ...next.entries] } : next) }
    catch (failure) { if (!signal?.aborted) setError(failure.message) } finally { if (!signal?.aborted) setBusy(false) }
  }, [view])
  useEffect(() => { const controller = new AbortController(); setData(null); setChosen(null); load(null, controller.signal); return () => controller.abort() }, [load])
  async function submit(event) {
    event.preventDefault()
    if (busy || !chosen || !action || reason.trim().length < 5) return
    const posting = action.endsWith('_posting')
    let payload
    if (posting) {
      if (action === 'restrict_posting' && (!until || !Number.isFinite(Date.parse(until)))) return setError('Choose the temporary restriction end date.')
      payload = { operationId: crypto.randomUUID(), expectedRevision: chosen.revision, expectedAccountRevision: chosen.postingState.revision, action, reason, ...(action === 'restrict_posting' ? { until: new Date(until).toISOString() } : {}) }
    } else payload = { operationId: crypto.randomUUID(), expectedRevision: chosen.revision, action, reason, ...(action === 'confirm_abuse' ? { abuseReason } : {}) }
    setBusy(true); setError(''); setNotice('')
    try {
      await read('/api/admin/community/' + chosen.entryId + (posting ? '/posting' : ''), { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      setChosen(null); setAction(''); setReason(''); setNotice('Action saved with its reason and audit history.'); await load()
    } catch (failure) { setError(failure.message + ' Refresh the queue before trying again.') } finally { setBusy(false) }
  }
  return <section className={styles.thread} aria-label="FIT platform moderation">
    <header className={styles.header}><div><h2>Comments & hosted-shop reviews</h2><p>FIT platform admins only. Service providers cannot hide or restore reviews.</p></div></header>
    <p className={styles.policy}>Low ratings and criticism are flagged for attention. They do not count as abuse. No automatic posting restriction or suspension is configured. Any manual restriction needs substantiated abuse and a recorded admin decision; it affects community posting, not shopping or payment.</p>
    <div className={styles.row}><label>Queue view<select value={view} onChange={event => setView(event.target.value)}><option value="flagged">Flagged</option><option value="all">All posts</option><option value="hidden">Hidden posts</option></select></label><button className={styles.secondary} disabled={busy} onClick={() => { setChosen(null); load() }}>Refresh queue</button></div>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}{busy && <p role="status">Loading moderation queue.</p>}
    {!busy && data && !data.entries.length && <p>No posts in this view.</p>}
    <ul className={styles.entries}>{data?.entries.map(entry => <li key={entry.entryId}><article><header><strong>{entry.displayName}</strong><span>{entry.visibility === 'hidden' ? 'Hidden from public' : 'Public'}</span></header><p className={styles.small}>{entry.kind.replaceAll('_',' ')} · {entry.subject}{entry.rating ? ' · ' + entry.rating + ' / 5' : ''}</p><p className={styles.body}>{entry.body}</p><p className={styles.small}>Flags: {entry.flags.join(', ') || 'None'}</p>{entry.flags.includes('negative_feedback') && <p className={styles.policy}>Negative feedback is a concern to review, not an abuse finding.</p>}<p className={styles.small}>Substantiated abuse: {entry.abuseConfirmed ? 'Yes' : 'No'} · Confirmed incidents for this author: {entry.confirmedAbuseCount}</p>{entry.reports.map((report, index) => <p className={styles.small} key={index}>Report: {report.reason} {report.detail}</p>)}<button className={styles.secondary} disabled={busy} onClick={() => { setChosen(entry); setAction(''); setReason(''); setAbuseReason(''); setUntil('') }}>Review actions</button>{entry.audit.length > 0 && <details className={styles.audit}><summary>Audit history ({entry.audit.length})</summary><ol>{entry.audit.map(event => <li key={event.operationId}>{new Date(event.at).toLocaleString('en-SG')} · {event.action} · {event.reason}</li>)}</ol></details>}</article></li>)}</ul>
    {data?.nextCursor && <button className={styles.secondary} disabled={busy} onClick={() => load(data.nextCursor)}>Load older posts</button>}
    {chosen && <form className={styles.form} onSubmit={submit} aria-label="Moderation decision"><h3>Record a decision</h3><p className={styles.body}>{chosen.body}</p><label>Action<select required value={action} onChange={event => setAction(event.target.value)}><option value="">Choose an action</option><option value="hide">Hide from public (reversible)</option><option value="restore">Restore to public</option><option value="confirm_abuse">Confirm substantiated abuse</option><option value="clear_abuse">Clear abuse finding</option><option value="mark_reviewed">Mark flags and reports reviewed</option><option value="restrict_posting">Temporarily restrict posting</option><option value="suspend_posting">Suspend community posting</option><option value="restore_posting">Restore community posting</option></select></label>
      {chosen.postingState && <p className={styles.small}>Community posting: {chosen.postingState.postingSuspended ? 'Suspended' : chosen.postingState.restrictedUntil && new Date(chosen.postingState.restrictedUntil) > new Date() ? `Restricted until ${new Date(chosen.postingState.restrictedUntil).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })} (Singapore time)` : 'Available'}.</p>}
      {action === 'confirm_abuse' && <label>Substantiated abuse category<select required value={abuseReason} onChange={event => setAbuseReason(event.target.value)}><option value="">Choose a category</option>{ABUSE_REASONS.map(value => <option key={value} value={value}>{value}</option>)}</select></label>}
      {action === 'restrict_posting' && <label>Restriction ends<input type="datetime-local" required value={until} onChange={event => setUntil(event.target.value)} /></label>}
      <label>Reason<textarea required minLength={5} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} rows={3} /></label><p className={styles.small}>The original post and audit history are retained. This action sends no customer message.</p><div className={styles.row}><button className={styles.primary} disabled={busy}>Save admin decision</button><button type="button" className={styles.secondary} disabled={busy} onClick={() => setChosen(null)}>Cancel</button></div>
    </form>}
  </section>
}
