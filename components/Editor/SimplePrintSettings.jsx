'use client'
import { useId } from 'react'
import { PURPOSE_PRESETS, SIMPLE_MATERIALS, DEFAULT_PRINT_COLOURS, DEFAULT_SIMPLE_SELECTION, coloursForMaterial } from '@/lib/quoting/genericPresets'

export default function SimplePrintSettings({ value = DEFAULT_SIMPLE_SELECTION, onChange,
  colours = DEFAULT_PRINT_COLOURS, disabled = false, fixed = false, customSettings = false }) {
  const id = useId()
  const availableColours = fixed ? colours : coloursForMaterial(colours, value.material)
  const change = patch => onChange({ ...value, ...patch }, { field: Object.keys(patch)[0] })
  return (
    <div className="space-y-5 text-textColor">
      {!fixed && value.material === 'plastic' && <fieldset disabled={disabled}>
        <legend className="text-sm font-semibold">Purpose <span className="font-normal text-light">(optional)</span></legend>
        <div className="mb-2 flex items-center justify-between gap-3">
          <button type="button" onClick={() => change({ purpose: '' })} className="text-xs underline underline-offset-4">Use balanced defaults</button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(PURPOSE_PRESETS).map(([purpose]) => <button key={purpose} type="button"
            aria-pressed={value.purpose === purpose} onClick={() => change({ purpose })}
            className={`min-h-11 rounded-lg border px-2 py-2 text-sm transition ${value.purpose === purpose
              ? 'border-textColor bg-textColor text-background' : 'border-borderColor bg-background hover:bg-borderColor/20'}`}>
            {purpose}
          </button>)}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-light">
          {customSettings ? 'Your detailed print settings are retained.' : PURPOSE_PRESETS[value.purpose]?.description || 'Balanced defaults are ready to use. You can skip this choice.'}
        </p>
        {value.purpose === 'Strong' && <p className="mt-1 text-xs leading-relaxed text-light">Strength also depends on material, model shape and print orientation.</p>}
      </fieldset>}

      {fixed ? <p className="text-sm leading-relaxed text-light">The maker has set this product’s print settings. Choose an available colour.</p>
        : <label htmlFor={`${id}-material`} className="block text-sm font-semibold">Material
          <select id={`${id}-material`} value={value.material} disabled={disabled}
            onChange={event => change({ material: event.target.value })}
            className="mt-2 min-h-11 w-full rounded-lg border border-borderColor bg-background px-3 text-sm font-normal">
            {SIMPLE_MATERIALS.filter(material => material.value === 'plastic' || material.value === value.material)
              .map(material => <option key={material.value} value={material.value}>{material.label}{material.value !== 'plastic' ? ' (review required)' : ' (filament)'}</option>)}
          </select>
        </label>}

      <label htmlFor={`${id}-colour`} className="block text-sm font-semibold">Colour
        <select id={`${id}-colour`} value={value.colour} disabled={disabled}
          onChange={event => change({ colour: event.target.value })}
          className="mt-2 min-h-11 w-full rounded-lg border border-borderColor bg-background px-3 text-sm font-normal">
          {!availableColours.some(colour => colour.name === value.colour) && <option value={value.colour}>{value.colour} (saved selection)</option>}
          {availableColours.map(colour => <option key={colour.name} value={colour.name}>{colour.name}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-2" aria-label="Available colours">
        {availableColours.slice(0, 12).map(colour => <button key={colour.name} type="button" disabled={disabled}
          aria-label={`Choose ${colour.name}`} title={colour.name} aria-pressed={value.colour === colour.name}
          onClick={() => change({ colour: colour.name })}
          className={`h-8 w-8 rounded-full border-2 ${value.colour === colour.name ? 'border-textColor ring-2 ring-textColor/20' : 'border-borderColor'}`}
          style={{ backgroundColor: colour.hex }} />)}
      </div>
      <div className="flex items-center justify-between border-t border-borderColor pt-3 text-sm">
        <span className="font-semibold">Quantity</span><span>1 model file per request</span>
      </div>
    </div>
  )
}
