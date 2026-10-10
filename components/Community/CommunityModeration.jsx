'use client'
import Link from 'next/link'
import { useUser } from '@clerk/nextjs'
import { useState } from 'react'
import { communityFetch, statusLabels, useCommunityPage } from './communityClient'
import styles from './Community.module.css'

function ReviewCard({ item, reports, reload }) {
  const [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const entry = reports ? item.current : item
  async function act(action) {
    setBusy(true); setError('')
    try {
      const payload = action === 'resolve_report' ? { action, reportId: item.reportId, note } : { action, entryId: entry.entryId, revision: entry.revision, note }
      await communityFetch('/api/admin/community', { method: 'POST', body: JSON.stringify(payload) }); reload()
    } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  return <article className={styles.card}>
    <p className={styles.meta}>{reports ? `Report: ${item.reason} · ${item.status}` : `${entry.kind} · ${statusLabels[entry.status]}`}</p>
    {reports && <div className={styles.notice}><h3>Reported version {item.entryRevision}</h3><p>{item.snapshot.title || 'Comment'} · {item.snapshot.displayName}</p><p className={styles.body}>{item.snapshot.body}</p><p>Report details: {item.details || 'No additional details.'}</p>{item.resolutionNote && <p>Resolution: {item.resolutionNote}</p>}</div>}
    {entry ? <><h2>{reports ? 'Current content: ' : ''}{entry.title || 'Comment'}</h2><p className={styles.meta}>Public maker name: {entry.displayName} · Revision {entry.revision} · {statusLabels[entry.status]}</p>{entry.parentId && <p>Discussion: {entry.parent?.title || entry.parentId} {entry.parent && `(${statusLabels[entry.parent.status]})`}</p>}<p className={styles.body}>{entry.body}</p>{entry.moderationNote && <p>Previous note: {entry.moderationNote}</p>}{entry.status === 'approved' && <Link href={`/community/${entry.parentId || entry.entryId}`}>Open public discussion</Link>}<details><summary>Recent moderation history</summary><ol>{entry.audit.map((event, index) => <li key={index}>{event.action} · revision {event.revision}{event.note ? ` · ${event.note}` : ''}</li>)}</ol></details></> : <p>The current content is unavailable. The reported snapshot is retained above.</p>}
    {(entry?.status === 'pending' || entry?.status === 'approved' || (reports && item.status === 'open')) && <><label>Moderation or resolution note<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={500} rows={3} /></label><p className={styles.help}>Rejection and hiding notes are visible to the author. Report resolution notes stay with moderators. Never copy private information into a note.</p><div className={styles.actions}>{entry?.status === 'pending' && <><button onClick={() => act('approve')} disabled={busy || Boolean(entry.parentId && entry.parent && entry.parent.status !== 'approved')}>Approve publication</button><button className={styles.secondary} onClick={() => act('reject')} disabled={busy || note.trim().length < 3}>Request changes</button></>}{entry?.status === 'approved' && <button onClick={() => act('hide')} disabled={busy || note.trim().length < 3}>Hide content</button>}{reports && item.status === 'open' && <button className={styles.secondary} onClick={() => act('resolve_report')} disabled={busy || note.trim().length < 3}>Resolve report</button>}</div></>}
    {entry?.parentId && entry.parent?.status !== 'approved' && !reports && <p className={styles.notice}>This comment cannot be published until its discussion is approved.</p>}
    {busy && <p role="status">Saving moderation decision…</p>}{error && <p role="alert" className={styles.error}>{error} <button onClick={reload} disabled={busy}>Refresh queue</button></p>}
  </article>
}
export default function CommunityModeration() {
  const { user } = useUser()
  const [view, setView] = useState('pending'), [cursor, setCursor] = useState('')
  const page = useCommunityPage(`/api/admin/community?${new URLSearchParams({ view, ...(cursor ? { cursor } : {}) })}`, user?.id || 'signed-out')
  const reports = view.includes('reports')
  return <section className={`${styles.admin} ph-mask ph-no-capture`} aria-labelledby="community-review-title"><h1 id="community-review-title">Community review</h1><p>Nothing is published automatically. Check usefulness, safety, permission to share and personal/student information before approving. Edits return to this queue.</p><p>Hiding a discussion also hides its comments from public readers. Reports do not automatically remove content: review the snapshot and current version, then hide or request changes where appropriate before resolving the report.</p><div className={styles.toolbar}><label>Queue<select value={view} onChange={event => { setView(event.target.value); setCursor('') }}><option value="pending">Awaiting review</option><option value="reports">Open reports</option><option value="approved">Published</option><option value="rejected">Changes requested</option><option value="hidden">Hidden</option><option value="withdrawn">Withdrawn</option><option value="resolved-reports">Resolved reports</option></select></label><button className={styles.secondary} onClick={page.reload}>Refresh</button><Link href="/community">Open community</Link></div>{page.loading && <p role="status">Loading review queue…</p>}{page.error && <p role="alert" className={styles.error}>{page.error}</p>}{page.data?.items.length === 0 && <p className={styles.empty}>This queue is clear.</p>}{page.data?.items.map(item => <ReviewCard key={`${item.reportId || item.entryId}:${item.revision || item.current?.revision}:${item.status}`} item={item} reports={reports} reload={page.reload} />)}<div className={styles.actions}>{cursor && <button className={styles.secondary} onClick={() => setCursor('')}>Newest</button>}{page.data?.nextCursor && <button className={styles.secondary} onClick={() => setCursor(page.data.nextCursor)}>Older items</button>}</div></section>
}
