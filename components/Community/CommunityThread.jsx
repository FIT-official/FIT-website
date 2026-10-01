'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { SignInButton, useUser } from '@clerk/nextjs'
import { REPORT_REASONS, validateEntry } from '@/lib/community/policy'
import { clearCommunityPending, readCommunityPending, saveCommunityPending } from '@/lib/community/clientDraft'
import styles from './Community.module.css'
async function read(url, options) {
  const controller = new AbortController(), cancel = () => controller.abort()
  options?.signal?.addEventListener('abort', cancel, { once: true })
  if (options?.signal?.aborted) cancel()
  const timeout = setTimeout(cancel, 20000)
  let response
  try { response = await fetch(url, { cache: 'no-store', ...options, signal: controller.signal }) }
  finally { clearTimeout(timeout); options?.signal?.removeEventListener('abort', cancel) }
  let body
  try { body = await response.json() } catch { throw new Error('The response could not be read. Retry the same post.') }
  if (!response.ok) throw Object.assign(new Error(body.error || 'Please try again.'), { status: response.status })
  return body
}
export default function CommunityThread({ kind = 'blog_comment', subject, hideIfUnavailable = false }) {
  const { user, isLoaded, isSignedIn } = useUser()
  const [data, setData] = useState(null), [eligible, setEligible] = useState([])
  const [unavailable, setUnavailable] = useState(false)
  const [name, setName] = useState(''), [text, setText] = useState(''), [rating, setRating] = useState(''), [order, setOrder] = useState('')
  const [replyTo, setReplyTo] = useState(null), [reporting, setReporting] = useState(null), [reportReason, setReportReason] = useState(''), [reportDetail, setReportDetail] = useState('')
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState(''), [uncertain, setUncertain] = useState(false)
  const pending = useRef(null), sending = useRef(false), previousScope = useRef(null), currentScope = useRef(null), currentTopic = useRef(null), errorSummary = useRef(null)
  const account = isSignedIn ? user?.id : null
  const scope = JSON.stringify([kind, subject, account])
  currentScope.current = scope; currentTopic.current = JSON.stringify([kind, subject])
  const shop = kind === 'shop_review', owner = shop && account === subject
  const load = useCallback(async (cursor, signal) => {
    const topic = JSON.stringify([kind, subject])
    setLoading(true)
    try {
      const body = await read('/api/community?kind=' + kind + '&subject=' + encodeURIComponent(subject) + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), { signal })
      if (!signal?.aborted && currentTopic.current === topic) setData(previous => cursor ? { ...body, entries: [...(previous?.entries || []), ...body.entries], replies: [...(previous?.replies || []), ...body.replies] } : body)
    } catch (failure) { if (!signal?.aborted && currentTopic.current === topic) { if (hideIfUnavailable && failure.status === 404) setUnavailable(true); else setError(failure.message) } }
    finally { if (!signal?.aborted && currentTopic.current === topic) setLoading(false) }
  }, [kind, subject, hideIfUnavailable])
  useEffect(() => { const controller = new AbortController(); setData(null); setUnavailable(false); setError(''); load(null, controller.signal); return () => controller.abort() }, [load])
  useEffect(() => { if (error) errorSummary.current?.focus() }, [error])
  useEffect(() => {
    if (!isLoaded) return
    if (previousScope.current !== scope) {
      pending.current = null; sending.current = false; setBusy(false); setUncertain(false); setText(''); setName(''); setOrder(''); setRating(''); setReplyTo(null); setReporting(null); setReportReason(''); setReportDetail(''); setNotice(''); setError('')
      previousScope.current = scope
      const saved = account && readCommunityPending(sessionStorage, kind, subject, account)
      if (saved) {
        pending.current = saved; setUncertain(true); setName(saved.displayName); setText(saved.body); setRating(saved.rating ? String(saved.rating) : '')
        setOrder(saved.orderType ? saved.orderType + ':' + saved.orderId : ''); setReplyTo(saved.parentId || null)
        setNotice('A previous post needs confirmation. Retry the same details to avoid a duplicate.')
      }
    }
    setEligible([])
    if (!shop || !account || owner) return
    const controller = new AbortController()
    read('/api/community/eligibility?subject=' + encodeURIComponent(subject), { signal: controller.signal })
      .then(body => { if (!controller.signal.aborted && currentScope.current === scope) setEligible(body.eligible) }).catch(failure => { if (!controller.signal.aborted && currentScope.current === scope) setError(failure.message) })
    return () => controller.abort()
  }, [account, isLoaded, owner, shop, subject, kind, scope])
  async function post(event) {
    event.preventDefault()
    if (!isSignedIn || sending.current) return
    const actor = account
    const operationScope = scope
    let payload = pending.current
    if (!payload) {
      const selected = eligible.find(item => item.orderType + ':' + item.orderId === order)
      payload = { clientRequestId: crypto.randomUUID(), kind: replyTo ? 'shop_reply' : kind, subject, displayName: name, body: text,
        ...(shop && !replyTo ? { rating: Number(rating), orderType: selected?.orderType, orderId: selected?.orderId } : {}),
        ...(replyTo ? { parentId: replyTo } : {}) }
      const checked = validateEntry(payload)
      if (checked.error) return setError(checked.error)
      pending.current = payload
      saveCommunityPending(sessionStorage, kind, subject, actor, payload)
    }
    sending.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const result = await read('/api/community', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      if (currentScope.current !== operationScope) return
      pending.current = null; clearCommunityPending(sessionStorage, kind, subject, actor); setUncertain(false); setText(''); setRating(''); setOrder(''); setReplyTo(null)
      setNotice(result.hidden ? 'Your earlier post is saved but has been hidden by FIT. Contact FIT if you need a review.' : 'Posted publicly.')
      await load()
      if (shop && !owner) { const next = await read('/api/community/eligibility?subject=' + encodeURIComponent(subject)); if (currentScope.current === operationScope) setEligible(next.eligible) }
    } catch (failure) {
      if (currentScope.current !== operationScope) return
      if ([400, 401, 403, 409, 413].includes(failure.status)) { pending.current = null; clearCommunityPending(sessionStorage, kind, subject, actor); setUncertain(false); setError(failure.message) }
      else { setUncertain(true); setError(failure.message + ' Retry the same post. Its details are kept unchanged to prevent duplicates.') }
    } finally { if (currentScope.current === operationScope) { sending.current = false; setBusy(false) } }
  }
  async function report(event) {
    event.preventDefault()
    if (sending.current || !isSignedIn || !reportReason) return
    const operationScope = scope
    sending.current = true; setBusy(true); setError('')
    try {
      await read('/api/community/' + reporting + '/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: reportReason, detail: reportDetail }) })
      if (currentScope.current !== operationScope) return
      setNotice('Report sent to FIT. A report does not automatically remove content.'); setReporting(null); setReportReason(''); setReportDetail('')
    } catch (failure) { if (currentScope.current === operationScope) setError(failure.message) }
    finally { if (currentScope.current === operationScope) { sending.current = false; setBusy(false) } }
  }
  const canPost = uncertain || !shop || (!owner && eligible.length > 0) || Boolean(replyTo)
  if (unavailable) return null
  return <section className={styles.thread} aria-label={shop ? 'Hosted shop reviews' : 'Article comments'}>
    <header className={styles.header}><div><h2>{shop ? 'Customer reviews of this service' : 'Join the conversation'}</h2><p>{shop ? 'Reviews are linked to a completed request for this shop. Payment may have been arranged directly with the provider.' : 'Ask a question or share something useful about this article.'}</p></div>{shop && <p className={styles.ratingSummary}>{data?.rating?.count ? <><strong>{Number(data.rating.average).toFixed(1)} / 5</strong><span>{data.rating.count} review{data.rating.count === 1 ? '' : 's'}</span></> : 'No reviews yet'}</p>}</header>
    <p className={styles.policy}>Posts appear immediately. FIT checks flagged content and reports. Honest criticism is welcome. Only FIT platform admins can hide or restore a post.</p>
    {loading && <p role="status">Loading {shop ? 'reviews' : 'comments'}.</p>}
    {error && <p role="alert" ref={errorSummary} tabIndex={-1} className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.notice}>{notice}</p>}
    {!loading && data && !data.entries.length && <p>No {shop ? 'reviews' : 'comments'} yet.</p>}
    <ul className={styles.entries}>{data?.entries.map(entry => <li key={entry.entryId}><article><header><strong>{entry.displayName}</strong>{entry.kind === 'shop_review' && <span aria-label={entry.rating + ' out of 5'}>{entry.rating} / 5</span>}<time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleDateString('en-SG')}</time></header>{entry.completedRequestLinked && <p className={styles.badge}>Completed request linked</p>}<p className={styles.body}>{entry.body}</p><div className={styles.row}>{isSignedIn && <button type="button" className={styles.link} onClick={() => { setReporting(entry.entryId); setReportReason(''); setReportDetail('') }}>Report to FIT</button>}{owner && !data.replies.some(reply => reply.replyTo === entry.entryId) && <button type="button" className={styles.link} onClick={() => { setReplyTo(entry.entryId); setText(''); setName(''); setError('') }}>Respond as the shop</button>}</div>{data.replies.filter(reply => reply.replyTo === entry.entryId).map(reply => <div key={reply.entryId} className={styles.reply}><strong>Shop response · {reply.displayName}</strong><p className={styles.body}>{reply.body}</p>{isSignedIn && <button type="button" className={styles.link} onClick={() => setReporting(reply.entryId)}>Report response to FIT</button>}</div>)}</article></li>)}</ul>
    {data?.nextCursor && <button className={styles.secondary} disabled={loading} onClick={() => load(data.nextCursor)}>Load older {shop ? 'reviews' : 'comments'}</button>}
    {reporting && <form className={styles.form} onSubmit={report} aria-label="Report content to FIT"><h3>Report to FIT</h3><label>Reason<select value={reportReason} required onChange={event => setReportReason(event.target.value)}><option value="">Choose a reason</option>{REPORT_REASONS.map(reason => <option key={reason} value={reason}>{reason[0].toUpperCase() + reason.slice(1)}</option>)}</select></label><label>Details (optional)<textarea maxLength={500} value={reportDetail} onChange={event => setReportDetail(event.target.value)} /></label><div className={styles.row}><button className={styles.primary} disabled={busy}>Send report</button><button type="button" className={styles.secondary} disabled={busy} onClick={() => setReporting(null)}>Cancel report</button></div></form>}
    {!isLoaded ? <p role="status">Loading your account.</p> : !isSignedIn ? <div className={styles.signIn}><p>Sign in to {shop ? 'review a completed request or report a concern' : 'post a comment'}.</p><SignInButton mode="modal"><button type="button" className={styles.secondary}>Sign in</button></SignInButton></div> : canPost ? <form className={styles.form} onSubmit={post} aria-label={replyTo ? 'Respond as the shop' : shop ? 'Write a shop review' : 'Write a comment'}>
      <h3>{replyTo ? 'Respond as the shop' : shop ? 'Review your completed request' : 'Write a comment'}</h3><p>Your chosen display name and text will be public. Leave out phone numbers, email addresses and other private details.</p>
      <label>Public display name<input required maxLength={50} value={name} disabled={busy || uncertain} onChange={event => setName(event.target.value)} /></label>
      {shop && !replyTo && <div className={styles.columns}><label>Completed request<select required value={order} disabled={busy || uncertain} onChange={event => setOrder(event.target.value)}><option value="">Choose your request</option>{eligible.map(item => <option key={item.orderType + ':' + item.orderId} value={item.orderType + ':' + item.orderId}>Completed request · {item.orderId.slice(-8)}</option>)}</select></label><label>Your rating<select required value={rating} disabled={busy || uncertain} onChange={event => setRating(event.target.value)}><option value="">Choose a rating</option>{[5,4,3,2,1].map(stars => <option key={stars} value={stars}>{stars} out of 5</option>)}</select></label></div>}
      <label>{shop ? 'Your experience' : 'Your comment'}<textarea required maxLength={1500} rows={4} value={text} disabled={busy || uncertain} onChange={event => setText(event.target.value)} /></label><p className={styles.small}>{text.length} / 1,500 characters</p>
      <div className={styles.row}><button className={styles.primary} disabled={busy}>{busy ? 'Posting…' : uncertain ? 'Retry same post' : 'Post publicly'}</button>{replyTo && !uncertain && <button type="button" className={styles.secondary} disabled={busy} onClick={() => { setReplyTo(null); setText('') }}>Cancel response</button>}</div>
    </form> : <p className={styles.policy}>{owner ? 'Shop owners can respond and report concerns. They cannot review their own service or remove customer reviews.' : 'A completed request for this shop is needed to write a review. Each request can have one review.'}</p>}
  </section>
}
