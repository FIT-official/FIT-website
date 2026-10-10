'use client'
import Link from 'next/link'
import { SignInButton, useUser } from '@clerk/nextjs'
import { useState } from 'react'
import CommunityEditor from './CommunityEditor'
import { communityFetch, statusLabels, topicLabels, useCommunityPage } from './communityClient'
import styles from './Community.module.css'

function OwnEntry({ entry, onEdit, onChanged }) {
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function withdraw() {
    setBusy(true); setError('')
    try { await communityFetch(`/api/community/${entry.entryId}`, { method: 'PATCH', body: JSON.stringify({ action: 'withdraw', revision: entry.revision }) }); onChanged() }
    catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  return <article className={styles.card}><p className={styles.meta}>{entry.kind === 'comment' ? 'Comment' : entry.kind === 'project' ? 'Project' : 'Question'} · {statusLabels[entry.status]}</p><h2>{entry.title || 'Your comment'}</h2><p className={styles.body}>{entry.body}</p>{entry.moderationNote && <p className={styles.notice}>Moderator note: {entry.moderationNote}</p>}{entry.parentId && (entry.discussionAvailable === false ? <p className={styles.notice}>The discussion is not currently public, so this comment is also hidden from readers.</p> : <Link href={`/community/${entry.parentId}`}>Open discussion</Link>)}{entry.status === 'approved' && !entry.parentId && <Link href={`/community/${entry.entryId}`}>View published post</Link>}{entry.status !== 'withdrawn' && <div className={styles.actions}><button type="button" className={styles.secondary} onClick={() => onEdit(entry)} disabled={busy}>Edit</button><button type="button" className={styles.secondary} onClick={() => setConfirm(true)} disabled={busy}>Withdraw</button></div>}{confirm && <div className={styles.notice}><p>Withdraw this submission? It will be hidden from readers and cannot be restored through this form.</p><div className={styles.actions}><button type="button" onClick={withdraw} disabled={busy}>{busy ? 'Withdrawing…' : 'Confirm withdrawal'}</button><button type="button" className={styles.secondary} onClick={() => setConfirm(false)} disabled={busy}>Keep submission</button></div></div>}{error && <p role="alert">{error}</p>}</article>
}
export default function CommunityBoard() {
  const { isLoaded, isSignedIn, user } = useUser()
  const [view, setView] = useState('all'), [topic, setTopic] = useState('all'), [cursor, setCursor] = useState('')
  const [editing, setEditing] = useState(null), [notice, setNotice] = useState('')
  const own = view === 'mine', signedIn = Boolean(isLoaded && isSignedIn && user?.id)
  const path = own ? '/api/community/mine' : '/api/community'
  const query = new URLSearchParams({ ...(own ? {} : { kind: view, topic }), ...(cursor ? { cursor } : {}) })
  const page = useCommunityPage(own && !signedIn ? null : `${path}?${query}`, own ? user?.id || 'signed-out' : 'public')
  const changeView = value => { setView(value); setCursor(''); setEditing(null); setNotice('') }
  const saved = () => { setEditing(null); setNotice('Saved for review. Nothing has been published. You can check its status in My submissions.'); setView('mine'); setCursor(''); page.reload() }
  const editorVisible = signedIn && editing && editing.owner === user.id
  return <div className={`${styles.shell} ph-mask ph-no-capture`}>
    <nav aria-label="Breadcrumb" className={styles.breadcrumb}><Link href="/">Home</Link><span>/</span><Link href="/maker-tools">Maker Tools</Link><span>/</span><span aria-current="page">Community</span></nav>
    <header className={styles.hero}><p className={styles.eyebrow}>MAKE · ASK · SHARE</p><h1>Maker community</h1><p>Ask a practical question, share a project and learn from other makers.</p><div className={styles.actions}>{signedIn ? <button onClick={() => { setEditing({ owner: user.id, entry: null }); setNotice('') }}>Ask or share</button> : <SignInButton mode="modal" forceRedirectUrl="/community" signUpForceRedirectUrl="/community"><button disabled={!isLoaded}>Sign in to post</button></SignInButton>}<Link href="/maker-tools">Explore Maker Tools</Link></div></header>
    <details className={styles.guidelines}><summary>How this moderated community works</summary><ul><li>FIT reviews every post, comment and edit before publication. Review is manual and may take time.</li><li>Keep discussion useful and respectful. No spam, harassment, unsafe instructions or advertising.</li><li>Use a public maker name. Do not post student names, school/class identifiers, contact details, private files or other people’s personal information.</li><li>Share only work and text you have permission to share. Advice is community discussion, not a FIT quote or repair diagnosis.</li><li>Signed-in members can report published content. Moderators can reject or hide it; no external notifications are enabled.</li></ul></details>
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {editorVisible && <CommunityEditor key={editing.entry?.entryId || 'new'} initial={editing.entry} onSaved={saved} onCancel={() => setEditing(null)} />}
    <div className={styles.toolbar}><button type="button" className={styles.secondary} onClick={page.reload}>Refresh posts</button><div className={styles.tabs} role="group" aria-label="Community views">{[['all','All posts'],['question','Questions'],['project','Projects'],...(signedIn ? [['mine','My submissions']] : [])].map(([value,label]) => <button type="button" key={value} className={styles.secondary} aria-pressed={view === value} onClick={() => changeView(value)}>{label}</button>)}</div>{!own && <label>Topic<select value={topic} onChange={event => { setTopic(event.target.value); setCursor('') }}><option value="all">All topics</option>{Object.entries(topicLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>}</div>
    {own && !signedIn ? <p>Sign in to view your submissions.</p> : <section aria-label={own ? 'My submissions' : 'Community posts'} aria-busy={Boolean(page.loading)}>{page.loading && <p role="status">Loading community…</p>}{page.error && <p role="alert">{page.error} <button type="button" onClick={page.reload}>Try again</button></p>}{page.data?.items.length === 0 && <div className={styles.empty}><h2>{own ? 'No submissions yet' : 'No published posts yet'}</h2><p>{own ? 'Questions, projects and comments you send will appear here with their review status.' : 'Start a thoughtful question or share something you have made. Approved posts will appear here.'}</p></div>}{page.data?.items.map(entry => own ? <OwnEntry key={`${entry.entryId}:${entry.revision}`} entry={entry} onEdit={item => setEditing({ owner: user.id, entry: item })} onChanged={page.reload} /> : <article className={styles.card} key={entry.entryId}><p className={styles.meta}>{entry.kind === 'project' ? 'Project' : 'Question'} · {topicLabels[entry.topic]}</p><h2><Link href={`/community/${entry.entryId}`}>{entry.title}</Link></h2><p className={styles.body}>{entry.body}{entry.body.length === 240 ? '…' : ''}</p><p className={styles.meta}>By {entry.displayName}</p></article>)}</section>}
    <div className={styles.actions}>{cursor && <button type="button" className={styles.secondary} onClick={() => setCursor('')}>Newest</button>}{page.data?.nextCursor && <button type="button" className={styles.secondary} onClick={() => setCursor(page.data.nextCursor)}>Older submissions</button>}</div>
  </div>
}
