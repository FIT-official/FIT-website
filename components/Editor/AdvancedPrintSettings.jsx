'use client'
import { useId } from 'react'
import { SIMPLE_MATERIALS } from '@/lib/quoting/genericPresets'

export const PRINT_NUMBER_FIELDS = [
  { key: 'layerHeight', label: 'Layer height (mm)', min: 0.08, max: 0.4, step: 0.01 },
  { key: 'initialLayerHeight', label: 'First layer height (mm)', min: 0.08, max: 0.4, step: 0.01 },
  { key: 'wallLoops', label: 'Walls', min: 1, max: 10, step: 1 },
  { key: 'sparseInfillDensity', label: 'Infill (%)', min: 0, max: 100, step: 1 },
]
export const PRINT_SELECT_FIELDS = [
  { key: 'nozzleDiameter', label: 'Nozzle diameter (mm)', options: [0.2, 0.4, 0.6, 0.8] },
  { key: 'internalSolidInfillPattern', label: 'Solid infill pattern', options: ['Rectilinear', 'Concentric', 'Monotonic', 'Monotonic line', 'Aligned Rectilinear'] },
  { key: 'sparseInfillPattern', label: 'Infill pattern', options: ['Rectilinear', 'Grid', 'HoneyComb', 'Triangles', 'Lightning', 'Concentric', 'Aligned Rectilinear'] },
  { key: 'supportType', label: 'Support type', options: ['Tree', 'Normal'] },
  { key: 'printPlate', label: 'Build plate surface', options: ['Textured', 'Smooth'] },
]

export default function AdvancedPrintSettings({ settings, onChange, disabled = false }) {
  const id = useId()
  const inputClass = 'mt-1 min-h-10 w-full rounded-md border border-borderColor bg-background px-2 text-sm'
  return <fieldset disabled={disabled} className="space-y-4">
    <p className="text-xs leading-relaxed text-light">Adjust the print settings directly. Closing this section keeps your changes.</p>
    <div className="grid grid-cols-2 gap-3">
      {PRINT_NUMBER_FIELDS.map(field => <label key={field.key} htmlFor={`${id}-${field.key}`} className="text-xs font-medium">
        {field.label}<input id={`${id}-${field.key}`} type="number" {...{ min: field.min, max: field.max, step: field.step }}
          value={settings[field.key]} onChange={event => {
            if (event.target.value === '') return
            onChange({ ...settings, [field.key]: Number(event.target.value) })
          }} className={inputClass} />
      </label>)}
    </div>
    {PRINT_SELECT_FIELDS.map(field => <label key={field.key} htmlFor={`${id}-${field.key}`} className="block text-xs font-medium">
      {field.label}<select id={`${id}-${field.key}`} value={settings[field.key]} className={inputClass}
        onChange={event => onChange({ ...settings, [field.key]: field.key === 'nozzleDiameter' ? Number(event.target.value) : event.target.value })}>
        {field.options.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>)}
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.enableSupport}
      onChange={event => onChange({ ...settings, enableSupport: event.target.checked })} />Print with supports</label>
    <label htmlFor={`${id}-material`} className="block text-xs font-medium">Material for review
      <select id={`${id}-material`} value={settings.materialType} className={inputClass}
        onChange={event => onChange({ ...settings, materialType: event.target.value })}>
        {SIMPLE_MATERIALS.map(material => <option key={material.value} value={material.value}>{material.label}</option>)}
      </select>
    </label>
    {settings.materialType !== 'plastic' && <p className="text-xs leading-relaxed text-amber-800">This material needs a manual quote and a check of the available printing process. The filament presets do not predict its strength or finish.</p>}
  </fieldset>
}
