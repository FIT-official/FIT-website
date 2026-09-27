'use client'
import { colourStockLabel, colourStockNote, materialOptions } from '@/lib/customPrint/materials'

const money = value => new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD', minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(value)

// Material cards (one per filament family) and the colour swatches of the
// chosen material. Stock badges come from the live filament inventory. A
// creator's print farm passes its own `materials` (what it offers, with S$/g).
export default function MaterialColourStep({ colours, materials: offered = null, filament, colour, perPart = false, disabled = false, note = '', onChange }) {
  const materials = offered || materialOptions(colours)
  const current = materials.find(material => material.value === filament) || materials[0]
  const selected = current?.colours.find(item => item.name === colour)
  const chooseMaterial = material => {
    const first = material.colours.find(item => item.stockStatus === 'in_stock') || material.colours[0]
    onChange({ filament: material.value, colour: first?.name || '' })
  }
  return (
    <div>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-label="Material">
        {materials.map(material => {
          const active = material.value === current?.value
          return <button key={material.value} type="button" aria-pressed={active} aria-label={material.label} disabled={disabled}
            onClick={() => chooseMaterial(material)}
            className={`relative flex min-h-[88px] flex-col gap-1 rounded-md border p-3 text-left transition disabled:opacity-50 ${active ? 'border-textColor ring-1 ring-textColor' : 'border-borderColor hover:border-lightColor'}`}>
            {material.recommended && <span className="absolute right-2 top-2 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#1a1400]">Recommended</span>}
            <span className="pr-24 text-sm font-semibold">{material.label}</span>
            <span className="text-xs text-lightColor">{material.description}</span>
            <span className="mt-auto font-mono text-[11px] text-lightColor">{material.colours.length} colour{material.colours.length === 1 ? '' : 's'}{Number.isFinite(material.ratePerGram) ? ` · ${money(material.ratePerGram)}/g` : ''}</span>
          </button>
        })}
      </div>
      {perPart ? <div className="mt-4 flex flex-wrap items-center gap-3">
        <span role="status" className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">Colours set per part in the 3D editor</span>
        <button type="button" disabled={disabled} onClick={() => onChange({ filament: current.value, colour: (current.colours.find(item => item.stockStatus === 'in_stock') || current.colours[0])?.name || '' })}
          className="text-xs underline underline-offset-4 disabled:opacity-50">Use one colour instead</button>
      </div> : <div className="mt-4 flex flex-wrap gap-2.5" role="group" aria-label="Colour">
        {(current?.colours || []).map(item => {
          const out = item.stockStatus === 'out_of_stock'
          const active = item.name === colour
          // Colours without a swatch (a print farm's own materials) are named chips.
          if (!item.hex) return <button key={item.name} type="button" disabled={disabled} aria-pressed={active} aria-label={`Choose ${item.name}`}
            onClick={() => onChange({ filament: current.value, colour: item.name })}
            className={`min-h-9 rounded-full border px-3 text-xs font-semibold transition disabled:opacity-50 ${active ? 'border-textColor ring-2 ring-textColor/25' : 'border-borderColor'}`}>{item.name}</button>
          return <button key={item.name} type="button" disabled={disabled} aria-pressed={active}
            aria-label={`Choose ${item.name}${out ? ' · Out of stock' : ''}`} title={`${item.name}${colourStockLabel(item.stockStatus) ? ` · ${colourStockLabel(item.stockStatus)}` : ''}`}
            onClick={() => onChange({ filament: current.value, colour: item.name })}
            className={`relative h-9 w-9 rounded-full border-2 transition disabled:opacity-50 ${active ? 'border-textColor ring-2 ring-textColor/25' : 'border-background shadow-[0_0_0_1px_var(--borderColor)]'} ${out ? 'opacity-35 grayscale' : ''}`}
            style={{ backgroundColor: item.hex }}>
            {out && <span aria-hidden="true" className="absolute inset-0 grid place-items-center text-[10px] font-bold text-textColor">✕</span>}
          </button>
        })}
      </div>}
      <p className="mt-2 text-sm">{current?.label}{colour ? ` · ${colour}` : ''}{selected && colourStockLabel(selected.stockStatus) ? <span className="text-lightColor"> · {colourStockLabel(selected.stockStatus)}</span> : ''}</p>
      {selected && colourStockNote(selected.stockStatus) && <p role="status" className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{colourStockNote(selected.stockStatus)}</p>}
      <p className="mt-2 text-xs text-lightColor">{note || 'One colour for the whole part. Need several colours or a specific filament? Use Advanced options below.'}</p>
    </div>
  )
}
