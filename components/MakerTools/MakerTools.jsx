'use client'
import { useEffect, useState } from 'react'
import { SignInButton, useUser } from '@clerk/nextjs'
import Link from 'next/link'
import FilamentColourPreview from '@/components/Shop/FilamentColourPreview'
import { COLOURS, COLOUR_SOURCE, normalizeHex, rankColours } from '@/lib/makerTools/colours'
import { estimateMaterial, MATERIALS, number, planProject, validateInventory } from '@/lib/makerTools/calculations'
import styles from './MakerTools.module.css'

const grams = value => new Intl.NumberFormat('en-SG', { maximumFractionDigits: 2 }).format(value) + ' g'
const tabs = [['match', '01', 'Colour matcher'], ['estimate', '02', 'Material estimator'], ['inventory', '03', 'My filament'], ['plan', '04', 'Project planner']]
function download(name, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function SignIn() {
  return <SignInButton mode="modal" forceRedirectUrl="/maker-tools" signUpForceRedirectUrl="/maker-tools"><button className={styles.primary}>Sign in to save filament</button></SignInButton>
}
function Field({ label, children, hint }) {
  return <label className={styles.field}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}
function NumberInput({ value, onChange, ...props }) {
  return <input type="number" step="any" min="0" value={value} onChange={e => onChange(e.target.value)} {...props} />
}
function SourceNote() {
  return <details className={styles.details}><summary>How colour matching works</summary>
    <p>30 Bambu Lab PLA Basic colours, from the <a href={COLOUR_SOURCE.url} target="_blank" rel="noreferrer">official HEX table</a>, checked {COLOUR_SOURCE.checkedAt}. We convert sRGB HEX to CIELAB using D65 white and rank by Delta E 1976 (ΔE76). Lower means closer in this screen-colour model; zero means the same reference HEX.</p>
    <p>This is approximate, with no physical-match confidence percentage. Screens, lighting, texture, translucency, printer settings and batches change appearance. Compare a printed sample before a colour-critical purchase. Metallic and other finishes are not captured by one HEX. Photos are existing, source-verified catalogue samples; their packaging is not a stock promise.</p>
  </details>
}
function Offers({ offers, needed }) {
  if (!offers.length) return <p className={styles.muted}>No confirmed catalogue variant available. Browse <Link href="/shop?productCategory=Filament">FIT filament</Link>.</p>
  return <div className={styles.offers}>{offers.map(o => <div key={o.optionId + o.format}>
    <strong>{o.format === 'refill' ? 'Refill · no spool' : 'With spool'} · 1 kg net</strong>
    <span>{o.availableRolls === null ? 'Combination stock unconfirmed' : `${o.availableRolls} roll${o.availableRolls === 1 ? '' : 's'} available`}
      {needed > 0 && o.availableRolls !== null && <>{o.availableRolls >= needed ? ' · enough for this colour' : ` · short by ${needed - o.availableRolls} roll(s)`}</>}</span>
    {o.checkedAt && <small>{o.stockSource === 'snapshot' ? 'Recorded snapshot' : 'Stock checked'}: {new Date(o.checkedAt).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })} SGT · {o.stockSource}</small>}
    {o.identityNote && <small>{o.identityNote}</small>}
    <Link href={o.href}>View product &amp; select {o.optionName} →</Link>
  </div>)}</div>
}

function Matcher({ offers, catalogueState, onUseColour }) {
  const [hex, setHex] = useState('#00AE42')
  const [stockOnly, setStockOnly] = useState(false)
  const [format, setFormat] = useState('any')
  const [all, setAll] = useState(false)
  const valid = normalizeHex(hex)
  const matchingOffers = id => offers.filter(o => o.referenceId === id && (format === 'any' || o.format === format))
  const ranked = rankColours(hex).filter(c => !stockOnly || matchingOffers(c.id).some(o => o.availableRolls > 0))
  return <section aria-labelledby="match-heading">
    <div className={styles.heading}><div><p className={styles.eyebrow}>FIND YOUR PALETTE</p><h2 id="match-heading">From HEX to filament.</h2></div><span className={styles.tag}>Bambu Lab · PLA Basic</span></div>
    <p className={styles.intro}>Choose a colour. Compare the closest manufacturer references, then check the exact filament and packaging.</p>
    <div className={styles.matcherControls}>
      <input className={styles.picker} type="color" aria-label="Pick a target colour" value={valid || '#000000'} onChange={e => setHex(e.target.value.toUpperCase())} />
      <Field label="Target HEX"><input value={hex} maxLength={7} spellCheck={false} placeholder="#00AE42" onChange={e => setHex(e.target.value)} aria-invalid={!valid} aria-describedby={!valid ? 'hex-error' : undefined} /></Field>
      <Field label="Packaging"><select value={format} onChange={e => setFormat(e.target.value)}><option value="any">Spool &amp; refill</option><option value="spool">With spool</option><option value="refill">Refill only</option></select></Field>
      <label className={styles.check}><input type="checkbox" checked={stockOnly} onChange={e => setStockOnly(e.target.checked)} /> Confirmed in stock only</label>
    </div>
    {!valid && <p id="hex-error" role="alert" className={styles.error}>Use a 3- or 6-digit HEX, such as #00AE42.</p>}
    <p className={styles.muted} aria-live="polite">{valid ? `${ranked.length} reference matches · ordered by screen-colour distance` : 'Enter a valid colour to see matches.'}{stockOnly && catalogueState !== 'ready' ? ' · refresh stock to confirm availability' : ''}</p>
    <div className={styles.cards}>{ranked.slice(0, all ? 30 : 6).map((c, index) => {
      const variants = matchingOffers(c.id), preview = variants[0]?.preview
      return <article className={styles.card} key={c.id}>
        <div className={styles.colourBar} style={{ backgroundColor: c.hex }}><span>#{String(index + 1).padStart(2, '0')}</span></div>
        <div className={styles.cardBody}><div className={styles.cardTitle}><div><h3>{c.name}</h3><p className={styles.hex}>{c.hex}</p></div>{preview && <FilamentColourPreview preview={preview} name={c.name} compact />}</div>
          <p className={styles.score}>ΔE76 {c.distance.toFixed(1)} <span>{c.confidence}</span></p>
          {preview?.sourceUrl && <a className={styles.sourceLink} href={preview.sourceUrl} target="_blank" rel="noreferrer">Sample source ↗</a>}
          <Offers offers={variants} />
          <button className={styles.secondary} onClick={() => onUseColour(c.id)}>Use {c.name} in planner</button>
        </div>
      </article>
    })}</div>
    {ranked.length > 6 && <button className={styles.secondary} onClick={() => setAll(!all)}>{all ? 'Show closest six' : 'Compare all 30 colours'}</button>}
    {valid && !ranked.length && <p className={styles.notice}>No confirmed stock matches this filter. Clear the stock filter to explore the reference colours.</p>}
    <SourceNote />
  </section>
}

function Estimator() {
  const [input, setInput] = useState({ mode: 'mass', amount: '100', density: '1.24', diameter: '1.75', copies: '1', extraGrams: '0', allowancePercent: '10', pricePerKg: '', minutes: '' })
  const set = key => value => setInput(old => ({ ...old, [key]: value }))
  let result, error
  try { result = estimateMaterial(input) } catch (e) { error = e.message }
  return <section aria-labelledby="estimate-heading">
    <div className={styles.heading}><div><p className={styles.eyebrow}>PLAN YOUR MATERIAL</p><h2 id="estimate-heading">A useful estimate. Clear assumptions.</h2></div></div>
    <p className={styles.intro}>Start with known consumption or plastic volume. Your slicer is the source for a model&apos;s walls, infill, supports, purge and print time.</p>
    <div className={styles.split}><div className={styles.panel}><div className={styles.formGrid}>
      <Field label="Known input"><select value={input.mode} onChange={e => set('mode')(e.target.value)}><option value="mass">Material mass (g)</option><option value="length">Filament length (m)</option><option value="volume">Deposited plastic volume (cm³)</option></select></Field>
      <Field label={`Amount per copy (${input.mode === 'mass' ? 'g' : input.mode === 'length' ? 'm' : 'cm³'})`}><NumberInput value={input.amount} onChange={set('amount')} /></Field>
      {input.mode !== 'mass' && <Field label="Density (g/cm³)" hint="1.24 is an editable PLA assumption; use your material data sheet."><NumberInput value={input.density} onChange={set('density')} min="0.1" max="20" /></Field>}
      {input.mode === 'length' && <Field label="Filament diameter (mm)"><NumberInput value={input.diameter} onChange={set('diameter')} min="0.5" max="5" /></Field>}
      <Field label="Copies"><NumberInput value={input.copies} onChange={set('copies')} min="1" max="10000" step="1" /></Field>
      <Field label="Extra support / purge per copy (g)" hint="Enter 0 if already included in your known amount."><NumberInput value={input.extraGrams} onChange={set('extraGrams')} /></Field>
      <Field label="Material reserve (%)" hint="Additional material to have on hand; not calculated print consumption."><NumberInput value={input.allowancePercent} onChange={set('allowancePercent')} max="100" /></Field>
      <Field label="Your material cost (SGD/kg)" hint="Optional. Excludes labour, delivery, energy and tax."><NumberInput value={input.pricePerKg} onChange={set('pricePerKg')} placeholder="Optional" /></Field>
      <Field label="Slicer time per copy (minutes)" hint="Optional. Enter a known slicer estimate."><NumberInput value={input.minutes} onChange={set('minutes')} placeholder="Optional" /></Field>
    </div></div><aside className={styles.result} aria-live="polite">
      <p className={styles.eyebrow}>MATERIAL TO HAVE ON HAND</p>
      {error ? <p role="alert">{error}</p> : <><p className={styles.bigNumber}>{grams(result.totalGrams)}</p><p>{(result.totalGrams / 1000).toFixed(3)} kg including reserve</p>
        <dl><div><dt>Consumption from your inputs</dt><dd>{grams(result.consumptionGrams)}</dd></div><div><dt>Extra reserve</dt><dd>{grams(result.reserveGrams)}</dd></div><div><dt>Material budget</dt><dd>{result.costSgd === null ? 'Enter cost / kg' : new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' }).format(result.costSgd)}</dd></div><div><dt>Entered slicer time × copies</dt><dd>{result.minutes === null ? 'No time estimate' : `${Math.round(result.minutes * 10) / 10} min`}</dd></div></dl>
        <button className={styles.lightButton} onClick={() => download('fit-material-estimate.json', { schemaVersion: 1, inputs: input, result, note: 'User-input estimate; not a slicer calculation or quotation.' })}>Export estimate</button></>}
    </aside></div>
    <details className={styles.details} open><summary>Units, formula &amp; limits</summary><p>{result?.formula || 'Check the input values.'}. Add any extra support/purge per copy, multiply by copies, then add the selected reserve percentage.</p>
      <p>Volume means deposited plastic volume, not the model&apos;s bounding box. We do not infer infill, purge towers or support from geometry. This tool does not slice a model or predict print duration. Multiplying entered slicer time assumes sequential identical copies; a multi-object plate may differ.</p>
      <p>The default density of 1.24 g/cm³ is listed in <a href="https://wiki.bambulab.com/filament-acc/abs-asa-pc/bambu_pla_basic_technical_data_sheet.pdf" target="_blank" rel="noreferrer">Bambu Lab&apos;s PLA Basic technical data sheet</a> (checked 9 October 2026). Change it for other materials.</p>
    </details>
  </section>
}

function Inventory({ userId, inventory, setInventory, loaded, dirty, setDirty, save, saving, message, reload }) {
  const [draft, setDraft] = useState({ referenceId: COLOURS[0].id, label: '', brand: 'Bambu Lab', material: 'PLA Basic', hex: COLOURS[0].hex, amount: '', unit: 'g', diameter: 1.75, format: 'spool' })
  const [error, setError] = useState('')
  const edit = key => value => setDraft(old => ({ ...old, [key]: value }))
  const changeReference = id => {
    const colour = COLOURS.find(c => c.id === id)
    setDraft(old => ({ ...old, referenceId: id, brand: colour?.brand || '', material: colour?.material || 'PLA', hex: colour?.hex || '' }))
  }
  const replace = spools => { setInventory(old => ({ ...old, spools })); setDirty(true) }
  function add(e) {
    e.preventDefault(); setError('')
    try {
      const { amount, unit, ...fields } = draft
      const item = { ...fields, label: draft.label || COLOURS.find(c => c.id === draft.referenceId)?.name || '', id: crypto.randomUUID(), remainingGrams: number(amount, 'remaining filament') * (unit === 'kg' ? 1000 : 1) }
      const next = validateInventory({ ...inventory, spools: [...inventory.spools, item] })
      replace(next.spools); setDraft(old => ({ ...old, label: '', amount: '' }))
    } catch (e) { setError(e.message) }
  }
  return <section aria-labelledby="inventory-heading" className="ph-no-capture ph-mask" data-private>
    <div className={styles.heading}><div><p className={styles.eyebrow}>YOUR MATERIAL SHELF</p><h2 id="inventory-heading">Know what you already own.</h2></div><span className={styles.tag}>Private to your account</span></div>
    <p className={styles.intro}>Keep a manual record of remaining net filament. Weigh filament without the spool, or subtract your measured empty spool weight. Update it after printing.</p>
    {!userId ? <div className={styles.empty}><h3>Your next print starts with your shelf.</h3><p>Sign in to save, edit and export your own filament inventory.</p><SignIn /></div> : <>
      {message && <p role="status" className={styles.notice}>{message}</p>}
      {!loaded ? <button className={styles.secondary} onClick={reload}>Reload inventory</button> : <>
        <div className={styles.toolbar}><span>{inventory.spools.length}/100 entries · {grams(inventory.spools.reduce((sum, s) => sum + (Number(s.remainingGrams) || 0), 0))} recorded {dirty && '· unsaved edits'}</span><div>
          <button className={styles.secondary} onClick={() => download('fit-my-filament.json', { schemaVersion: 1, exportedAt: new Date().toISOString(), saved: !dirty, spools: inventory.spools })}>Export my filament</button>
          <button className={styles.primary} disabled={saving || !dirty} onClick={save}>{saving ? 'Saving…' : 'Save inventory'}</button>
        </div></div>
        <form className={styles.panel} onSubmit={add}><h3>Add filament</h3><div className={styles.formGrid}>
          <Field label="Colour reference"><select value={draft.referenceId} onChange={e => changeReference(e.target.value)}>{COLOURS.map(c => <option key={c.id} value={c.id}>Bambu PLA Basic · {c.name}</option>)}<option value="">Custom filament</option></select></Field>
          <Field label="My spool label" hint="Optional for a reference colour; required for custom filament."><input value={draft.label} maxLength={100} onChange={e => edit('label')(e.target.value)} placeholder="e.g. Green spool 1" /></Field>
          {!draft.referenceId && <><Field label="Brand"><input value={draft.brand} maxLength={80} onChange={e => edit('brand')(e.target.value)} /></Field><Field label="Material"><select value={draft.material} onChange={e => edit('material')(e.target.value)}>{MATERIALS.map(m => <option key={m}>{m}</option>)}</select></Field><Field label="Display HEX (optional)"><input value={draft.hex} maxLength={7} onChange={e => edit('hex')(e.target.value)} placeholder="#FFFFFF" /></Field></>}
          <Field label="Remaining net filament"><NumberInput value={draft.amount} onChange={edit('amount')} /></Field>
          <Field label="Quantity unit"><select value={draft.unit} onChange={e => edit('unit')(e.target.value)}><option value="g">Grams (g)</option><option value="kg">Kilograms (kg)</option></select></Field>
          <Field label="Diameter"><select value={draft.diameter} onChange={e => edit('diameter')(Number(e.target.value))}><option value={1.75}>1.75 mm</option><option value={2.85}>2.85 mm</option></select></Field>
          <Field label="Packaging"><select value={draft.format} onChange={e => edit('format')(e.target.value)}><option value="spool">With spool</option><option value="refill">Refill · no spool</option><option value="loose">Loose filament</option></select></Field>
        </div>{error && <p role="alert" className={styles.error}>{error}</p>}<button className={styles.primary} disabled={saving || inventory.spools.length >= 100}>Add to inventory edits</button></form>
        {!inventory.spools.length && <p className={styles.empty}>Your shelf is empty. Add your first spool above.</p>}
        <div className={styles.inventoryList}>{inventory.spools.map(s => <div className={styles.inventoryRow} key={s.id}>
          <span className={styles.dot} style={{ backgroundColor: normalizeHex(s.hex) || '#e6e6e6' }} aria-hidden="true" />
          <div><strong>{s.label}</strong><p>{s.brand} · {s.material} · {s.diameter} mm · {s.format}</p><small>{s.referenceId ? 'Linked to manufacturer colour reference' : 'Manual colour · not auto-matched to catalogue'}</small></div>
          <Field label={`Remaining grams for ${s.label}`}><NumberInput value={s.remainingGrams} max="100000" disabled={saving} onChange={value => replace(inventory.spools.map(item => item.id === s.id ? { ...item, remainingGrams: value === '' ? '' : Number(value) } : item))} /></Field>
          <button className={styles.remove} disabled={saving} onClick={() => replace(inventory.spools.filter(item => item.id !== s.id))} aria-label={`Remove ${s.label}`}>Remove</button>
        </div>)}</div>
        <p className={styles.muted}>Edits are saved only when you choose Save inventory. Export downloads your current edits as JSON. <button className={styles.textButton} disabled={saving} onClick={reload}>Reload saved inventory and discard these edits</button></p>
      </>}
    </>}
    <p className={styles.notice}>Manual inventory only. There is no printer connection, automatic consumption tracking or Bambu account integration. Removing all entries and saving clears your saved filament list.</p>
  </section>
}

function Planner({ lines, setLines, spools, offers, userId, loaded, dirty }) {
  const [reserve, setReserve] = useState('10')
  let result, error
  try { result = planProject(lines, spools, reserve) } catch (e) { error = e.message }
  const change = (index, key, value) => setLines(old => old.map((l, i) => i === index ? { ...l, [key]: value } : l))
  return <section aria-labelledby="plan-heading" className="ph-no-capture ph-mask" data-private>
    <div className={styles.heading}><div><p className={styles.eyebrow}>READY FOR YOUR NEXT PRINT</p><h2 id="plan-heading">Build a colour shopping list.</h2></div><span className={styles.tag}>PLA Basic · 1.75 mm</span></div>
    <p className={styles.intro}>Enter total grams for each colour from your slicer, including supports and purge. We compare exact colour references with your on-hand filament and show what is missing.</p>
    <p className={styles.notice}>{!userId ? 'Sign in to include your private inventory. This plan currently starts with no on-hand filament.' : !loaded ? 'Inventory has not loaded. On-hand totals are not yet available.' : dirty ? 'This plan uses your current unsaved inventory edits.' : 'This plan uses your saved manual inventory.'} Custom colours, other materials and 2.85 mm filament are not silently substituted.</p>
    <div className={styles.panel}>{lines.map((line, index) => <div key={line.id} className={styles.projectRow}><span className={styles.rowNumber}>{String(index + 1).padStart(2, '0')}</span>
      <Field label={`Project colour ${index + 1}`}><select value={line.referenceId} onChange={e => change(index, 'referenceId', e.target.value)}>{COLOURS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label={`Required grams for colour ${index + 1}`}><NumberInput value={line.grams} onChange={value => change(index, 'grams', value)} /></Field>
      <button className={styles.remove} onClick={() => setLines(old => old.filter((_, i) => i !== index))} aria-label={`Remove project colour ${index + 1}`}>Remove</button>
    </div>)}<div className={styles.toolbar}><button className={styles.secondary} disabled={lines.length >= 50} onClick={() => setLines(old => [...old, { id: crypto.randomUUID(), referenceId: COLOURS[0].id, grams: '' }])}>+ Add colour</button>
      <Field label="Extra project reserve (%)"><NumberInput value={reserve} onChange={setReserve} max="100" /></Field></div></div>
    {error && <p className={styles.notice} role="status">{error}</p>}
    {result && (!userId || loaded) && <><div className={styles.toolbar}><h3>Your material plan</h3><button className={styles.secondary} onClick={() => download('fit-project-plan.json', { schemaVersion: 1, exportedAt: new Date().toISOString(), reservePercent: Number(reserve), lines, result, note: 'Planning only. Stock is not reserved. Review product packaging and current availability before ordering.' })}>Export project plan</button></div>
      <div className={styles.planResults}>{result.map(c => <article key={c.id} className={styles.planCard}><div className={styles.cardTitle}><h3><span className={styles.dot} style={{ backgroundColor: c.hex }} />{c.name}</h3><span className={styles.tag}>{c.shortageGrams > 0 ? 'More filament needed' : 'Covered by your shelf'}</span></div>
        <dl className={styles.planNumbers}><div><dt>Required + reserve</dt><dd>{grams(c.requiredGrams)}</dd></div><div><dt>On hand</dt><dd>{grams(c.onHandGrams)}</dd></div><div><dt>Shortage</dt><dd>{grams(c.shortageGrams)}</dd></div></dl>
        {c.rollsNeeded > 0 && <><p className={styles.purchase}>Plan for {c.rollsNeeded} × 1 kg pack{c.rollsNeeded === 1 ? '' : 's'}. Choose one packaging option below.</p><Offers offers={offers.filter(o => o.referenceId === c.id)} needed={c.rollsNeeded} /></>}
      </article>)}</div></>}
    <details className={styles.details}><summary>How quantities are allocated</summary><p>Repeated colours are combined before comparing with your recorded grams. Required grams include the reserve percentage. Shortage = max(0, required − on hand). Packs = shortage ÷ 1,000 g, rounded up. Packaging options are alternatives, not extra purchases. A refill needs a compatible reusable spool.</p><p>Plans are kept in this page until exported. Inventory is not decremented or reserved, and catalogue stock can change. If one colour needs several rolls, multiple physical spools and a changeover may be required. Similar HEX values never automatically substitute for the selected material and colour.</p></details>
  </section>
}

function Workspace({ userId }) {
  const [tab, setTab] = useState('match')
  const [offers, setOffers] = useState([])
  const [catalogueState, setCatalogueState] = useState('loading')
  const [inventory, setInventory] = useState({ revision: 0, spools: [] })
  const [loaded, setLoaded] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('Loading your inventory…')
  const [loadVersion, setLoadVersion] = useState(0)
  const [stockVersion, setStockVersion] = useState(0)
  const [lines, setLines] = useState([{ id: 'first', referenceId: COLOURS[0].id, grams: '' }])
  useEffect(() => {
    const controller = new AbortController()
    setCatalogueState('loading'); setOffers([])
    fetch('/api/maker-tools/catalogue', { cache: 'no-store', signal: controller.signal }).then(async r => {
      if (!r.ok) throw Error('Stock unavailable')
      const data = await r.json()
      if (!controller.signal.aborted) { setOffers(data.offers || []); setCatalogueState('ready') }
    }).catch(() => { if (!controller.signal.aborted) setCatalogueState('error') })
    return () => controller.abort()
  }, [stockVersion])
  useEffect(() => {
    if (!userId) return
    const controller = new AbortController()
    setLoaded(false); setMessage('Loading your inventory…')
    fetch('/api/maker-tools/inventory', { cache: 'no-store', signal: controller.signal }).then(async r => {
      const data = await r.json(); if (!r.ok) throw Error(data.error)
      if (!controller.signal.aborted) { setInventory(data); setLoaded(true); setDirty(false); setMessage('') }
    }).catch(e => { if (!controller.signal.aborted) setMessage(e.message || 'Could not load your inventory.') })
    return () => controller.abort()
  }, [userId, loadVersion])
  async function save() {
    setSaving(true); setMessage('')
    try {
      const input = validateInventory(inventory)
      const response = await fetch('/api/maker-tools/inventory', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
      const data = await response.json(); if (!response.ok) throw Error(data.error)
      setInventory(data); setDirty(false); setMessage('Inventory saved to your account.')
    } catch (e) { setMessage(e.message || 'Save was not confirmed. Reload saved inventory to check before retrying.') }
    finally { setSaving(false) }
  }
  function useColourInPlan(referenceId) {
    setLines(old => old.length === 1 && old[0].grams === '' ? [{ ...old[0], referenceId }] : old.length < 50 ? [...old, { id: crypto.randomUUID(), referenceId, grams: '' }] : old)
    setTab('plan')
    document.getElementById('maker-workbench')?.scrollIntoView({ behavior: 'auto', block: 'start' })
  }
  return <>
    <nav className={styles.tabs} aria-label="Maker tools">{tabs.map(([id, n, label]) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}><span>{n}</span>{label}</button>)}</nav>
    <div id="maker-workbench" className={styles.workbench}>
      <div className={styles.stockStatus} role="status"><span>{catalogueState === 'loading' ? 'Checking FIT catalogue stock…' : catalogueState === 'error' ? 'Live stock unavailable. Colour references still work.' : 'Catalogue loaded. Check the source and time on each packaging option.'}</span><button className={styles.textButton} disabled={catalogueState === 'loading'} onClick={() => setStockVersion(v => v + 1)}>Refresh stock</button></div>
      <div hidden={tab !== 'match'}><Matcher offers={offers} catalogueState={catalogueState} onUseColour={useColourInPlan} /></div>
      <div hidden={tab !== 'estimate'}><Estimator /></div>
      <div hidden={tab !== 'inventory'}><Inventory {...{ userId, inventory, setInventory, loaded, dirty, setDirty, save, saving, message }} reload={() => setLoadVersion(v => v + 1)} /></div>
      <div hidden={tab !== 'plan'}><Planner {...{ lines, setLines, offers, userId, loaded, dirty }} spools={inventory.spools} /></div>
    </div>
  </>
}
export default function MakerTools() {
  const { user, isLoaded } = useUser()
  return <main className={styles.root}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/shop">Shop</Link><span>/</span><span aria-current="page">Maker Tools</span></nav>
    <header className={styles.hero}><div><p className={styles.eyebrow}>FIT / THE MAKER WORKBENCH</p><h1>Make more.<br /><span>Guess less.</span></h1><p>Find your colour. Know your material.<br className={styles.desktopBreak} /> Plan the next print with what you already own.</p></div><div className={styles.heroArt} aria-hidden="true"><div className={styles.swatches}>{['#00AE42', '#FEC600', '#FF6A13', '#0086D6', '#EC008C'].map((c, i) => <span key={c} style={{ backgroundColor: c, transform: `rotate(${(i - 2) * 10}deg)` }} />)}</div><span>30 COLOURS. YOUR NEXT IDEA.</span></div></header>
    {isLoaded ? <Workspace key={user?.id || 'guest'} userId={user?.id || null} /> : <p className={styles.empty}>Loading Maker Tools…</p>}
  </main>
}
