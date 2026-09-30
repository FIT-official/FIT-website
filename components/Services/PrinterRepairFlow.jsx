'use client'

import { useEffect, useRef, useState } from 'react'
import { SignInButton, useUser } from '@clerk/nextjs'
import { EMPTY_REPAIR_BRIEF, REPAIR_AUDIENCES, REPAIR_ISSUES, REPAIR_PHOTO_LIMIT, repairPhotoError, singaporeToday, validateRepairBrief, validateRepairSubmission } from '@/lib/printerRepair/validate'
import styles from './PrinterRepairFlow.module.css'

const STEPS = ['Your printer', 'Photos & checks', 'Contact & review']
async function responseJson(response) {
  let body
  try { body = await response.json() } catch { throw new Error('We could not read the response. Please try again.') }
  if (!response.ok) throw Object.assign(new Error(body.error || 'The request could not be completed. Please try again.'), { status: response.status })
  return body
}
async function boundedFetch(url, options = {}) {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  if (options.signal?.aborted) cancel()
  options.signal?.addEventListener('abort', cancel, { once: true })
  const timeout = setTimeout(cancel, 20000)
  try { return await responseJson(await fetch(url, { ...options, signal: controller.signal })) }
  finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', cancel) }
}
function safeReceipt(body) {
  const record = body?.request
  if (typeof record?.requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(record.requestId) || !['assessment_requested', 'withdrawn'].includes(record.status) || !validateRepairBrief(record.brief).ok || !Number.isInteger(record.photoCount) || record.photoCount < 0 || record.photoCount > 3) throw new Error('The saved request could not be verified. Check its status before trying again.')
  return body.request
}
const pendingKey = userId => `fit.printer-repair.pending.${userId}`
function savePending(userId, payload) { try { sessionStorage.setItem(pendingKey(userId), JSON.stringify(payload)) } catch { /* Keep the same attempt in memory if browser storage is unavailable. */ } }
function clearPending(userId) { try { sessionStorage.removeItem(pendingKey(userId)) } catch { /* Browser storage is optional. */ } }

export default function PrinterRepairFlow() {
  const { user, isLoaded, isSignedIn } = useUser()
  const [brief, setBrief] = useState({ ...EMPTY_REPAIR_BRIEF })
  const [step, setStep] = useState(0), [errors, setErrors] = useState({})
  const [photos, setPhotos] = useState([]), [photoError, setPhotoError] = useState('')
  const [uploadsAvailable, setUploadsAvailable] = useState(null)
  const [busy, setBusy] = useState(''), [message, setMessage] = useState('')
  const [pending, setPending] = useState(null), [receipt, setReceipt] = useState(null)
  const [savedReference, setSavedReference] = useState(false)
  const [discarding, setDiscarding] = useState(false), [withdrawing, setWithdrawing] = useState(false)
  const heading = useRef(null), errorSummary = useRef(null), files = useRef([])
  const uploaded = useRef(new Map()), active = useRef(null), sending = useRef(false)
  const restoreAccount = useRef(null)
  const account = useRef(null)
  account.current = isSignedIn ? user?.id : null
  const locked = Boolean(pending || busy)

  useEffect(() => {
    setSavedReference(new URL(window.location.href).searchParams.has('request'))
    const controller = new AbortController()
    boundedFetch('/api/printer-repair/config', { signal: controller.signal }).then(body => setUploadsAvailable(body.uploadsAvailable === true)).catch(() => { if (!controller.signal.aborted) setUploadsAvailable(false) })
    return () => controller.abort()
  }, [])
  useEffect(() => { files.current = photos }, [photos])
  useEffect(() => () => { active.current?.abort(); files.current.forEach(photo => URL.revokeObjectURL(photo.preview)) }, [])
  useEffect(() => {
    if (isLoaded && restoreAccount.current && restoreAccount.current !== account.current) {
      active.current?.abort(); files.current.forEach(photo => URL.revokeObjectURL(photo.preview))
      setPhotos([]); uploaded.current.clear(); setPending(null); setReceipt(null); setBrief({ ...EMPTY_REPAIR_BRIEF }); setStep(0); setErrors({}); setMessage(''); restoreAccount.current = null
    }
    if (!isLoaded || !isSignedIn || !user?.id || restoreAccount.current === user.id) return
    restoreAccount.current = user.id
    let saved
    try { saved = JSON.parse(sessionStorage.getItem(pendingKey(user.id))) } catch { /* No saved attempt. */ }
    if (saved && validateRepairSubmission(saved).ok) {
      setBrief(saved.brief); setPending(saved); setStep(2)
      setMessage('A previous send has not been checked yet. Check its status or retry the same request.')
    } else {
      setBrief(current => ({ ...current, contactName: current.contactName || user.fullName || '', email: current.email || user.primaryEmailAddress?.emailAddress || '' }))
      const requestId = new URL(window.location.href).searchParams.get('request')
      if (requestId && /^[0-9a-f-]{36}$/i.test(requestId)) {
        const actorId = user.id
        setBusy('checking')
        boundedFetch(`/api/printer-repair/${encodeURIComponent(requestId)}`, { cache: 'no-store' }).then(body => { if (account.current === actorId) setReceipt(safeReceipt(body)) }).catch(error => { if (account.current === actorId) setMessage(`The saved assessment could not be loaded: ${error.message}`) }).finally(() => { if (account.current === actorId) setBusy('') })
      }
    }
  }, [isLoaded, isSignedIn, user])
  useEffect(() => {
    if (receipt) {
      const url = new URL(window.location.href); url.searchParams.set('request', receipt.requestId)
      window.history.replaceState(null, '', url)
    }
  }, [receipt])

  function edit(field, value) { setBrief(current => ({ ...current, [field]: value })); setErrors(current => ({ ...current, [field]: undefined })); setMessage('') }
  function showErrors(next) { setErrors(next); requestAnimationFrame(() => errorSummary.current?.focus()) }
  function nextStep(event) {
    // React can reuse this button as the final submit control. Prevent the
    // native click action from submitting when the step changes synchronously.
    event.preventDefault()
    const checked = validateRepairBrief(brief, { step, today: singaporeToday() })
    if (!checked.ok) return showErrors(checked.errors)
    setErrors({}); setStep(current => current + 1); setDiscarding(false)
    requestAnimationFrame(() => heading.current?.focus())
  }
  function addPhotos(event) {
    const chosen = [...event.target.files]; event.target.value = ''
    if (photos.length + chosen.length > REPAIR_PHOTO_LIMIT) return setPhotoError('Choose up to three photos in total.')
    const error = chosen.map(repairPhotoError).find(Boolean)
    if (error) return setPhotoError(error)
    setPhotoError('')
    setPhotos(current => [...current, ...chosen.map(file => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) }))])
  }
  function removePhoto(id) {
    const photo = photos.find(item => item.id === id)
    if (photo) URL.revokeObjectURL(photo.preview)
    setPhotos(current => current.filter(item => item.id !== id)); setPhotoError('')
  }
  function discard() {
    photos.forEach(photo => URL.revokeObjectURL(photo.preview)); setPhotos([]); uploaded.current.clear()
    setBrief({ ...EMPTY_REPAIR_BRIEF }); setErrors({}); setStep(0); setMessage('Draft cleared. Nothing was sent.'); setDiscarding(false)
    requestAnimationFrame(() => heading.current?.focus())
  }
  async function checkStatus() {
    if (!pending || sending.current || !isSignedIn) return
    const actorId = user.id
    sending.current = true; setBusy('checking'); setMessage('')
    try { const record = safeReceipt(await boundedFetch(`/api/printer-repair?clientRequestId=${encodeURIComponent(pending.clientRequestId)}`, { cache: 'no-store' })); clearPending(actorId); if (account.current !== actorId) return; setPending(null); setReceipt(record) }
    catch (error) { if (account.current === actorId) setMessage(error.status === 404 ? 'No saved request was found. Retry the same request below.' : `${error.message} The original request is kept for a safe retry.`) }
    finally { sending.current = false; setBusy('') }
  }
  async function submit(event) {
    event.preventDefault()
    if (sending.current || !isLoaded || !isSignedIn || !user?.id) return
    const checked = validateRepairBrief(brief, { today: pending ? undefined : singaporeToday() })
    if (!pending && !checked.ok) return showErrors(checked.errors)
    sending.current = true; setMessage(''); setErrors({})
    const actorId = user.id
    const controller = new AbortController(); active.current = controller
    let payload = pending
    try {
      if (!payload) {
        const photoAssetIds = []
        setBusy(photos.length ? 'uploading' : 'sending')
        for (const photo of photos) {
          let assetId = uploaded.current.get(photo.id)
          if (!assetId) {
            const form = new FormData(); form.append('file', photo.file)
            const asset = await boundedFetch('/api/fabrication/assets', { method: 'POST', body: form, signal: controller.signal })
            if (asset.kind !== 'image' || !asset.assetId) throw new Error('That photo could not be verified. Remove it and try again.')
            assetId = asset.assetId; uploaded.current.set(photo.id, assetId)
          }
          photoAssetIds.push(assetId)
        }
        if (controller.signal.aborted) throw new DOMException('Upload stopped.', 'AbortError')
        if (account.current !== actorId) throw new Error('Your account changed. Please sign in and review your draft again.')
        payload = { clientRequestId: crypto.randomUUID(), brief: checked.value, photoAssetIds }
        setPending(payload); savePending(user.id, payload)
      }
      setBusy('sending')
      const record = safeReceipt(await boundedFetch('/api/printer-repair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }))
      clearPending(actorId)
      if (account.current !== actorId) return
      setPending(null); setReceipt(record)
      requestAnimationFrame(() => heading.current?.focus())
    } catch (error) {
      if (account.current !== actorId) return
      if (payload && !pending && [400, 413].includes(error.status)) { clearPending(actorId); setPending(null); setMessage(`${error.message} You can correct your draft and send again.`) }
      else if (payload) setMessage(`${error.message} Check the status or retry this same request. Its details are kept unchanged to prevent duplicates.`)
      else setMessage(error.name === 'AbortError' ? 'Upload stopped. Your draft is still here; no assessment request was sent.' : `${error.message} Your draft is still here.`)
    } finally { sending.current = false; setBusy(''); active.current = null }
  }
  async function withdraw() {
    if (sending.current || !receipt || !isSignedIn) return
    const actorId = user.id
    sending.current = true; setBusy('withdrawing'); setMessage('')
    try { const record = safeReceipt(await boundedFetch(`/api/printer-repair/${receipt.requestId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'withdraw' }) })); if (account.current !== actorId) return; setReceipt(record); setWithdrawing(false) }
    catch (error) { if (account.current === actorId) setMessage(`${error.message} You can retry withdrawal safely; it will not create another request.`) }
    finally { sending.current = false; setBusy('') }
  }
  function field(name, label, options = {}) {
    const id = `repair-${name}`, error = errors[name], hintId = options.hint ? `${id}-hint` : undefined
    const props = { id, name, value: brief[name], onChange: event => edit(name, event.target.value), disabled: locked, required: options.required, maxLength: options.maxLength, autoComplete: options.autoComplete, 'aria-invalid': Boolean(error), 'aria-describedby': [hintId, error && `${id}-error`].filter(Boolean).join(' ') || undefined }
    return <div className={styles.field} key={name}><label htmlFor={id}>{label}{!options.required && <span className={styles.optional}> Optional</span>}</label>
      {options.select ? <select {...props}>{options.placeholder && <option value="">{options.placeholder}</option>}{options.select.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select> : options.multiline ? <textarea {...props} rows={4} /> : <input {...props} type={options.type || 'text'} min={options.type === 'date' ? singaporeToday() : undefined} />}
      {options.hint && <p id={hintId} className={styles.hint}>{options.hint}</p>}{error && <p id={`${id}-error`} className={styles.error}>{error}</p>}</div>
  }
  const issueLabel = REPAIR_ISSUES.find(([key]) => key === brief.issue)?.[1]
  return <section className={styles.layout} aria-label="Printer repair assessment request">
    <aside className={styles.aside}><p className={styles.eyebrow}>Repair & maintenance</p><h1>Need help with your 3D printer?</h1><p>Tell us what’s going wrong. A photo and a few details can help us decide what to check next.</p>
      <ol className={styles.process}><li><span>01</span><div><h2>Share the symptoms</h2><p>Include the model, any error message and what you’ve already tried.</p></div></li><li><span>02</span><div><h2>Discuss the next step</h2><p>FIT will review the request and confirm whether we can help, including any assessment or handover arrangements.</p></div></li><li><span>03</span><div><h2>Approve before work starts</h2><p>Agree the scope, any cost and timing with FIT before proceeding.</p></div></li></ol>
      <details className={styles.mobileHelp}><summary>What happens after I send?</summary><p>FIT will review the details and discuss assessment and handover. Agree any work, cost and timing before proceeding.</p></details>
      <p className={styles.note}>Sending this form requests an assessment. An appointment, repair and fee are confirmed separately.</p>
    </aside>
    <div className={styles.panel}>
      {receipt ? <div className={styles.receipt}><p className={styles.eyebrow}>{receipt.status === 'withdrawn' ? 'Request withdrawn' : 'Assessment requested'}</p><h2 ref={heading} tabIndex={-1}>{receipt.status === 'withdrawn' ? 'Your request is closed.' : 'Your request has been received.'}</h2>
        <p>{receipt.status === 'withdrawn' ? 'This assessment request is marked as withdrawn.' : 'FIT will review your printer details and contact you about the next step. Your preferred date has not been booked.'}</p>
        {receipt.status !== 'withdrawn' && receipt.preferredDateNeedsDiscussion && <p className={styles.note}>Your preferred date has passed. Discuss a new date with FIT; no appointment has been booked.</p>}
        <p className={styles.reference}>Reference <strong>{receipt.requestId}</strong></p><dl className={styles.summary}><div><dt>Printer</dt><dd>{receipt.brief.brand} {receipt.brief.model}</dd></div><div><dt>Reply to</dt><dd>{receipt.brief.email}</dd></div><div><dt>Preferred date</dt><dd>{receipt.brief.preferredDate || 'To discuss'}</dd></div><div><dt>Photos</dt><dd>{receipt.photoCount}</dd></div></dl>
        {receipt.status !== 'withdrawn' && (!withdrawing ? <button className={styles.secondary} onClick={() => setWithdrawing(true)}>Withdraw request</button> : <div className={styles.confirm}><p>Withdraw this assessment request?</p><div className={styles.actions}><button disabled={Boolean(busy) || !isSignedIn} className={styles.primary} onClick={withdraw}>{busy ? 'Withdrawing…' : 'Yes, withdraw request'}</button><button disabled={Boolean(busy)} className={styles.secondary} onClick={() => setWithdrawing(false)}>Keep request</button></div></div>)}
        {message && <p role="alert" className={styles.error}>{message}</p>}
      </div> : <form onSubmit={submit} noValidate>
        {savedReference && isLoaded && !isSignedIn && <div className={styles.signIn}><p>Sign in to view this assessment request.</p><SignInButton mode="modal"><button type="button" className={styles.secondary}>Sign in to view request</button></SignInButton></div>}
        <ol className={styles.steps} aria-label="Request steps">{STEPS.map((title, index) => <li key={title} aria-current={index === step ? 'step' : undefined}><span>{index + 1}</span><p>{title}</p></li>)}</ol>
        <h2 className={styles.stepHeading} ref={heading} tabIndex={-1}>{STEPS[step]}</h2>
        {Object.values(errors).some(Boolean) && <div className={styles.errorSummary} ref={errorSummary} tabIndex={-1} role="alert"><p>Check these details</p><ul>{Object.entries(errors).filter(([, error]) => error).map(([name, error]) => <li key={name}><a href={`#repair-${name}`} onClick={event => { event.preventDefault(); document.getElementById(`repair-${name}`)?.focus() }}>{error}</a></li>)}</ul></div>}
        {step === 0 && <div className={styles.fields}><div className={styles.twoColumns}>{field('brand', 'Printer brand', { required: true, maxLength: 80, hint: 'For example, Bambu Lab or Creality. Unsure is fine.' })}{field('model', 'Printer model', { required: true, maxLength: 120, hint: 'Use the model on the label if you can find it.' })}</div>{field('issue', 'What needs attention?', { required: true, select: REPAIR_ISSUES, placeholder: 'Choose the closest description' })}{field('details', 'What happens when you use the printer?', { required: true, multiline: true, maxLength: 2000, hint: 'Describe the symptom and when it started.' })}{field('errorCode', 'Error code or message', { maxLength: 200 })}</div>}
        {step === 1 && <div className={styles.fields}><div className={styles.upload}><label htmlFor="repair-photos">Photos <span className={styles.optional}>Optional</span></label><p id="repair-photos-hint">A view of the printer, the affected print or the error screen helps. Up to three JPEG, PNG or WebP photos, 3 MB each and 4096 × 4096 pixels or smaller.</p>
          {uploadsAvailable === null ? <p role="status">Checking photo uploads…</p> : uploadsAvailable ? <input id="repair-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={locked} onChange={addPhotos} aria-describedby={`repair-photos-hint${photoError ? ' repair-photos-error' : ''}`} aria-invalid={Boolean(photoError)} /> : <p role="status">Photo uploads are currently unavailable. You can send your request without photos and discuss them with FIT.</p>}
          {photoError && <p id="repair-photos-error" className={styles.error} role="alert">{photoError}</p>}
          <ul className={styles.photoList}>{photos.map(photo => <li key={photo.id}><div className={styles.thumbnail} style={{ backgroundImage: `url("${photo.preview}")` }} role="img" aria-label={`Preview of ${photo.file.name}`} /><span>{photo.file.name}</span><button type="button" className={styles.secondary} disabled={locked} onClick={() => removePhoto(photo.id)} aria-label={`Remove ${photo.file.name}`}>Remove</button></li>)}</ul>
        </div>{field('troubleshooting', 'What have you already tried?', { multiline: true, maxLength: 2000, hint: 'For example, restarting, cleaning or changing filament. You can leave this blank.' })}</div>}
        {step === 2 && <div className={styles.fields}>
          <div className={styles.twoColumns}>{field('contactName', 'Your name', { required: true, maxLength: 100, autoComplete: 'name' })}{field('email', 'Email', { required: true, type: 'email', maxLength: 254, autoComplete: 'email' })}</div>
          {field('phone', 'Phone', { type: 'tel', maxLength: 40, autoComplete: 'tel' })}{field('audience', 'Who is the printer for?', { required: true, select: REPAIR_AUDIENCES })}{field('organisation', 'School or organisation', { maxLength: 120, autoComplete: 'organization' })}
          {field('preferredDate', 'Preferred assessment date', { type: 'date', hint: 'A preference only. FIT will discuss availability; no slot is reserved.' })}{field('handover', 'Handover arrangement', { required: true, select: [['discuss_with_fit', 'Discuss with FIT']], hint: 'Agree the location and method with FIT before bringing or sending a printer.' })}
          <div className={styles.review}><h3>Check your request</h3><dl className={styles.summary}><div><dt>Printer</dt><dd>{brief.brand} {brief.model}</dd></div><div><dt>Issue</dt><dd>{issueLabel}</dd></div><div><dt>Symptoms</dt><dd className={styles.multiline}>{brief.details}</dd></div>{brief.errorCode && <div><dt>Error message</dt><dd>{brief.errorCode}</dd></div>}{brief.troubleshooting && <div><dt>Already tried</dt><dd className={styles.multiline}>{brief.troubleshooting}</dd></div>}<div><dt>Photos</dt><dd>{pending ? pending.photoAssetIds.length : photos.length}</dd></div></dl></div>
          <p className={styles.hint}>We’ll use your contact details to respond to this request. Photos are uploaded privately after you choose to send.</p>
          {!isLoaded ? <p role="status">Loading your account…</p> : !isSignedIn && <div className={styles.signIn}><p>Sign in to send your request and keep its photos private. Your draft stays here while you sign in.</p><SignInButton mode="modal"><button type="button" className={styles.secondary}>Sign in to continue</button></SignInButton></div>}
        </div>}
        {message && <p role="alert" className={styles.error}>{message}</p>}
        {pending && <p className={styles.note}>This send needs confirmation. Check its status first, or retry exactly the same details.</p>}
        {busy && <p role="status" aria-live="polite">{busy === 'uploading' ? 'Uploading your photos privately…' : busy === 'checking' ? 'Checking the saved request…' : 'Sending your assessment request…'}</p>}
        <div className={styles.actions}>
          {step > 0 && <button type="button" className={styles.secondary} disabled={locked} onClick={() => { setStep(current => current - 1); setErrors({}); requestAnimationFrame(() => heading.current?.focus()) }}>Back</button>}
          {step < 2 ? <button key="continue" type="button" className={styles.primary} onClick={nextStep}>Continue</button> : <button key="send" type="submit" className={styles.primary} disabled={Boolean(busy) || !isLoaded || !isSignedIn}>{busy === 'uploading' ? 'Uploading…' : busy ? 'Please wait…' : pending ? 'Retry same request' : 'Send assessment request'}</button>}
          {pending && <button type="button" className={styles.secondary} onClick={checkStatus} disabled={Boolean(busy) || !isSignedIn}>Check request status</button>}
          {busy === 'uploading' && <button type="button" className={styles.secondary} onClick={() => active.current?.abort()}>Stop upload</button>}
        </div>
        {!locked && <div className={styles.cancel}>{discarding ? <><p>Clear this draft? Nothing has been sent.</p><div className={styles.actions}><button className={styles.secondary} type="button" onClick={discard}>Clear draft</button><button className={styles.secondary} type="button" onClick={() => setDiscarding(false)}>Keep editing</button></div></> : <button type="button" className={styles.textButton} onClick={() => setDiscarding(true)}>Cancel this draft</button>}</div>}
      </form>}
    </div>
  </section>
}
