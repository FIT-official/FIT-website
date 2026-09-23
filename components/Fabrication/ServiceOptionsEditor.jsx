'use client'
import { Field, fieldClass, minorButtonClass } from './shared'

const identifier = prefix => `${prefix}-${crypto.randomUUID()}`
export default function ServiceOptionsEditor({ value = [], onChange }) {
  const update = (id, patch) => onChange(value.map(group => group.id === id ? { ...group, ...patch } : group))
  return <details className="border-t border-borderColor pt-4"><summary className="cursor-pointer text-sm font-medium">Customisation choices · {value.length} groups</summary>
    <p className="mt-3 text-xs text-lightColor">Add finishes, colours, mounting, packing or other choices. Each selected option adds its price per item. Describe unusual work in the service brief and confirm it manually.</p>
    <div className="mt-4 space-y-4">{value.map(group => <section key={group.id} className="space-y-3 rounded-md border border-borderColor p-4">
      <div className="flex flex-wrap items-end gap-3"><Field label="Option name"><input className={fieldClass} value={group.name} maxLength={60} placeholder="e.g. Finish" onChange={event => update(group.id, { name: event.target.value })} required /></Field><button type="button" className="text-xs underline" onClick={() => onChange(value.filter(item => item.id !== group.id))}>Remove group</button></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={group.required} onChange={event => update(group.id, { required: event.target.checked })} />Customer must choose an option</label>
      {group.choices.map(choice => <div key={choice.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.65fr)_auto] items-end gap-2"><Field label="Choice"><input required maxLength={60} placeholder="e.g. Polished" className={fieldClass} value={choice.label} onChange={event => update(group.id, { choices: group.choices.map(item => item.id === choice.id ? { ...item, label: event.target.value } : item) })} /></Field><Field label="Extra S$ / item"><input required type="number" min="0" max="100000" step="0.01" className={fieldClass} value={choice.priceDelta} onChange={event => update(group.id, { choices: group.choices.map(item => item.id === choice.id ? { ...item, priceDelta: Number(event.target.value) } : item) })} /></Field><button type="button" aria-label={`Remove ${choice.label || 'choice'}`} className="mb-2 text-sm" disabled={group.choices.length <= 1} onClick={() => update(group.id, { choices: group.choices.filter(item => item.id !== choice.id) })}>×</button></div>)}
      <button type="button" className={minorButtonClass} disabled={group.choices.length >= 30} onClick={() => update(group.id, { choices: [...group.choices, { id: identifier('choice'), label: '', priceDelta: 0 }] })}>Add choice</button>
    </section>)}</div>
    <button type="button" className={`${minorButtonClass} mt-4`} disabled={value.length >= 12} onClick={() => onChange([...value, { id: identifier('option'), name: '', required: false, choices: [{ id: identifier('choice'), label: '', priceDelta: 0 }] }])}>Add customisation group</button>
  </details>
}
