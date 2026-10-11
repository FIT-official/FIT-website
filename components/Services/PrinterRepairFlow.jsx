'use client'

import { useEffect, useRef, useState } from 'react'
import { SignInButton, useUser } from '@clerk/nextjs'
import { EMPTY_REPAIR_BRIEF, REPAIR_AUDIENCES, REPAIR_PHOTO_LIMIT, repairPhotoError, singaporeToday, validateRepairBrief, validateRepairSubmission } from '@/lib/printerRepair/validate'
import { REPAIR_BRANDS, REPAIR_FEEDERS, REPAIR_GUIDANCE, REPAIR_MODELS, reconcileRepairSelection, repairIssueOptions, repairSpecificOptions } from '@/lib/printerRepair/options'
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
const signInDraftKey = 'fit.printer-repair.sign-in-draft'
function takeSignInDraft() {
  try {
    const raw = sessionStorage.getItem(signInDraftKey); sessionStorage.removeItem(signInDraftKey)
    const saved = JSON.parse(raw)
    if (!saved || !Number.isFinite(saved.savedAt) || saved.savedAt > Date.now() || Date.now() - saved.savedAt > 30 * 60 * 1000) return null
    if (!saved.brief || Object.keys(saved.brief).some(key => !Object.hasOwn(EMPTY_REPAIR_BRIEF, key)) || Object.values(saved.brief).some(value => typeof value !== 'string' || value.length > 2000)) return null
    if (!validateRepairBrief(saved.brief, { step: 0 }).ok || !validateRepairBrief(saved.brief, { step: 1 }).ok) return null
    return { brief: validateRepairBrief(saved.brief).value, hadPhotos: saved.hadPhotos === true }
  } catch { return null }
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
  const [requestsAvailable, setRequestsAvailable] = useState(null)
  const [photoBusy, setPhotoBusy] = useState(false), [uploadProgress, setUploadProgress] = useState('')
  const [selectionNotice, setSelectionNotice] = useState('')
  const photoGeneration = useRef(0)
  const [busy, setBusy] = useState(''), [message, setMessage] = useState('')
  const [pending, setPending] = useState(null), [receipt, setReceipt] = useState(null)
  const [savedReference, setSavedReference] = useState(false)
  const [signInReturnUrl, setSignInReturnUrl] = useState('/printer-repair')
  const [discarding, setDiscarding] = useState(false), [withdrawing, setWithdrawing] = useState(false)
  const heading = useRef(null), errorSummary = useRef(null), files = useRef([])
  const uploaded = useRef(new Map()), active = useRef(null), sending = useRef(false)
  const restoreAccount = useRef(null)
  const account = useRef(null)
  account.current = isSignedIn ? user?.id : null
  const locked = Boolean(pending || busy)

  useEffect(() => {
    const reference = new URL(window.location.href).searchParams.get('request')
    setSavedReference(Boolean(reference))
    setSignInReturnUrl(reference && /^[0-9a-f-]{36}$/i.test(reference) ? `/printer-repair?request=${encodeURIComponent(reference)}` : '/printer-repair')
    const controller = new AbortController(), lifecycle = photoGeneration
    boundedFetch('/api/printer-repair/config', { signal: controller.signal }).then(body => {
      setUploadsAvailable(body.uploadsAvailable === true); setRequestsAvailable(body.requestsAvailable !== false)
    }).catch(() => { if (!controller.signal.aborted) { setUploadsAvailable(false); setRequestsAvailable(false) } })
    return () => { controller.abort(); lifecycle.current++ }
  }, [])
  useEffect(() => { files.current = photos }, [photos])
  useEffect(() => () => { active.current?.abort(); files.current.forEach(photo => URL.revokeObjectURL(photo.preview)) }, [])
  useEffect(() => {
    if (isLoaded && restoreAccount.current && restoreAccount.current !== account.current) {
      photoGeneration.current++; setPhotoBusy(false); active.current?.abort(); files.current.forEach(photo => URL.revokeObjectURL(photo.preview))
      setPhotos([]); uploaded.current.clear(); setPending(null); setReceipt(null); setBrief({ ...EMPTY_REPAIR_BRIEF }); setStep(0); setErrors({}); setMessage(''); restoreAccount.current = null
    }
    if (!isLoaded || !isSignedIn || !user?.id || restoreAccount.current === user.id) return
    restoreAccount.current = user.id
    let saved
    try { saved = JSON.parse(sessionStorage.getItem(pendingKey(user.id))) } catch { /* No saved attempt. */ }
    if (saved && validateRepairSubmission(saved).ok) {
      setBrief(validateRepairSubmission(saved).value.brief); setPending(saved); setStep(2)
      setMessage('A previous send has not been checked yet. Check its status or retry the same request.')
    } else {
      const requestId = new URL(window.location.href).searchParams.get('request')
      const signInDraft = !requestId ? takeSignInDraft() : null
      if (signInDraft) {
        setBrief({ ...signInDraft.brief, contactName: signInDraft.brief.contactName || user.fullName || '', email: signInDraft.brief.email || user.primaryEmailAddress?.emailAddress || '' }); setStep(2)
        setMessage(signInDraft.hadPhotos && !files.current.length ? 'Your draft is restored. Please choose your photos again before sending.' : 'Your draft is restored. Review it before sending; nothing has been submitted.')
      } else setBrief(current => ({ ...current, contactName: current.contactName || user.fullName || '', email: current.email || user.primaryEmailAddress?.emailAddress || '' }))
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

  function keepDraftForSignIn() {
    try { sessionStorage.setItem(signInDraftKey, JSON.stringify({ brief, hadPhotos: photos.length > 0, savedAt: Date.now() })) }
    catch { setMessage('Your browser cannot preserve the draft across sign-in. Keep a copy of your details before continuing.') }
  }
  function edit(field, value) {
    if (['brandChoice', 'brandOther', 'modelChoice', 'model', 'feeder', 'issue'].includes(field)) {
      const result = reconcileRepairSelection(brief, field, value)
      setBrief(result.brief); setSelectionNotice(result.notice); setErrors({})
    } else setBrief(current => ({ ...current, [field]: value })); setErrors(current => ({ ...current, [field]: undefined })); setMessage('') }
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
  async function addPhotos(event, replaceId) {
    const chosen = [...event.target.files]; event.target.value = ''
    if (!chosen.length || locked || photoBusy) return
    if (photos.length - (replaceId ? 1 : 0) + chosen.length > REPAIR_PHOTO_LIMIT) return setPhotoError('Choose up to three photos in total.')
    const error = chosen.map(repairPhotoError).find(Boolean)
    if (error) return setPhotoError(error)
    const generation = ++photoGeneration.current
    setPhotoError(''); setPhotoBusy(true)
    try {
      // The server repeats decoding/type/dimension checks before private storage.
      if (typeof createImageBitmap === 'function') for (const file of chosen) {
        if (/\.hei[cf]$/i.test(file.name)) continue // Converted safely on the server when sent.
        const bitmap = await createImageBitmap(file)
        const oversized = bitmap.width > 12000 || bitmap.height > 12000 || bitmap.width * bitmap.height > 24000000
        bitmap.close()
        if (oversized) throw new Error('Choose photos up to 24 megapixels.')
      }
      if (generation !== photoGeneration.current) return
      const additions = chosen.map(file => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) }))
      if (replaceId) {
        const previous = photos.find(photo => photo.id === replaceId)
        if (previous) URL.revokeObjectURL(previous.preview)
        uploaded.current.delete(replaceId)
        setPhotos(current => current.map(photo => photo.id === replaceId ? additions[0] : photo))
      } else setPhotos(current => [...current, ...additions])
    } catch (error) {
      if (generation === photoGeneration.current) setPhotoError(error.message.includes('megapixels') ? error.message : 'That image could not be opened. Choose a JPEG, PNG or WebP photo.')
    } finally { if (generation === photoGeneration.current) setPhotoBusy(false) }
  }
  function removePhoto(id) {
    const photo = photos.find(item => item.id === id)
    if (photo) URL.revokeObjectURL(photo.preview)
    uploaded.current.delete(id); setPhotos(current => current.filter(item => item.id !== id)); setPhotoError('')
  }
  function discard() {
    try { sessionStorage.removeItem(signInDraftKey) } catch { /* Browser storage is optional. */ }
    photoGeneration.current++; setPhotoBusy(false); setSelectionNotice(''); photos.forEach(photo => URL.revokeObjectURL(photo.preview)); setPhotos([]); uploaded.current.clear()
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
    if (sending.current || !isLoaded || !isSignedIn || !user?.id || requestsAvailable !== true) return
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
        for (const [index, photo] of photos.entries()) {
          setUploadProgress(`Uploading photo ${index + 1} of ${photos.length}.`)
          let assetId = uploaded.current.get(photo.id)
          if (!assetId) {
            const form = new FormData(); form.append('file', photo.file)
            const asset = await boundedFetch('/api/printer-repair/photos', { method: 'POST', body: form, signal: controller.signal })
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
    } finally { sending.current = false; setBusy(''); setUploadProgress(''); active.current = null }
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
  const issueOptions = repairIssueOptions(brief)
  const mainIssueLabel = issueOptions.find(([key]) => key === brief.issue)?.[1]
  const specificOptions = repairSpecificOptions(brief.issue)
  const specificLabel = specificOptions.find(([key]) => key === brief.specificSymptom)?.[1]
  const issueLabel = `${mainIssueLabel || ''}${specificLabel ? ` / ${specificLabel}` : ''}`
  const models = REPAIR_MODELS[brief.brandChoice], feeders = REPAIR_FEEDERS[brief.brandChoice], guidance = REPAIR_GUIDANCE[brief.brandChoice]
  function photoControls() {
    return <div className={styles.upload}>
      <div className={styles.uploadHeading}><label htmlFor="repair-photos">Photos <span className={styles.optional}>Optional</span></label><span>{photos.length} / {REPAIR_PHOTO_LIMIT}</span></div>
      <p id="repair-photos-hint">Show the failed print, the printer or the error screen. JPEG, PNG, WebP or HEIC — up to 3 photos, 3 MB each and 24 megapixels. Photos are resized and attached to the email sent to FIT.</p>
      {uploadsAvailable === null ? <p role="status">Checking photo uploads.</p> : uploadsAvailable ? <div className={styles.uploadActions}>
        <label className={styles.fileButton}><span>Choose photos</span><input id="repair-photos" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple disabled={locked || photoBusy} onChange={addPhotos} aria-describedby={`repair-photos-hint${photoError ? ' repair-photos-error' : ''}`} aria-invalid={Boolean(photoError)} /></label>
        <label className={styles.fileButton}><span>Take a photo</span><input aria-label="Take a photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" capture="environment" disabled={locked || photoBusy} onChange={addPhotos} aria-describedby="repair-camera-hint" /></label>
      </div> : <p role="status">Photo uploads are currently unavailable. You can send your request without photos and discuss them with FIT.</p>}
      {uploadsAvailable && <p id="repair-camera-hint" className={styles.hint}>On a phone, Take a photo opens the camera where supported. Photos stay in this draft until you send.</p>}
      {photoBusy && <p role="status">Checking the selected image.</p>}
      {photoError && <p id="repair-photos-error" className={styles.error} role="alert">{photoError}</p>}
      <ul className={styles.photoList}>{photos.map(photo => <li key={photo.id}>
        <div className={styles.thumbnail} style={{ backgroundImage: `url("${photo.preview}")` }} role="img" aria-label={`Preview of ${photo.file.name}`} />
        <div className={styles.photoDetails}><span>{photo.file.name}</span>{/\.hei[cf]$/i.test(photo.file.name) && <small>HEIC preview may be unavailable here. FIT receives a converted JPEG when you send.</small>}<small>{(photo.file.size / 1024 / 1024).toFixed(2)} MB</small><div className={styles.photoActions}>
          <label className={styles.fileButton}><span>Replace</span><input type="file" aria-label={`Replace ${photo.file.name}`} accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" disabled={locked || photoBusy} onChange={event => addPhotos(event, photo.id)} /></label>
          <button type="button" className={styles.secondary} disabled={locked || photoBusy} onClick={() => removePhoto(photo.id)} aria-label={`Remove ${photo.file.name}`}>Remove</button>
        </div></div>
      </li>)}</ul>
    </div>
  }
  return <section className={styles.layout} aria-label="Printer repair assessment request">
    <header className={styles.intro}><p className={styles.eyebrow}>Printer repair & maintenance</p><h1>Need help with your 3D printer?</h1><p>Tell us what happens and add a photo if you can. We will review the details and discuss the next step with you.</p></header>
    <aside className={styles.aside}><h2>Before you send</h2><p>You do not need to know which part has failed. The printer model, a clear photo and the error message are a useful start.</p><h2>What happens next?</h2><p>FIT will confirm whether we can help and discuss assessment, handover and any cost with you.</p><p className={styles.note}>This is an assessment request. Agree the work, fee and appointment with FIT before proceeding.</p></aside>
    <div className={styles.panel}>
      {receipt ? <div className={styles.receipt}><p className={styles.eyebrow}>{receipt.status === 'withdrawn' ? 'Request withdrawn' : 'Assessment requested'}</p><h2 ref={heading} tabIndex={-1}>{receipt.status === 'withdrawn' ? 'Your request is closed.' : 'Your request has been received.'}</h2>
        <p>{receipt.status === 'withdrawn' ? 'This assessment request is marked as withdrawn.' : 'FIT will review your printer details and contact you about the next step. Your preferred date has not been booked.'}</p>
        {receipt.status !== 'withdrawn' && receipt.preferredDateNeedsDiscussion && <p className={styles.note}>Your preferred date has passed. Discuss a new date with FIT; no appointment has been booked.</p>}
        <p className={styles.reference}>Reference <strong>{receipt.requestId}</strong></p><dl className={styles.summary}><div><dt>Printer</dt><dd>{receipt.brief.brand} {receipt.brief.model}</dd></div><div><dt>Reply to</dt><dd>{receipt.brief.email}</dd></div><div><dt>Preferred date</dt><dd>{receipt.brief.preferredDate || 'To discuss'}</dd></div><div><dt>Photos</dt><dd>{receipt.photoCount}</dd></div></dl>
        {receipt.status !== 'withdrawn' && (!withdrawing ? <button className={styles.secondary} onClick={() => setWithdrawing(true)}>Withdraw request</button> : <div className={styles.confirm}><p>Withdraw this assessment request?</p><div className={styles.actions}><button disabled={Boolean(busy) || !isSignedIn} className={styles.primary} onClick={withdraw}>{busy ? 'Withdrawing…' : 'Yes, withdraw request'}</button><button disabled={Boolean(busy)} className={styles.secondary} onClick={() => setWithdrawing(false)}>Keep request</button></div></div>)}
        {message && <p role="alert" className={styles.error}>{message}</p>}
      </div> : <form onSubmit={submit} noValidate>
        {savedReference && isLoaded && !isSignedIn && <div className={styles.signIn}><p>Sign in to view this assessment request.</p><SignInButton mode="modal" forceRedirectUrl={signInReturnUrl} signUpForceRedirectUrl={signInReturnUrl}><button type="button" className={styles.secondary}>Sign in to view request</button></SignInButton></div>}
        <p className={styles.stepCount}>Step {step + 1} of 3</p><ol className={styles.steps} aria-label="Request steps">{STEPS.map((title, index) => <li key={title} aria-current={index === step ? 'step' : undefined}><p>{title}</p></li>)}</ol>
        <h2 className={styles.stepHeading} ref={heading} tabIndex={-1}>{STEPS[step]}</h2>
        {Object.values(errors).some(Boolean) && <div className={styles.errorSummary} ref={errorSummary} tabIndex={-1} role="alert"><p>Check these details</p><ul>{Object.entries(errors).filter(([, error]) => error).map(([name, error]) => <li key={name}><a href={`#repair-${name}`} onClick={event => { event.preventDefault(); document.getElementById(`repair-${name}`)?.focus() }}>{error}</a></li>)}</ul></div>}
        {step === 0 && <div className={styles.fields}>
          <div className={styles.twoColumns}>{field('brandChoice', 'Printer brand', { required: true, select: REPAIR_BRANDS, placeholder: 'Choose a brand', hint: 'FIT will confirm repair support after reviewing your request.' })}{models ? field('modelChoice', 'Printer model', { required: true, select: models, placeholder: 'Choose a model' }) : field('model', 'Printer model', { required: true, maxLength: 120, hint: 'Enter the model on the label, or say unsure.' })}</div>
          {brief.brandChoice === 'other' && field('brandOther', 'Enter printer brand', { required: true, maxLength: 80 })}
          {models && brief.modelChoice === 'other' && field('model', 'Enter printer model', { required: true, maxLength: 120 })}
          {feeders && field('feeder', brief.brandChoice === 'prusa' ? 'Is an MMU installed?' : 'Which feeder is installed?', { required: true, select: feeders, hint: 'Choose the equipment actually connected to this printer. Not sure is fine.' })}
          {selectionNotice && <p className={styles.hint} role="status">{selectionNotice}</p>}
          {field('issue', 'What needs attention?', { required: true, select: issueOptions, placeholder: 'Choose the closest description', hint: "Choose what you're seeing. You don't need to know which part has failed." })}
          {specificOptions.length > 0 && field('specificSymptom', 'Which symptom do you see?', { select: specificOptions, placeholder: 'Leave blank if unsure' })}
          {field('details', 'What happens when you use the printer?', { required: true, multiline: true, maxLength: 2000, hint: 'What goes wrong, and when does it happen?' })}
          {field('errorCode', 'Error code or message', { maxLength: 200, hint: 'Copy the whole message if you can. Leave this blank if there is none.' })}
          {photoControls()}
          {guidance && <details className={styles.vendorHelp}><summary>Manufacturer help for this printer</summary><p>Useful references if you want to check a message. These categories describe symptoms; they do not identify the fault.</p><ul>{guidance.links.map(([label, url]) => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer">{label} (opens a new tab)</a></li>)}</ul><p>References checked {guidance.lastVerified}.</p></details>}
        </div>}
        {step === 1 && <div className={styles.fields}><p className={styles.stepIntro}>Add a photo or tell us about any checks you have tried. Both are optional.</p>{photoControls()}{field('troubleshooting', 'What have you already tried?', { multiline: true, maxLength: 2000, hint: 'For example, restarting or checking the filament path. Leave this blank if you have not tried anything.' })}</div>}
        {step === 2 && <div className={styles.fields}>
          <div className={styles.twoColumns}>{field('contactName', 'Your name', { required: true, maxLength: 100, autoComplete: 'name' })}{field('email', 'Email', { required: true, type: 'email', maxLength: 254, autoComplete: 'email' })}</div>
          {field('phone', 'Phone', { type: 'tel', maxLength: 40, autoComplete: 'tel' })}{field('audience', 'Who is the printer for?', { required: true, select: REPAIR_AUDIENCES })}{field('organisation', 'School or organisation', { maxLength: 120, autoComplete: 'organization' })}
          {field('preferredDate', 'Preferred assessment date', { type: 'date', hint: 'A preference only. FIT will discuss availability; no slot is reserved.' })}{field('handover', 'Handover arrangement', { required: true, select: [['discuss_with_fit', 'Discuss with FIT']], hint: 'Agree the location and method with FIT before bringing or sending a printer.' })}
          <div className={styles.review}><h3>Check your request</h3><dl className={styles.summary}><div><dt>Printer</dt><dd>{brief.brand} {brief.model}</dd></div><div><dt>Issue</dt><dd>{issueLabel}</dd></div><div><dt>Symptoms</dt><dd className={styles.multiline}>{brief.details}</dd></div>{brief.errorCode && <div><dt>Error message</dt><dd>{brief.errorCode}</dd></div>}{brief.troubleshooting && <div><dt>Already tried</dt><dd className={styles.multiline}>{brief.troubleshooting}</dd></div>}<div><dt>Photos</dt><dd>{pending ? pending.photoAssetIds.length : photos.length}</dd></div></dl>{photos.length > 0 && <div className={styles.reviewPhotos}>{photos.map(photo => <div key={photo.id} className={styles.thumbnail} style={{ backgroundImage: `url("${photo.preview}")` }} role="img" aria-label={`Review photo ${photo.file.name}`} />)}<button type="button" className={styles.secondary} disabled={locked} onClick={() => { setStep(1); requestAnimationFrame(() => heading.current?.focus()) }}>Edit photos</button></div>}</div>
          <p className={styles.hint}>We will use your contact details to respond to this request. Photos are uploaded privately after you choose to send. <a href="/privacy">Read our privacy policy</a>.</p>
          {!isLoaded ? <p role="status">Loading your account…</p> : !isSignedIn && <div className={styles.signIn}><p>Sign in to send your request and keep its photos private. Your draft stays here while you sign in.</p><SignInButton mode="modal" forceRedirectUrl={signInReturnUrl} signUpForceRedirectUrl={signInReturnUrl}><button type="button" className={styles.secondary} onClick={keepDraftForSignIn}>Sign in to continue</button></SignInButton></div>}
        </div>}
        {message && <p role="alert" className={styles.error}>{message}</p>}
        {pending && <p className={styles.note}>This send needs confirmation. Check its status first, or retry exactly the same details.</p>}
        {requestsAvailable === false && <p role="status" className={styles.note}>Online assessment requests are temporarily unavailable. Your draft is still here. <a href="mailto:fixittoday.contact@gmail.com">Email FIT about your printer</a> instead.</p>}
        {busy && <p role="status" aria-live="polite">{busy === 'uploading' ? uploadProgress || 'Uploading your photos privately.' : busy === 'checking' ? 'Checking the saved request.' : 'Sending your assessment request.'}</p>}
        <div className={styles.actions}>
          {step > 0 && <button type="button" className={styles.secondary} disabled={locked} onClick={() => { setStep(current => current - 1); setErrors({}); requestAnimationFrame(() => heading.current?.focus()) }}>Back</button>}
          {step < 2 ? <button key="continue" type="button" className={styles.primary} disabled={locked || photoBusy} onClick={nextStep}>Continue</button> : <button key="send" type="submit" className={styles.primary} disabled={Boolean(busy) || !isLoaded || !isSignedIn || requestsAvailable !== true}>{busy === 'uploading' ? 'Uploading…' : busy ? 'Please wait…' : pending ? 'Retry same request' : 'Send assessment request'}</button>}
          {pending && <button type="button" className={styles.secondary} onClick={checkStatus} disabled={Boolean(busy) || !isSignedIn}>Check request status</button>}
          {busy === 'uploading' && <button type="button" className={styles.secondary} onClick={() => active.current?.abort()}>Stop upload</button>}
        </div>
        {!locked && !photoBusy && <div className={styles.cancel}>{discarding ? <><p>Clear this draft? Nothing has been sent.</p><div className={styles.actions}><button className={styles.secondary} type="button" onClick={discard}>Clear draft</button><button className={styles.secondary} type="button" onClick={() => setDiscarding(false)}>Keep editing</button></div></> : <button type="button" className={styles.textButton} onClick={() => setDiscarding(true)}>Cancel this draft</button>}</div>}
      </form>}
    </div>
  </section>
}
