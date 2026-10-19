'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { SignInButton, useUser } from '@clerk/nextjs'
import useStore from '@/utils/store'
import ModelDrop from '@/components/PrintRequest/ModelDrop'
import { checkModelFile, quoteRequirements } from '@/lib/customPrint/modelInput'
import { GUIDED_START, GUIDED_CATEGORIES, GUIDED_FILE_BYTES, validateGuidedBrief, guidedSummary } from '@/lib/customPrint/guidedBrief'
const Viewer = dynamic(() => import('@/components/Editor/viewer'), { ssr: false, loading: () => <p>Preparing preview…</p> })
const field = 'mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base'
const button = 'rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50'
const draftKey = 'fit.guided-print.v1'
const json = async response => { try { return await response.json() } catch { return {} } }

const START_BRIEF = { ...GUIDED_START, sizeMode: 'original' }
const readDraft = () => { try { return JSON.parse(sessionStorage.getItem(draftKey) || 'null') } catch { return null } }
const writeDraft = value => { try { sessionStorage.setItem(draftKey, JSON.stringify(value)) } catch { /* optional local draft */ } }
const dropDraft = () => { try { sessionStorage.removeItem(draftKey) } catch { /* optional */ } }
// Who a stored draft belongs to. Drafts made before sign-in have no owner (null) and may be picked up by whoever signs in on this
// tab; a draft made while signed in belongs to that account only. Older drafts without an owner but with a held request use its user.
const draftOwner = draft => draft?.owner ?? draft?.pending?.userId ?? null

// The account decides which form is on screen. Moving from one signed-in account to another, or to signed out, mounts a brand-new
// empty form at once (during render, not in an effect), so nothing of the previous account's enquiry, file, held retry or saved
// reference is ever rendered for the next one. Going from signed out to signed in keeps the form, so a visitor's draft and chosen
// file carry over to sign-in. This uses only the identity Clerk already provides; it grants nothing and the server stays the authority.
export default function GuidedPrintRequest() {
  const { user, isLoaded } = useUser()
  const uid = typeof user?.id === 'string' && user.id ? user.id : null
  const [track, setTrack] = useState({ uid: undefined, generation: 0 })
  let generation = track.generation
  if (isLoaded && track.uid !== uid) {
    generation = track.uid !== undefined && track.uid !== null ? track.generation + 1 : track.generation
    setTrack({ uid, generation })
  }
  if (!isLoaded) return <main className="px-4 py-8 text-sm text-slate-600" role="status">Loading…</main>
  return <GuidedPrintForm key={generation} uid={uid} user={user} />
}

function GuidedPrintForm({ uid, user }) {
  const { isLoaded } = useUser()
  const [brief, setBrief] = useState({ ...START_BRIEF })
  const [mode, setMode] = useState('model')
  const [loaded, setLoaded] = useState(false)
  const [storage, setStorage] = useState('loading')
  const [colours, setColours] = useState([])
  const [file, setFile] = useState(null)
  const [scene, setScene] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [fileNote, setFileNote] = useState('')
  const [fileCheck, setFileCheck] = useState(null)
  const [checking, setChecking] = useState(false)
  const [fileError, setFileError] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState(null)
  const [result, setResult] = useState(null)
  const fileVersion = useRef(0)
  const attached = useRef(null)
  const clientId = useRef(null)
  const sending = useRef(false)
  const alive = useRef(true)
  const [startUid] = useState(uid)  // the account this form was mounted for: the draft restore below runs once, for that account
  const previewed = useRef(false)
  const ownerRef = useRef(uid)
  ownerRef.current = uid            // assigned during render so a late callback compares with the account on screen right now
  const patch = value => setBrief(current => ({ ...current, ...value }))
  // Late results (file checks, previews, uploads, the POST) are reported only while this form still belongs to the account that
  // started them. A request already accepted by the server stays accepted; this screen simply stops reporting on it.
  useEffect(() => {
    alive.current = true
    const draft = readDraft(), owner = draftOwner(draft)
    if (draft && owner !== null && owner !== startUid) dropDraft()                      // another account's draft is removed, never shown
    else if (draft?.brief) {
      setBrief({ ...START_BRIEF, ...draft.brief }); if (draft.mode === 'help') setMode('help')
      clientId.current = draft.clientRequestId || null; if (draft.pending && (!draft.pending.userId || draft.pending.userId === startUid)) setPending(draft.pending)
    }
    setLoaded(true)
    const controller = new AbortController()
    fetch('/api/custom-print/guided', { signal: controller.signal }).then(json).then(data => { if (alive.current) setStorage(data.uploadsAvailable ? 'ready' : 'unavailable') }).catch(() => { if (!controller.signal.aborted && alive.current) setStorage('unavailable') })
    fetch('/api/filament-availability', { signal: controller.signal }).then(json).then(data => { if (alive.current) setColours(Array.isArray(data.colours) ? data.colours : []) }).catch(() => {})
    return () => {
      alive.current = false; controller.abort()
      if (previewed.current) { try { const store = useStore.getState(); store.setBuffers(new Map()); store.setFileName('') } catch { /* viewer store is optional */ } }
    }
  }, [startUid])
  useEffect(() => { if (loaded && !result && alive.current) writeDraft({ owner: uid, mode, brief, clientRequestId: clientId.current, pending }) }, [brief, mode, loaded, result, pending, uid])
  // Choosing a file only checks its name, size and first bytes. The heavy 3D viewer never starts by itself.
  async function chooseFile(next) {
    const version = ++fileVersion.current
    setFile(null); setScene(null); setMetrics(null); attached.current = null; setFileNote(''); setError(''); setFileError(''); setFileCheck(null); setPreviewing(false)
    if (!next) return
    setChecking(true)
    try {
      const checked = await checkModelFile(next, { maxBytes: GUIDED_FILE_BYTES })
      if (version !== fileVersion.current || !alive.current) return
      if (!checked.ok) { setFileError(checked.message); return }
      setFile(next); setFileCheck(checked); setFileNote(checked.note)
    } finally { if (version === fileVersion.current && alive.current) setChecking(false) }
  }
  // Optional, on request only, and STL only.
  async function previewFile() {
    const target = file
    if (!target || !/\.stl$/i.test(target.name) || previewing) return
    const version = ++fileVersion.current
    setPreviewing(true); setError('')
    try {
      const buffer = await target.arrayBuffer()
      if (version !== fileVersion.current || !alive.current) return
      const store = useStore.getState(); previewed.current = true; store.setFileName(target.name); store.setBuffers(new Map([[target.name, buffer]])); await store.generateScene({})
      if (version !== fileVersion.current || !alive.current) return
      const current = useStore.getState()
      if (!current.scene) throw new Error('This STL could not be previewed. You can still send it, or send a model link for help.')
      setScene(current.scene); setMetrics(current.geometryMetrics)
      setFileNote('Preview only. STL has no declared units; FIT will confirm scale, printability and permissions.')
    } catch (problem) { if (version === fileVersion.current && alive.current) setError(problem.message) }
    finally { if (version === fileVersion.current && alive.current) setPreviewing(false) }
  }
  // What is actually sent: in design-help mode the file and link are left out and the size is "help me choose".
  const effective = mode === 'help' ? { ...brief, sourceUrl: '', sizeMode: 'help', size: '' } : brief
  const needs = quoteRequirements({ mode, purpose: brief.purpose, link: brief.sourceUrl, hasFile: Boolean(file), quantity: brief.quantity, sizeMode: brief.sizeMode, size: brief.size })
  async function submit(event) {
    event.preventDefault()
    if (!user || sending.current) return
    const checked = validateGuidedBrief(pending?.brief || effective)
    if (checked.error) { setError(checked.error); return }
    if (!pending && !needs.ready) { setError('Before sending, ' + needs.missing.join(', ') + '.'); return }
    const owner = uid
    const current = () => alive.current && ownerRef.current === owner
    sending.current = true; setBusy(true); setError('')
    try {
      let body = pending
      if (!body) {
        const sendFile = mode !== 'help' ? file : null
        if (sendFile && storage !== 'ready') throw new Error('Private uploads are unavailable. Remove the file and send a link or description instead.')
        if (sendFile && attached.current?.userId !== owner) {
          const form = new FormData(); form.append('file', sendFile)
          const response = await fetch('/api/fabrication/assets', { method: 'POST', body: form })
          const data = await json(response)
          if (!current()) return                                                    // account changed mid-upload: do NOT go on to submit
          if (!response.ok || !data.assetId) throw new Error(data.error || 'Upload could not be confirmed. Your enquiry has not been submitted.')
          attached.current = { userId: owner, assetId: data.assetId }
        }
        clientId.current ||= crypto.randomUUID()
        body = { clientRequestId: clientId.current, brief: checked.value, assetId: sendFile && attached.current?.userId === owner ? attached.current.assetId : null }
        setPending({ ...body, userId: owner })
        writeDraft({ owner, mode, brief, clientRequestId: clientId.current, pending: { ...body, userId: owner } })      // server idempotency still applies
      }
      if (body.userId && body.userId !== owner) throw new Error('Sign back in to the account that submitted this enquiry to retry it.')
      const response = await fetch('/api/custom-print/guided', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await json(response)
      if (!current()) return
      if (!response.ok || !data.requestId) throw new Error(data.error || 'The result could not be confirmed. Retry the same enquiry; it will not create a duplicate.')
      setResult(data); dropDraft()
    } catch (problem) { if (current()) setError(problem.message) }
    finally { if (current()) { sending.current = false; setBusy(false) } }
  }
  const checked = validateGuidedBrief(pending?.brief || effective)
  const canSend = pending ? !checked.error : !checked.error && needs.ready
  const previewColour = colours.find(item => item.name === brief.colour && item.filament === brief.material)?.hex || '#9ca3af'
  if (result) return <main className="mx-auto max-w-2xl px-4 py-12"><h1 className="text-3xl font-semibold">Your print enquiry is saved</h1><p className="my-4">We’ll review the model and confirm printability, size, material and quantity before quoting. This is not an order or payment.</p><p className="break-all text-sm">Reference: {result.requestId}</p><Link className="mt-5 inline-block underline" href="/account/prints">View your print requests</Link></main>
  return <main className="min-h-screen bg-slate-50 px-4 py-4 text-slate-900 sm:px-8 sm:py-8"><div className="mx-auto max-w-6xl">
    <h1 className="text-2xl font-semibold sm:text-4xl">Get something printed</h1>
    <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Add a model file or link, say how many and how big. Our team reviews it and sends a quote.</p>
    <form onSubmit={submit} className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <fieldset disabled={busy || !!pending} className="min-w-0 space-y-4">
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <h2 className="mb-3 text-lg font-semibold">What would you like printed?</h2>
          <label className="block text-sm font-medium">Describe what you need<input className={field} maxLength={300} value={brief.purpose} onChange={e => patch({ purpose: e.target.value })} placeholder="A holder for my desk cables" autoFocus /></label>
          <fieldset className="mt-4 grid gap-2 sm:grid-cols-2"><legend className="sr-only">Type of request</legend>
            {[['model', 'I have a model or a link'], ['help', 'I need help finding or making a model']].map(([value, label]) => <label key={value} className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm focus-within:ring-2 focus-within:ring-slate-900 ${mode === value ? 'border-slate-900 bg-slate-50 font-medium' : 'border-slate-300'}`}><input type="radio" name="request-type" value={value} checked={mode === value} onChange={() => setMode(value)} />{label}</label>)}
          </fieldset>
          {mode === 'model' ? <>
            <ModelDrop file={file} fileCheck={fileCheck} checking={checking} fileError={fileError} canPreview={Boolean(file && /\.stl$/i.test(file.name))} previewing={previewing} previewed={Boolean(scene)} link={brief.sourceUrl} onLink={value => patch({ sourceUrl: value })} onFile={chooseFile} onRemoveFile={() => chooseFile(null)} onPreview={previewFile} storage={storage} disabled={busy || !!pending} />
            {scene && <div className="mt-4 h-[320px] overflow-hidden rounded-lg border sm:h-[420px]"><Viewer scene={scene} fileName={file?.name} meshColors={{ default: previewColour }} controlsPlacement="above" autoRotate /></div>}
            {metrics?.dimensionsCm && <p className="mt-2 text-sm">Preview at assumed mm units: {['length','width','height'].map(axis => (metrics.dimensionsCm[axis] * 10).toFixed(1)).join(' × ')} mm.</p>}
            {fileNote && !fileCheck?.ok && <p className="mt-2 text-sm text-slate-600">{fileNote}</p>}
          </> : <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm" data-testid="help-note">A person will suggest a model or help design one. This is a design-help request, not a print quote: quoting starts once there is a model, with its size and quantity.</p>}
          <div className={`mt-4 grid gap-3 ${mode === 'model' ? 'sm:grid-cols-2' : ''}`}>
            <label className="block text-sm font-medium">Number of copies<input type="number" min="1" max="1000" step="1" className={field} value={brief.quantity} onChange={e => patch({ quantity: Number(e.target.value) })} /></label>
            {mode === 'model' && <label className="block text-sm font-medium">How large should it be?<select className={field} value={brief.sizeMode} onChange={e => patch({ sizeMode: e.target.value })}><option value="original">Original size (we confirm the units)</option><option value="longest">Set the longest side</option></select></label>}
          </div>
          {mode === 'model' && brief.sizeMode === 'longest' && <><div className="mt-3 grid grid-cols-[minmax(0,1fr)_100px] gap-3"><label className="text-sm">Longest side<input type="number" min="0.01" step="any" className={field} value={brief.size} onChange={e => patch({ size: e.target.value })} /></label><label className="text-sm">Units<select className={field} value={brief.unit} onChange={e => patch({ unit: e.target.value })}><option value="mm">mm</option><option value="cm">cm</option><option value="in">inches</option></select></label></div><p className="mt-3 text-xs text-slate-600">For comparison: 10 mm = 1 cm; 100 mm = 10 cm. This records your desired size; it does not rescale the model or calculate a price.</p><div aria-label="100 millimetre scale reference, illustrative not actual size" className="mt-3 flex h-7 justify-between border-b-2 border-slate-700 text-xs"><span>0</span><span>50 mm</span><span>100 mm</span></div></>}
        </section>
        <details className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6"><summary className="min-h-[44px] cursor-pointer py-2 text-sm font-semibold">More options: material, colour, category and notes (all optional)</summary>
          <div className="mt-3 space-y-4">
            <label className="block text-sm font-medium">Category<select className={field} value={brief.category} onChange={e => patch({ category: e.target.value })}>{GUIDED_CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></label>
          <label className="block text-sm font-medium">Material preference<select className={field} value={brief.material} onChange={e => patch({ material: e.target.value, colour: 'Help me choose' })}><option value="help">Help me choose</option><option value="pla">PLA — everyday models and display pieces</option><option value="petg">PETG — ask about tougher functional parts</option><option value="abs">ABS — discuss heat and finish needs</option><option value="tpu">TPU — flexible parts</option><option value="other">A different material — describe it in remarks</option></select></label>
          <p className="mt-2 text-xs text-slate-600">Tell us about heat, outdoor use, loads or fit. The material choice and availability need confirmation.</p>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Colour preferences">{colours.filter(item => item.filament === brief.material).map(item => <button key={item.name} type="button" aria-pressed={brief.colour === item.name} className="flex items-center gap-2 rounded-full border px-3 py-2 text-xs" onClick={() => patch({ colour: item.name })}><span className="h-4 w-4 rounded-full border" style={{ backgroundColor: /^#[0-9a-f]{6}$/i.test(item.hex) ? item.hex : '#eee' }} />{item.name}{item.stockStatus === 'out_of_stock' ? ' · unavailable now' : item.stockStatus === 'in_stock' ? '' : ' · stock unconfirmed'}</button>)}</div>
          <label className="mt-4 block text-sm font-medium">Preferred colour<input className={field} maxLength={100} value={brief.colour} onChange={e => patch({ colour: e.target.value })} /></label>
          <p className="mt-2 text-xs text-slate-600">Screen colours are approximate. You can enter a preference even when no stock has been confirmed.</p>
          <details><summary className="cursor-pointer text-sm">Design source details (optional)</summary><label className="mt-3 block text-sm font-medium">What do you know about the design permissions?<select className={field} value={brief.rights} onChange={e => patch({ rights: e.target.value })}><option value="unknown">I am not sure — please check</option><option value="own">I created the design</option><option value="permission">I have permission for paid printing</option><option value="noncommercial">I saw a noncommercial or personal-use restriction</option></select></label>
          <p className="mt-2 text-sm text-slate-600">You can leave this as “I am not sure”. We will review the model and confirm printability before quoting.</p>
          <label className="mt-4 block text-sm font-medium">Licence link or permission details (optional)<textarea rows={2} maxLength={1000} className={field} value={brief.permissionNote} onChange={e => patch({ permissionNote: e.target.value })} /></label></details>
          <label className="mt-4 block text-sm font-medium">Remarks (optional)<textarea rows={3} maxLength={1000} className={field} value={brief.notes} onChange={e => patch({ notes: e.target.value })} placeholder="Fit, finish, deadline, collection or delivery preference…" /></label>
            <label className="mt-3 block text-sm font-medium">Category<select className={field} value={brief.category} onChange={e => patch({ category: e.target.value })}>{GUIDED_CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></label>
            <Link className="mt-4 inline-block text-sm underline" target="_blank" rel="noopener noreferrer" href={`/prints?search=${encodeURIComponent(brief.purpose)}`}>Search the FIT print catalogue</Link>
            <p className="mt-2 text-xs text-slate-600">Search uses the words in your description. No match? Keep going and ask us to help find or design a part.</p>
          <div className="mt-4"><p className="text-sm font-medium">Browse model websites</p><p className="my-3 text-sm">Open a site, search there, then paste the design link below. A free download does not establish permission for a paid printing service.</p><div className="flex flex-wrap gap-4 text-sm underline">{[['MakerWorld', 'https://makerworld.com/'], ['Printables', 'https://www.printables.com/']].map(([name,url]) => <a key={name} href={url} target="_blank" rel="noopener noreferrer">Open {name}</a>)}</div></div>
          </div>
        </details>
      </fieldset>
      <aside aria-label="Review your enquiry" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5 lg:sticky lg:top-5"><h2 className="text-lg font-semibold">Review your enquiry</h2><dl className="mt-3 space-y-2 text-sm">{guidedSummary(checked.value).filter(([label]) => !['Design permissions', 'Permission details'].includes(label)).map(([label,value]) => <div key={label}><dt className="font-medium">{label}</dt><dd className="break-words text-slate-600">{value}</dd></div>)}</dl>
      <p className="my-4 text-sm text-slate-600" data-testid="review-note">Our team checks the exact model, its licence and whether it can be printed before any quote. A public link or a ticked box is not permission to print it for sale. This is a request for review, not an order, a price or a print start.</p>
      {error && <p role="alert" className="mb-4 break-words text-sm text-red-700">{error}</p>}
      {pending && <p role="status" className="mb-4 text-sm">Your submitted brief is held unchanged so retrying is safe.</p>}
      {!pending && !needs.ready && <p role="status" id="send-needs" className="mb-3 text-sm text-slate-700" data-testid="send-needs">To send: {needs.missing.join('; ')}.</p>}
      {user ? <button className={button + ' min-h-[44px]'} type="submit" disabled={busy || !isLoaded || !canSend} aria-describedby={!pending && !needs.ready ? 'send-needs' : undefined}>{busy ? 'Saving…' : pending ? 'Retry the same enquiry' : 'Send enquiry for a quote'}</button> : <SignInButton mode="modal"><button className={button + ' min-h-[44px]'} type="button" disabled={!isLoaded}>Sign in to send your enquiry</button></SignInButton>}
      {!user && <p className="mt-3 text-xs text-slate-600">Your choices are kept in this tab for sign-in. Select any file again if the page reloads.</p>}
      <Link href="/prints/request?mode=advanced" className="mt-4 inline-flex min-h-[44px] items-center text-sm underline">Know your exact print settings? Use the detailed print flow</Link>
      </aside>
    </form>
  </div></main>
}
