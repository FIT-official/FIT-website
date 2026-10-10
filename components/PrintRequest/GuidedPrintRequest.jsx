'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { SignInButton, useUser } from '@clerk/nextjs'
import useStore from '@/utils/store'
import { GUIDED_START, GUIDED_CATEGORIES, GUIDED_FILE_BYTES, validateGuidedBrief, guidedSummary } from '@/lib/customPrint/guidedBrief'
const Viewer = dynamic(() => import('@/components/Editor/viewer'), { ssr: false, loading: () => <p>Preparing preview…</p> })
const field = 'mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base'
const button = 'rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50'
const draftKey = 'fit.guided-print.v1'
const json = async response => { try { return await response.json() } catch { return {} } }
function Step({ number, title, children }) { return <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="mb-4 text-lg font-semibold"><span className="mr-2 text-slate-500">{number}.</span>{title}</h2>{children}</section> }

export default function GuidedPrintRequest() {
  const { user, isLoaded } = useUser()
  const [brief, setBrief] = useState({ ...GUIDED_START })
  const [loaded, setLoaded] = useState(false)
  const [storage, setStorage] = useState('loading')
  const [colours, setColours] = useState([])
  const [file, setFile] = useState(null)
  const [scene, setScene] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [fileNote, setFileNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState(null)
  const [result, setResult] = useState(null)
  const fileVersion = useRef(0)
  const attached = useRef(null)
  const clientId = useRef(null)
  const sending = useRef(false)
  const patch = value => setBrief(current => ({ ...current, ...value }))
  useEffect(() => {
    try { const draft = JSON.parse(sessionStorage.getItem(draftKey) || 'null'); if (draft?.brief) setBrief({ ...GUIDED_START, ...draft.brief }); clientId.current = draft?.clientRequestId || null; if (draft?.pending) setPending(draft.pending) } catch { /* optional local draft */ }
    setLoaded(true)
    const controller = new AbortController()
    fetch('/api/custom-print/guided', { signal: controller.signal }).then(json).then(data => setStorage(data.uploadsAvailable ? 'ready' : 'unavailable')).catch(() => { if (!controller.signal.aborted) setStorage('unavailable') })
    fetch('/api/filament-availability', { signal: controller.signal }).then(json).then(data => setColours(Array.isArray(data.colours) ? data.colours : [])).catch(() => {})
    return () => controller.abort()
  }, [])
  useEffect(() => { if (loaded && !result) { try { sessionStorage.setItem(draftKey, JSON.stringify({ brief, clientRequestId: clientId.current, pending })) } catch { /* optional local draft */ } } }, [brief, loaded, result, pending])
  async function chooseFile(next) {
    const version = ++fileVersion.current
    setFile(null); setScene(null); setMetrics(null); attached.current = null; setFileNote(''); setError('')
    if (!next) return
    if (!/\.(stl|obj|3mf)$/i.test(next.name) || !next.size || next.size > GUIDED_FILE_BYTES) { setError('Choose an STL, OBJ or 3MF file between 1 byte and 3 MB. STEP and G-code are not supported here.'); return }
    setFile(next)
    if (!/\.stl$/i.test(next.name)) { setFileNote('This file will be checked on upload. The guided preview currently supports STL only.'); return }
    setBusy(true)
    try {
      const buffer = await next.arrayBuffer()
      if (version !== fileVersion.current) return
      const store = useStore.getState(); store.setFileName(next.name); store.setBuffers(new Map([[next.name, buffer]])); await store.generateScene({})
      if (version !== fileVersion.current) return
      const current = useStore.getState()
      if (!current.scene) throw new Error('This STL could not be previewed. Re-export it or send a model link for help.')
      setScene(current.scene); setMetrics(current.geometryMetrics)
      setFileNote('Preview only. STL has no declared units; FIT will confirm scale, printability and permissions.')
    } catch (problem) { if (version === fileVersion.current) { setFile(null); setError(problem.message) } }
    finally { if (version === fileVersion.current) setBusy(false) }
  }
  async function submit(event) {
    event.preventDefault()
    if (!user || sending.current) return
    const checked = validateGuidedBrief(pending?.brief || brief)
    if (checked.error) { setError(checked.error); return }
    sending.current = true; setBusy(true); setError('')
    try {
      let body = pending
      if (!body) {
        if (file && storage !== 'ready') throw new Error('Private uploads are unavailable. Remove the file and send a link or description instead.')
        if (file && attached.current?.userId !== user.id) {
          const form = new FormData(); form.append('file', file)
          const response = await fetch('/api/fabrication/assets', { method: 'POST', body: form })
          const data = await json(response)
          if (!response.ok || !data.assetId) throw new Error(data.error || 'Upload could not be confirmed. Your enquiry has not been submitted.')
          attached.current = { userId: user.id, assetId: data.assetId }
        }
        clientId.current ||= crypto.randomUUID()
        body = { clientRequestId: clientId.current, brief: checked.value, assetId: attached.current?.userId === user.id ? attached.current.assetId : null }
        setPending({ ...body, userId: user.id })
        try { sessionStorage.setItem(draftKey, JSON.stringify({ brief, clientRequestId: clientId.current, pending: { ...body, userId: user.id } })) } catch { /* server idempotency still applies */ }
      }
      if (body.userId && body.userId !== user.id) throw new Error('Sign back in to the account that submitted this enquiry to retry it.')
      const response = await fetch('/api/custom-print/guided', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await json(response)
      if (!response.ok || !data.requestId) throw new Error(data.error || 'The result could not be confirmed. Retry the same enquiry; it will not create a duplicate.')
      setResult(data); try { sessionStorage.removeItem(draftKey) } catch { /* optional */ }
    } catch (problem) { setError(problem.message) }
    finally { sending.current = false; setBusy(false) }
  }
  const checked = validateGuidedBrief(pending?.brief || brief)
  const previewColour = colours.find(item => item.name === brief.colour && item.filament === brief.material)?.hex || '#9ca3af'
  if (result) return <main className="mx-auto max-w-2xl px-4 py-12"><h1 className="text-3xl font-semibold">Your print enquiry is saved</h1><p className="my-4">We’ll review the model and confirm printability, size, material and quantity before quoting. This is not an order or payment.</p><p className="break-all text-sm">Reference: {result.requestId}</p><Link className="mt-5 inline-block underline" href="/account/prints">View your print requests</Link></main>
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-8"><div className="mx-auto max-w-6xl">
    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Fix It Today · 3D printing</p>
    <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Get something printed</h1>
    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Tell us what you need. Find a model or ask for help, choose your preferences, then send an enquiry for a quote.</p>
    <Link href="/prints/request?mode=advanced" className="my-5 inline-block text-sm underline">Already have a model and know your print settings? Open the existing print flow</Link>
    <form onSubmit={submit} className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <fieldset disabled={busy || !!pending} className="min-w-0 space-y-4">
        <Step number={1} title="What would you like made?">
          <label className="block text-sm font-medium">Describe what you need<input className={field} maxLength={300} value={brief.purpose} onChange={e => patch({ purpose: e.target.value })} placeholder="A holder for my desk cables" /></label>
          <label className="mt-4 block text-sm font-medium">Category<select className={field} value={brief.category} onChange={e => patch({ category: e.target.value })}>{GUIDED_CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></label>
          <Link className="mt-4 inline-block text-sm underline" target="_blank" rel="noopener noreferrer" href={`/prints?search=${encodeURIComponent(brief.purpose)}`}>Search the FIT print catalogue</Link>
          <p className="mt-2 text-xs text-slate-600">Search uses the words in your description. No match? Keep going and ask us to help find or design a part.</p>
          <details className="mt-4 rounded-lg bg-slate-50 p-3"><summary className="cursor-pointer text-sm font-medium">Browse model websites</summary><p className="my-3 text-sm">Open a site, search there, then paste the design link below. A free download does not establish permission for a paid printing service.</p><div className="flex flex-wrap gap-4 text-sm underline">{[['MakerWorld', 'https://makerworld.com/'], ['Printables', 'https://www.printables.com/']].map(([name,url]) => <a key={name} href={url} target="_blank" rel="noopener noreferrer">Open {name}</a>)}</div></details>
        </Step>
        <Step number={2} title="A model, a link, or help finding one">
          <label className="block text-sm font-medium">Model reference link (optional)<input type="url" className={field} maxLength={2048} value={brief.sourceUrl} onChange={e => patch({ sourceUrl: e.target.value })} placeholder="https://…" /></label>
          <p className="mt-2 text-xs text-slate-600">A reference for staff to review. FIT does not download or embed the linked website.</p>
          <label className="mt-4 block text-sm font-medium">Attach a model (optional)<input type="file" className={field} accept=".stl,.obj,.3mf" onChange={e => { chooseFile(e.target.files?.[0]); e.target.value = '' }} /></label>
          <p className="mt-2 text-xs text-slate-600">STL, OBJ or 3MF · up to 3 MB in this enquiry. STEP and G-code are not supported here. Files are uploaded only when you send the enquiry.</p>
          {storage !== 'ready' && <p role="status" className="mt-3 text-sm text-amber-900">{storage === 'loading' ? 'Checking private uploads…' : 'Private uploads are unavailable. You can still send a link or description.'}</p>}
          {file && <div className="mt-3 text-sm"><span className="break-all">{file.name}</span> <button type="button" className="underline" onClick={() => chooseFile(null)}>Remove file</button></div>}
          {scene && <div className="mt-4 h-[420px] overflow-hidden rounded-lg border"><Viewer scene={scene} fileName={file?.name} meshColors={{ default: previewColour }} controlsPlacement="above" autoRotate /></div>}
          {metrics?.dimensionsCm && <p className="mt-2 text-sm">Preview at assumed mm units: {['length','width','height'].map(axis => (metrics.dimensionsCm[axis] * 10).toFixed(1)).join(' × ')} mm.</p>}
          {fileNote && <p className="mt-2 text-sm text-slate-600">{fileNote}</p>}
        </Step>
        <Step number={3} title="Size and quantity">
          <label className="block text-sm font-medium">How large should it be?<select className={field} value={brief.sizeMode} onChange={e => patch({ sizeMode: e.target.value })}><option value="help">Help me choose a size</option><option value="original">Use the file size, after checking units</option><option value="longest">Specify the longest side</option></select></label>
          {brief.sizeMode === 'longest' && <><div className="mt-3 grid grid-cols-[minmax(0,1fr)_100px] gap-3"><label className="text-sm">Longest side<input type="number" min="0.01" step="any" className={field} value={brief.size} onChange={e => patch({ size: e.target.value })} /></label><label className="text-sm">Units<select className={field} value={brief.unit} onChange={e => patch({ unit: e.target.value })}><option value="mm">mm</option><option value="cm">cm</option><option value="in">inches</option></select></label></div><p className="mt-3 text-xs text-slate-600">For comparison: 10 mm = 1 cm; 100 mm = 10 cm. This records your desired size; it does not rescale the model or calculate a price.</p><div aria-label="100 millimetre scale reference, illustrative not actual size" className="mt-3 flex h-7 justify-between border-b-2 border-slate-700 text-xs"><span>0</span><span>50 mm</span><span>100 mm</span></div></>}
          <label className="mt-4 block text-sm font-medium">Number of copies<input type="number" min="1" max="1000" step="1" className={field} value={brief.quantity} onChange={e => patch({ quantity: Number(e.target.value) })} /></label>
          <p className="mt-2 text-xs text-slate-600">FIT will check dimensions, strength and printer fit before confirming a quote for all copies.</p>
        </Step>
        <Step number={4} title="Material and colour">
          <label className="block text-sm font-medium">Material preference<select className={field} value={brief.material} onChange={e => patch({ material: e.target.value, colour: 'Help me choose' })}><option value="help">Help me choose</option><option value="pla">PLA — everyday models and display pieces</option><option value="petg">PETG — ask about tougher functional parts</option><option value="abs">ABS — discuss heat and finish needs</option><option value="tpu">TPU — flexible parts</option><option value="other">A different material — describe it in remarks</option></select></label>
          <p className="mt-2 text-xs text-slate-600">Tell us about heat, outdoor use, loads or fit. The material choice and availability need confirmation.</p>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Colour preferences">{colours.filter(item => item.filament === brief.material).map(item => <button key={item.name} type="button" aria-pressed={brief.colour === item.name} className="flex items-center gap-2 rounded-full border px-3 py-2 text-xs" onClick={() => patch({ colour: item.name })}><span className="h-4 w-4 rounded-full border" style={{ backgroundColor: /^#[0-9a-f]{6}$/i.test(item.hex) ? item.hex : '#eee' }} />{item.name}{item.stockStatus === 'out_of_stock' ? ' · unavailable now' : item.stockStatus === 'in_stock' ? '' : ' · stock unconfirmed'}</button>)}</div>
          <label className="mt-4 block text-sm font-medium">Preferred colour<input className={field} maxLength={100} value={brief.colour} onChange={e => patch({ colour: e.target.value })} /></label>
          <p className="mt-2 text-xs text-slate-600">Screen colours are approximate. You can enter a preference even when no stock has been confirmed.</p>
        </Step>
        <Step number={5} title="Anything else we should know?">
          <details><summary className="cursor-pointer text-sm">Design source details (optional)</summary><label className="mt-3 block text-sm font-medium">What do you know about the design permissions?<select className={field} value={brief.rights} onChange={e => patch({ rights: e.target.value })}><option value="unknown">I am not sure — please check</option><option value="own">I created the design</option><option value="permission">I have permission for paid printing</option><option value="noncommercial">I saw a noncommercial or personal-use restriction</option></select></label>
          <p className="mt-2 text-sm text-slate-600">You can leave this as “I am not sure”. We will review the model and confirm printability before quoting.</p>
          <label className="mt-4 block text-sm font-medium">Licence link or permission details (optional)<textarea rows={2} maxLength={1000} className={field} value={brief.permissionNote} onChange={e => patch({ permissionNote: e.target.value })} /></label></details>
          <label className="mt-4 block text-sm font-medium">Remarks (optional)<textarea rows={3} maxLength={1000} className={field} value={brief.notes} onChange={e => patch({ notes: e.target.value })} placeholder="Fit, finish, deadline, collection or delivery preference…" /></label>
        </Step>
      </fieldset>
      <aside aria-label="Review your enquiry" className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 lg:sticky lg:top-5"><h2 className="text-lg font-semibold">Review your enquiry</h2><dl className="mt-4 space-y-3 text-sm">{guidedSummary(checked.value).filter(([label]) => !['Design permissions', 'Permission details'].includes(label)).map(([label,value]) => <div key={label}><dt className="font-medium">{label}</dt><dd className="break-words text-slate-600">{value}</dd></div>)}</dl><p className="my-5 text-sm text-slate-600">We’ll review the model and confirm printability before quoting. Price and shipping will be confirmed with the quote. Sending this enquiry does not place an order.</p>
      {error && <p role="alert" className="mb-4 break-words text-sm text-red-700">{error}</p>}
      {pending && <p role="status" className="mb-4 text-sm">Your submitted brief is held unchanged so retrying is safe.</p>}
      {user ? <button className={button} type="submit" disabled={busy || !isLoaded || !!checked.error}>{busy ? 'Saving…' : pending ? 'Retry the same enquiry' : 'Send enquiry for a quote'}</button> : <SignInButton mode="modal"><button className={button} type="button" disabled={!isLoaded}>Sign in to send your enquiry</button></SignInButton>}
      {!user && <p className="mt-3 text-xs text-slate-600">Your choices are kept in this tab for sign-in. Select any file again if the page reloads.</p>}
      </aside>
    </form>
  </div></main>
}
