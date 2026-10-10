'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import FilamentColourPreview from './FilamentColourPreview'
import { bulkEmailCopy } from '@/lib/bulkEmailCopy'
import { BAMBU_PRICE_NOTICE, bulkListUnitCents, BULK_BANDS, BULK_LADDERS, BULK_PRICE_NOTICE, BULK_CONSENT, bulkTier, priceBulkLines } from '@/lib/bulkFilamentConfig'
import { filamentOptionLabel } from '@/lib/filamentLabels'
import { useInventoryRefresh } from '@/utils/useInventoryRefresh'
import { bulkSelectionStock, bulkSelectionLimit, BULK_EXTRA_REQUEST_ROLLS } from '@/lib/bulkFilamentSelection'
const STORAGE_KEY = 'fit-bulk-filament-pending-v2'
const inputClass = 'w-full min-w-0 min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-950 focus:outline-2 focus:outline-offset-2 focus:outline-emerald-700 disabled:bg-slate-100'
const buttonClass = 'min-h-11 rounded-xl bg-emerald-800 px-5 py-3 font-medium text-white disabled:opacity-50'
const money = price => price ? new Intl.NumberFormat('en-SG', { style: 'currency', currency: price.currency }).format(price.amount) : 'Owner quotation'
function ColourOptions({ product, type }) {
  const option = o => <option key={o.id} value={o.id}>{o.name} — {o.stock == null ? 'stock unverified' : o.stock === 0 ? 'Unavailable (0 recorded remaining)' : o.stock + ' recorded remaining'}</option>
  if (product.brand !== 'Lanbo' || product.material !== 'PLA' || type.id !== product.colourTypeId) return type.options.map(option)
  return ['PLA', 'SPECIALTY_PLA'].map(ladder => {
    const colours = type.options.filter(o => o.ladder === ladder)
    return colours.length > 0 && <optgroup key={ladder} label={'Lanbo ' + BULK_LADDERS[ladder].label}>{colours.map(option)}</optgroup>
  })
}
function selection(product, options) {
  const selected = product?.types.map(t => t.options.find(o => o.id === options[t.id])) || []
  const ladder = selected.find(o => o?.ladder)?.ladder
  return { stock: bulkSelectionStock(product, options), limit: bulkSelectionLimit(product, options), ladder, listUnitCents: bulkListUnitCents(product, options), colour: selected.find(o => product?.types.find(t => t.id === product.colourTypeId)?.options.includes(o)) }
}
export default function BulkFilamentForm() {
  const [catalogue, setCatalogue] = useState([]), [checkedAt, setCheckedAt] = useState(''), [stockSource, setStockSource] = useState('')
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [productId, setProductId] = useState(''), [options, setOptions] = useState({})
  const [lines, setLines] = useState([]), [pending, setPending] = useState(null), [receipt, setReceipt] = useState(null)
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '', organisation: '' })
  const [fulfilment, setFulfilment] = useState('collection'), [address, setAddress] = useState(''), [notes, setNotes] = useState('')
  const [consent, setConsent] = useState(false)
  const [confirmReview, setConfirmReview] = useState(false), [clientRequestId, setClientRequestId] = useState('')
  const chooser = useRef(null), initialChoice = useRef(false), inventoryFetch = useRef(false)
  useInventoryRefresh(loadCatalogue, !busy && !pending && !receipt)
  const product = catalogue.find(p => p.id === productId), chosen = selection(product, options)
  async function loadCatalogue() {
    if (inventoryFetch.current) return
    inventoryFetch.current = true
    setLoading(true)
    try {
      const response = await fetch('/api/bulk-filament/catalogue', { cache: 'no-store' }), data = await response.json()
      if (!response.ok) throw Error(data.error || 'Inventory is unavailable.')
      setCatalogue(data.products); setCheckedAt(data.checkedAt); setStockSource(data.stockSource)
      if (!initialChoice.current && data.products.length) {
        initialChoice.current = true
        const first = data.products[0]
        setProductId(first.id); setOptions(Object.fromEntries(first.types.map(t => [t.id, t.options[0].id])))
      }
    } catch (e) { setError(e.message || 'Inventory is unavailable. Please retry.') }
    finally { inventoryFetch.current = false; setLoading(false) }
  }
  useEffect(() => {
    setClientRequestId(crypto.randomUUID())
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null')
      if (saved?.receipt) setReceipt(saved.receipt)
      else if (saved?.input) {
        const value = saved.input
        setPending(value); setLines(value.lines); setCustomer(value.customer); setFulfilment(value.fulfilment)
        setAddress(value.address); setNotes(value.notes); setConfirmReview(value.confirmReview); setConsent(value.consent === true); setClientRequestId(value.clientRequestId)
      }
    } catch { /* An unavailable browser store does not block the form. */ }
    loadCatalogue()
  }, [])
  function remember(value) { try { if (value) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value)); else sessionStorage.removeItem(STORAGE_KEY) } catch { /* Keep the in-memory retry reference. */ } }
  function chooseProduct(id) {
    const p = catalogue.find(p => p.id === id)
    setProductId(id); setOptions(Object.fromEntries((p?.types || []).map(t => [t.id, t.options[0].id])))
  }
  function addLine() {
    if (!product || !chosen.limit) return
    const selected = product.types.map(t => ({ typeId: t.id, optionId: options[t.id] }))
    if (lines.some(l => l.productId === product.id && selected.every(o => l.options.some(s => s.typeId === o.typeId && s.optionId === o.optionId)))) {
      setError('That selection is already in your request. Edit its quantities below.'); return
    }
    if (lines.length >= 50) { setError('Use up to 50 lines per request.'); return }
    setLines([...lines, { productId: product.id, version: product.version, options: selected, quantity: 1, remarks: '' }]); setError('')
  }
  function anotherColour() {
    const first = catalogue[0]
    if (first) {
      chooseProduct(first.id)
      const colour = first.types.find(t => t.id === first.colourTypeId)
      const next = colour?.options.find(o => !lines.some(l => l.productId === first.id && l.options.some(s => s.typeId === colour.id && s.optionId === o.id)))
      if (next) setOptions(Object.fromEntries(first.types.map(t => [t.id, t.id === colour.id ? next.id : t.options[0].id])))
    }
    chooser.current?.focus(); chooser.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  }
  function editLine(index, key, value) { setLines(lines.map((line,i) => i === index ? { ...line, [key]: value } : line)) }
  async function refresh() {
    setError('')
    // Keep quantities and old versions until the customer explicitly accepts the refreshed snapshot.
    await loadCatalogue()
  }
  function acceptInventory() {
    setLines(lines.map(l => ({ ...l, version: catalogue.find(p => p.id === l.productId)?.version || l.version })))
    setConfirmReview(false); setError('')
  }
  const pricedInputs = lines.map(line => {
    const info = selection(catalogue.find(p => p.id === line.productId), Object.fromEntries(line.options.map(o => [o.typeId, o.optionId])))
    return { ...line, ladder: info.ladder, listUnitCents: info.listUnitCents }
  })
  function lineStock(line, index) {
    const p = catalogue.find(p => p.id === line.productId)
    return bulkSelectionLimit(p, Object.fromEntries(line.options.map(o => [o.typeId, o.optionId])), lines, index)
  }
  const quantityErrors = lines.map((line, index) => {
    const maximum = lineStock(line, index)
    return !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > maximum ? `Choose 1 to ${maximum} rolls for this colour and spool selection.` : ''
  })
  // Invalid quantities must not contribute to either the pooled band or a quote.
  const prices = !quantityErrors.some(Boolean) && pricedInputs.every(l => l.ladder) ? priceBulkLines(pricedInputs) : []
  const stale = lines.some(l => catalogue.find(p => p.id === l.productId)?.version !== l.version)
  async function submit(event) {
    event.preventDefault(); setError('')
    if (!pending && quantityErrors.some(Boolean)) { setError(quantityErrors.find(Boolean)); return }
    setBusy(true)
    const input = pending || { clientRequestId, customer, fulfilment, address, notes, lines, confirmReview, consent }
    setPending(input); remember({ input })
    try {
      const response = await fetch('/api/bulk-filament/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
      const data = await response.json()
      if (!response.ok) {
        if ([400,403,409,413,415].includes(response.status)) {
          setPending(null); remember(null)
          if (data.code === 'idempotency_conflict') setClientRequestId(crypto.randomUUID())
        }
        if (data.code === 'inventory_changed') await loadCatalogue()
        throw Error(data.error || 'We could not confirm your request. Retry with the same reference.')
      }
      setReceipt(data); setPending(null); remember({ receipt: data })
    } catch (e) { setError(e.message || 'Connection interrupted. Retry to check the same request; do not start another submission.') }
    finally { setBusy(false) }
  }
  if (receipt) return <main className="mx-auto max-w-3xl px-5 py-14">
    <Link href="/shop" className="text-sm underline">Back to shop</Link>
    <div className="mt-7 rounded-3xl border border-emerald-200 bg-emerald-50 p-7 sm:p-10" role="status">
      <p className="text-sm font-semibold uppercase tracking-widest text-emerald-800">Request received</p>
      <h1 className="mt-3">Your filament request is with FIT</h1>
      <p className="mt-4">The owner can now review it in the dashboard. Availability, the final quotation and collection or delivery arrangements need confirmation.</p>
      <p className="mt-4 font-medium">{receipt.totalRolls} rolls requested</p>
      <p className="mt-4">No stock has been reserved and no payment has been taken. This is not a confirmed order.</p>
      <p className="mt-5 text-sm">Save your request reference:</p><p className="mt-1 break-all font-mono text-sm">{receipt.requestId}</p>
      <p className="mt-4 text-sm text-slate-600">{bulkEmailCopy(receipt.ownerEmailStatus)} This page is your receipt. No automatic email is sent to you. FIT will contact you after review.</p>
    </div>
    <button className={buttonClass + ' mt-6'} onClick={() => { remember(null); setReceipt(null); setLines([]); setConfirmReview(false); setConsent(false); setClientRequestId(crypto.randomUUID()) }}>Start another request</button>
  </main>
  return <main className="mx-auto w-full min-w-0 max-w-6xl px-3 py-6 sm:px-8 sm:py-10">
    <Link href="/shop" className="text-sm underline">← Back to shop</Link>
    <div className="mt-4 rounded-2xl bg-slate-950 px-4 py-5 text-white sm:mt-6 sm:rounded-3xl sm:px-10 sm:py-8">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Filament for your next project</p>
      <h1 className="mt-2 text-2xl! leading-tight! text-white! sm:mt-3 sm:text-4xl!">Bulk filament enquiry</h1>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-200 sm:mt-4 sm:text-base">Choose several colours and set the quantity of each. Availability and your final quotation will be confirmed by FIT.</p>
      <div className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
        <p className="rounded-xl bg-white/10 px-3 py-2 sm:p-4"><strong className="block text-white">1. Choose your colours</strong>Add as many colours as your project needs.</p>
        <p className="rounded-xl bg-white/10 px-3 py-2 sm:p-4"><strong className="block text-white">2. Send an enquiry</strong>No payment and no stock reservation.</p>
        <p className="rounded-xl bg-white/10 px-3 py-2 sm:p-4"><strong className="block text-white">3. FIT checks availability</strong>Price and fulfilment are confirmed with you.</p>
      </div>
    </div>
    <section className="mt-6 rounded-2xl border border-slate-200 p-3 sm:p-5" aria-label="Bulk prices">
      <h2>Prices per 1kg roll</h2><p className="mt-2 text-sm">Mix Lanbo and FIT colours within PLA or PETG. Plain, Marble and Wood PLA count together; PETG counts separately. Bambu Lab uses list prices and does not count towards these tiers.</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs sm:text-sm"><thead><tr><th className="px-1 py-2 sm:p-2">SGD / roll</th>{BULK_BANDS.map(b => <th className="whitespace-nowrap px-1 py-2 sm:p-2" key={b.min}>{b.label}</th>)}</tr></thead><tbody>{Object.values(BULK_LADDERS).map(l => <tr key={l.label} className="border-t border-slate-200"><th className="px-1 py-2 sm:p-2">{l.label}</th>{l.cents.map((c,i) => <td className="px-1 py-2 sm:p-2" key={i}>${(c / 100).toFixed(2)}</td>)}</tr>)}</tbody></table></div><p className="mt-3 text-sm text-slate-600">{BULK_PRICE_NOTICE}</p>
    </section>
    {error && <div role="alert" className="my-5 rounded-xl border border-red-300 bg-red-50 p-4 text-red-900">{error}</div>}
    {pending && <div role="status" className="my-5 rounded-xl border border-amber-300 bg-amber-50 p-4">Submission confirmation is pending. Your entries are locked to this reference so a retry cannot create a duplicate. Use “Retry this request” below.</div>}
    <form onSubmit={submit}>
      <fieldset disabled={busy || !!pending} className="mt-8 min-w-0">
        <legend className="mb-4 text-xl font-semibold">1. Select your colours and quantities</legend>
        <div className="rounded-2xl border border-slate-200 p-3 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">{loading ? 'Loading recorded inventory…' : checkedAt ? (stockSource === 'snapshot' ? 'Inventory snapshot: ' : 'Sheet checked: ') + new Date(checkedAt).toLocaleDateString('en-SG') : 'Inventory unavailable'}</p>
            <button type="button" onClick={refresh} disabled={loading} className="min-h-11 px-2 text-sm underline">Refresh inventory</button>
          </div>
          {!loading && catalogue.length === 0 && <p className="mt-4">No selectable filament inventory is available right now. Please refresh or contact FIT.</p>}
          <label className="mt-5 block text-sm font-medium">Product / material
            <select ref={chooser} className={inputClass + ' mt-2'} value={productId} onChange={e => chooseProduct(e.target.value)}>
              <option value="">Choose a filament product</option>
              {catalogue.filter(p => p.brand !== 'Bambu Lab').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              <optgroup label="Bambu Lab">{catalogue.filter(p => p.brand === 'Bambu Lab').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
            </select>
          </label>
          {product?.brand === 'Bambu Lab' && <p className="mt-3 text-sm">{BAMBU_PRICE_NOTICE}</p>}
          {product?.pricingMode === 'list' && <p className="mt-2 text-xs text-slate-600">Stock source: {product.stockSource === 'shop' ? 'current shop inventory' : product.stockSource}. Limits include shared colour and spool stock.</p>}
          {product && <><div className="mt-4 grid gap-4 sm:grid-cols-2">{product.types.map(t => /^spool$/i.test(t.label) ? <fieldset key={t.id} className="min-w-0 sm:col-span-2">
            <legend className="text-sm font-semibold">Spool option</legend>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">{t.options.map(o => <label key={o.id} className={'flex min-h-11 min-w-0 cursor-pointer items-start gap-3 rounded-xl border p-3 sm:p-4 ' + (options[t.id] === o.id ? 'border-emerald-700 bg-emerald-50' : 'border-slate-300 bg-white')}>
              <input type="radio" aria-label={filamentOptionLabel(t.label,o.name) + ' ' + (bulkSelectionStock(product, { ...options, [t.id]: o.id }) + ' rolls for this colour')} name={'spool-' + t.id} value={o.id} checked={options[t.id] === o.id} onChange={() => setOptions({ ...options, [t.id]: o.id })} className="mt-1"/>
              <span className="min-w-0 break-words"><strong className="block">{filamentOptionLabel(t.label,o.name)}</strong><span className="mt-1 block text-sm">{bulkSelectionStock(product, { ...options, [t.id]: o.id })} rolls for this colour</span></span>
            </label>)}</div>
            <p className="mt-2 text-xs text-slate-600">Spool and refill quantities are checked separately for your selected colour. FIT confirms final availability.</p>
          </fieldset> : <label key={t.id} className="block text-sm font-medium">{t.label}
            <select className={inputClass + ' mt-2'} value={options[t.id] || ''} onChange={e => setOptions({ ...options, [t.id]: e.target.value })}>
              <ColourOptions product={product} type={t}/>
            </select></label>)}</div>
            <details className="mt-4 rounded-xl border border-slate-200 p-2">
              <summary className="min-h-11 cursor-pointer px-2 py-3 text-sm font-semibold">Browse colour photos</summary>
              <div className="grid max-h-96 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                {product.types.find(t => t.id === product.colourTypeId)?.options.map(o => <label key={o.id} className={'flex min-h-16 min-w-0 cursor-pointer items-center gap-3 rounded-xl border p-2 ' + (options[product.colourTypeId] === o.id ? 'border-emerald-700 bg-emerald-50' : 'border-slate-200 bg-white')}>
                  <input type="radio" name={'colour-photo-' + product.id} aria-label={'Photo: ' + (o.preview?.label || o.name)} checked={options[product.colourTypeId] === o.id} onChange={() => setOptions({ ...options, [product.colourTypeId]: o.id })}/>
                  <FilamentColourPreview compact preview={o.preview} name={o.name}/>
                  <span className="min-w-0 break-words text-sm"><strong className="block">{o.preview?.label || o.name}</strong><span className="mt-1 block text-slate-600">{o.stock} recorded remaining</span>{o.ladder === 'SPECIALTY_PLA' && <span className="block text-amber-900">Premium — Marble &amp; Wood PLA</span>}</span>
                </label>)}
              </div>
              <p className="mt-2 text-xs text-slate-600">{product.brand === 'Bambu Lab' ? 'Bambu photos show official printed samples. Spool or refill packaging follows your selection. Swatches are colour references only.' : 'Manufacturer product photos appear beside matching colours. Unverified previews remain labelled unavailable.'}</p>
            </details>
            <div className="mt-4 flex items-center gap-3"><FilamentColourPreview responsive preview={chosen.colour?.preview} name={chosen.colour?.name || 'Selected colour'}/><p className="text-xs text-slate-600">{chosen.colour?.preview?.reason || 'Screen colours are approximate. Finish, lighting and batch affect appearance.'}</p></div>
            {chosen.ladder === 'SPECIALTY_PLA' && <p className="mt-3 inline-block rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-950">Premium · {BULK_LADDERS[chosen.ladder].label}</p>}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
              <p><strong>{chosen.stock == null ? 'Stock unverified' : chosen.stock + ' recorded stock limit for this selection'}</strong><br/><span className="text-sm text-slate-600">{chosen.ladder === 'BAMBU_LIST' ? <>List price: {money({ amount: chosen.listUnitCents / 100, currency: 'SGD' })} per roll</> : chosen.ladder && <>Under 10 rolls: {money({ amount: bulkTier(chosen.ladder,1).unitCents / 100, currency: 'SGD' })} per 1kg roll</>}</span></p>
              <button type="button" onClick={addLine} disabled={!chosen.limit} className={buttonClass + ' w-full sm:w-auto'}>Add colour to enquiry</button>
            </div></>}
          <p className="mt-4 text-xs text-slate-600">Request up to {BULK_EXTRA_REQUEST_ROLLS} rolls above recorded stock using the same quantity field. Shared colour and spool limits apply. Additional rolls need FIT confirmation; no stock is reserved.</p>
        </div>
        <div className="mt-7 flex flex-wrap items-center justify-between gap-2"><h2>Selected colours</h2><span className="text-sm text-slate-500">{lines.length} / 50 selections</span></div>
        <p className="mt-2 text-sm text-slate-600">Set one quantity for each colour. You can edit or remove any selection before sending.</p>
        {lines.length === 0 && <p className="my-4 text-slate-600">Add a product and colour above to start your request.</p>}
        {lines.map((line,index) => {
          const p = catalogue.find(p => p.id === line.productId)
          const selectedOptions = Object.fromEntries(line.options.map(o => [o.typeId, o.optionId]))
          const info = selection(p, selectedOptions)
          return <section key={line.productId + JSON.stringify(line.options)} className="mt-4 rounded-2xl border border-slate-200 p-3 sm:p-5" aria-label={'Request line ' + (index + 1)}>
            <div className="flex items-start justify-between gap-2"><div className="flex min-w-0 items-start gap-3"><FilamentColourPreview responsive preview={info.colour?.preview} name={info.colour?.name || 'Selected colour'}/><div className="min-w-0 break-words"><h3 className="text-base! font-semibold text-slate-950!">{p?.name || 'Product no longer available'}</h3>
              <p className="mt-1 text-sm">{p?.types.map(t => t.label + ': ' + filamentOptionLabel(t.label, t.options.find(o => o.id === selectedOptions[t.id])?.name || 'Unavailable')).join(' · ')}</p>
              {info.ladder === 'SPECIALTY_PLA' && <p className="mt-2 text-sm font-semibold text-amber-900">Premium · {BULK_LADDERS[info.ladder].label}</p>}
              {p?.types.filter(t => /^spool$/i.test(t.label)).map(t => { const o = t.options.find(o => o.id === selectedOptions[t.id]); return <p key={t.id} className="mt-1 text-sm font-medium">{filamentOptionLabel(t.label,o?.name || 'Unavailable')}: {info.stock == null ? 'remaining stock unverified' : info.stock + ' rolls for this colour'}</p> })}
              <p className="mt-2 text-sm text-slate-600">Recorded stock: {info.stock ?? 'unverified'} rolls</p></div></div>
              <button type="button" aria-label={'Remove line ' + (index + 1)} className="min-h-11 shrink-0 px-2 text-sm underline" onClick={() => setLines(lines.filter((_,i) => i !== index))}>Remove</button></div>
            <div className="mt-4 max-w-sm">
              <label className="block text-sm font-medium">Qty (rolls)<input aria-label={'Quantity line ' + (index + 1)} className={inputClass + ' mt-2'} type="number" min="1" max={lineStock(line, index)} aria-invalid={!!quantityErrors[index]} aria-describedby={quantityErrors[index] ? `quantity-error-${index}` : undefined} step="1" required value={line.quantity} onChange={e => editLine(index,'quantity',e.target.value === '' ? '' : Number(e.target.value))}/></label>
            </div>
            <p className="mt-2 text-xs text-slate-600">Enquiry limit: {lineStock(line, index)} rolls. Quantities above recorded stock are availability requests, not confirmed stock.</p>
            {quantityErrors[index] && <p id={`quantity-error-${index}`} role="alert" className="mt-2 text-sm font-medium text-red-700">{quantityErrors[index]}</p>}
            {prices[index] && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950">{prices[index].ladder === 'BAMBU_LIST' ? BAMBU_PRICE_NOTICE : <>{BULK_LADDERS[prices[index].ladder].label} | {p.material} band {prices[index].band} ({prices[index].tierRolls} rolls combined)</>}<br/><strong>{money({ amount: prices[index].unitCents / 100, currency: 'SGD' })} / roll x {line.quantity} = {money({ amount: prices[index].lineCents / 100, currency: 'SGD' })}</strong><br/>{prices[index].priceNotice || BULK_PRICE_NOTICE}</p>}
            <label className="mt-4 block text-sm">Item remarks<input className={inputClass + ' mt-2'} maxLength={500} value={line.remarks} onChange={e => editLine(index,'remarks',e.target.value)} placeholder="Any details FIT should check for this selection"/></label>
          </section>
        })}
        {prices.length > 0 && <p className="mt-5 text-lg font-semibold">Indicative total: {money({ amount: prices.reduce((n,l) => n + l.lineCents, 0) / 100, currency: 'SGD' })}</p>}
        {quantityErrors.some(Boolean) && <p className="mt-5 text-sm text-amber-900">Estimate unavailable. Correct the quantities above to see prices and the combined tier.</p>}
        {lines.length > 0 && <button type="button" onClick={anotherColour} disabled={lines.length >= 50 || loading} className={buttonClass + ' mt-5'}>Add another colour</button>}
        {stale && lines.length > 0 && <div className="mt-4 rounded-xl bg-amber-50 p-4 text-amber-950"><p>Inventory or prices have changed. Review the refreshed limits above and adjust quantities before accepting.</p><button type="button" className="mt-3 font-medium underline" onClick={acceptInventory}>I have reviewed the refreshed inventory</button></div>}
        <h2 className="mt-9">2. Your contact and fulfilment preference</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {[['name','Name','text'],['email','Email','email'],['phone','Phone (optional)','tel'],['organisation','Organisation (optional)','text']].map(([key,label,type]) => <label key={key} className="block text-sm font-medium">{label}<input className={inputClass + ' mt-2'} type={type} required={key === 'name' || key === 'email'} autoComplete={key === 'name' ? 'name' : key === 'phone' ? 'tel' : key === 'email' ? 'email' : 'organization'} maxLength={key === 'email' ? 254 : key === 'phone' ? 40 : key === 'organisation' ? 160 : 120} value={customer[key]} onChange={e => setCustomer({ ...customer, [key]: e.target.value })}/></label>)}
        </div>
        <label className="mt-5 block text-sm font-medium">One fulfilment preference for this request<select className={inputClass + ' mt-2'} value={fulfilment} onChange={e => setFulfilment(e.target.value)}><option value="collection">Collection — details to confirm</option><option value="delivery">Delivery enquiry — charge and timing to confirm</option></select></label>
        {fulfilment === 'delivery' && <label className="mt-4 block text-sm font-medium">Delivery address<textarea className={inputClass + ' mt-2'} required maxLength={1000} value={address} onChange={e => setAddress(e.target.value)}/></label>}
        <label className="mt-4 block text-sm font-medium">Notes (optional)<textarea className={inputClass + ' mt-2'} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Project needs or timing you would like FIT to consider"/></label>
        <label className="mt-6 flex items-start gap-3 rounded-xl bg-slate-100 p-4 text-sm"><input className="mt-1 h-4 w-4 shrink-0" type="checkbox" required checked={confirmReview} onChange={e => setConfirmReview(e.target.checked)}/><span>I understand this is an enquiry for review. Stock, final pricing and fulfilment need confirmation. No rolls are reserved, no payment is taken and no delivery date is confirmed.</span></label>
        <label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm"><input className="mt-1 h-4 w-4 shrink-0" type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)}/><span>{BULK_CONSENT}</span></label>
      </fieldset>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button className={buttonClass} type="submit" disabled={busy || (!pending && (loading || !catalogue.length || !lines.length || stale || quantityErrors.some(Boolean)))}>{busy ? 'Checking and submitting…' : pending ? 'Retry this request' : 'Send request to FIT'}</button>
        <p className="text-xs text-slate-600">Your contact details are shared with FIT for this enquiry. <Link href="/privacy" className="underline">Privacy policy</Link></p>
      </div>
    </form>
  </main>
}
