'use client'
import { useState } from 'react'
import { communityFetch } from './communityClient'
import styles from './Community.module.css'
export default function CommunityReport({ entry }) {
  const [open, setOpen] = useState(false), [reason, setReason] = useState('privacy'), [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [sent, setSent] = useState(false)
  async function send(event) {
    event.preventDefault(); setBusy(true); setMessage('')
    try { await communityFetch(`/api/community/${entry.entryId}/report`, { method: 'POST', body: JSON.stringify({ revision: entry.revision, reason, details }) }); setSent(true); setOpen(false); setMessage('Report received for moderator review. Reporting does not automatically remove content.') }
    catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }
  return <div className={styles.report}>{!sent && <button className={styles.textButton} type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'Cancel report' : 'Report this content'}</button>}{message && <p role="status">{message}</p>}{open && <form onSubmit={send} aria-label="Report content"><label>Reason<select value={reason} onChange={event => setReason(event.target.value)}><option value="privacy">Personal or student information</option><option value="spam">Spam or advertising</option><option value="abuse">Harassment or abuse</option><option value="unsafe">Unsafe content</option><option value="other">Other concern</option></select></label><label>Details (optional)<textarea maxLength={1000} value={details} onChange={event => setDetails(event.target.value)} rows={3} /></label><p className={styles.help}>Only moderators can read your report. Avoid repeating private information here.</p><button disabled={busy} type="submit">{busy ? 'Sending…' : 'Send report'}</button></form>}</div>
}
