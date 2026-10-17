'use client'
import { PLANNING_AREAS } from '@/lib/location/sgAreas'

// Optional Singapore planning-area picker (URA planning areas, neutral list). Same list everywhere.
export default function AreaSelect({ id = 'area', name = 'area', label = 'Area', value = '', onChange, disabled, className, selectClassName, hint, error, required = false }) {
  const hintId = hint ? `${id}-hint` : undefined, errorId = error ? `${id}-error` : undefined
  return (
    <div className={className}>
      <label htmlFor={id}>{label}{!required && <span data-optional=""> Optional</span>}</label>
      <select id={id} name={name} value={value || ''} disabled={disabled} required={required} className={selectClassName} aria-invalid={Boolean(error)} aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined} onChange={event => onChange?.(event.target.value)}>
        <option value="">Choose an area</option>
        {PLANNING_AREAS.map(area => <option key={area} value={area}>{area}</option>)}
      </select>
      {hint && <p id={hintId} data-hint="">{hint}</p>}
      {error && <p id={errorId} role="alert" data-error="">{error}</p>}
    </div>
  )
}