'use client'
import { useState } from 'react'
import { communityFetch, topicLabels, useSubmissionKey } from './communityClient'
import styles from './Community.module.css'

export default function CommunityEditor({ initial, parentId, onSaved, onCancel }) {
  const comment = Boolean(parentId || initial?.kind === 'comment')
  const [draft, setDraft] = useState({ kind: initial?.kind || 'question', title: initial?.title || '', topic: initial?.topic || 'general', displayName: initial?.displayName || '', body: initial?.body || '', guidelinesAccepted: false, website: '' })
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const keyFor = useSubmissionKey()
  const change = event => setDraft(value => ({ ...value, [event.target.name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }))
  async function submit(event) {
    event.preventDefault(); if (busy) return
    setBusy(true); setError('')
    const content = { displayName: draft.displayName, body: draft.body, ...(!comment ? { title: draft.title, topic: draft.topic } : {}) }
    const payload = initial ? { ...content, action: 'edit', revision: initial.revision } : { ...content, ...(!comment ? { kind: draft.kind } : {}), guidelinesAccepted: draft.guidelinesAccepted, website: draft.website }
    if (!initial) payload.clientRequestId = keyFor(payload)
    try {
      await communityFetch(initial ? `/api/community/${initial.entryId}` : parentId ? `/api/community/${parentId}/comments` : '/api/community', { method: initial ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
      onSaved()
    } catch (failure) { setError(`${failure.message} If a previous attempt lost its response, check My submissions before creating another.`) }
    finally { setBusy(false) }
  }
  return <form onSubmit={submit} className={styles.editor} aria-label={initial ? 'Edit submission' : comment ? 'Add a comment' : 'New community post'}>
    <h2>{initial ? 'Edit your submission' : comment ? 'Join the discussion' : 'Share with the community'}</h2>
    <p>Every post, comment and edit is reviewed before it appears publicly. {initial?.status === 'approved' ? 'Saving an edit removes the published version until it is approved again.' : 'Your submission will be visible to you and FIT moderators while waiting.'}</p>
    {!comment && <div className={styles.formRow}>{!initial && <label>Post type<select name="kind" value={draft.kind} onChange={change}><option value="question">Ask a question</option><option value="project">Share a project</option></select></label>}<label>Topic<select name="topic" value={draft.topic} onChange={change}>{Object.entries(topicLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>}
    <label>Public maker name<input name="displayName" value={draft.displayName} onChange={change} required minLength={2} maxLength={40} autoComplete="off" aria-describedby="community-name-help" /></label>
    <p id="community-name-help" className={styles.help}>Choose a name you are comfortable sharing publicly. Your account name and email are not added automatically.</p>
    {!comment && <label>Title<input name="title" value={draft.title} onChange={change} required minLength={5} maxLength={120} /></label>}
    <label>{comment ? 'Comment' : draft.kind === 'project' ? 'What you made and learned' : 'Your question and what you tried'}<textarea name="body" value={draft.body} onChange={change} required minLength={comment ? 2 : 20} maxLength={comment ? 2000 : 6000} rows={comment ? 5 : 8} /></label>
    <p className={styles.help}>Plain text only. Do not include student names, school/class identifiers, contact details, private files or other people’s personal information.</p>
    {!initial && <><label className={styles.honeypot} aria-hidden="true">Leave this blank<input name="website" value={draft.website} onChange={change} tabIndex={-1} autoComplete="off" /></label><label className={styles.checkbox}><input type="checkbox" name="guidelinesAccepted" checked={draft.guidelinesAccepted} onChange={change} required /> I will be respectful, share only content I have permission to share and follow the community guidelines.</label></>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.actions}><button type="submit" disabled={busy}>{busy ? 'Saving…' : initial ? 'Save for review' : 'Send for review'}</button><button type="button" className={styles.secondary} onClick={onCancel} disabled={busy}>Cancel</button></div>
  </form>
}
