'use client'
import { ADVANCED_FIELDS, QUALITY_LEVELS, STRENGTH_LEVELS, SUPPORT_OPTIONS, applyAdvanced, applyQuality, applyStrength,
  qualityFromSettings, strengthFromSettings, supportValue } from '@/lib/customPrint/requestState'

const money = value => new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' }).format(value)

function Segmented({ label, help, levels, value, disabled, onPick }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-lightColor">{label}</span>
      <div role="group" aria-label={label} className="inline-flex w-fit overflow-hidden rounded-md border border-borderColor">
        {levels.map(level => <button key={level} type="button" aria-pressed={value === level} disabled={disabled} onClick={() => onPick(level)}
          className={`border-r border-borderColor px-3.5 py-1.5 text-sm font-semibold last:border-r-0 disabled:opacity-50 ${value === level ? 'bg-textColor text-background' : 'text-lightColor hover:text-textColor'}`}>{level}</button>)}
      </div>
      <span className="text-xs text-lightColor">{help}</span>
    </div>
  )
}

export default function PrintSettingsStep({ printSettings, onSettings, note, onNote, options, onOptions, rushAllowed, quoteLines,
  disabled = false, onOpenEditor, onManualQuote, busyAction = '', signedIn = false, canSave = false }) {
  const saveHint = !signedIn ? 'Sign in to save this request first.' : !canSave ? 'Add a model first.' : ''
  const strength = strengthFromSettings(printSettings)
  const quality = qualityFromSettings(printSettings)
  const fee = key => quoteLines?.find(line => line.key === key)?.amount
  const finishingFee = fee('postProcessing')
  const select = 'mt-1 min-h-10 w-full rounded-md border border-borderColor bg-background px-2 text-sm'
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-6">
        <Segmented label="Strength" help="Walls and infill. Normal suits most parts." levels={STRENGTH_LEVELS} value={strength} disabled={disabled}
          onPick={level => onSettings(applyStrength(printSettings, level))} />
        <Segmented label="Surface quality" help="Layer height. High takes longer." levels={QUALITY_LEVELS} value={quality} disabled={disabled}
          onPick={level => onSettings(applyQuality(printSettings, level))} />
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-lightColor">Quantity</span>
          <span className="py-1.5 text-sm">1 model file per request</span>
          <span className="text-xs text-lightColor">Need more copies? Mention it in the note.</span>
        </div>
      </div>
      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-lightColor">What is it for? (optional)</span>
        <textarea rows={3} maxLength={1000} value={note} disabled={disabled} onChange={event => onNote(event.target.value)}
          placeholder="e.g. replacement knob for a cooker, needs to survive heat" className="mt-1 w-full rounded-md border border-borderColor bg-background p-3 text-sm" />
        <span className="text-xs text-lightColor">Helps the maker pick orientation and settings.</span>
      </label>
      <div className="flex flex-wrap gap-5 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={options.postProcessing} disabled={disabled}
          onChange={event => onOptions({ ...options, postProcessing: event.target.checked })} />Sand and finish{finishingFee > 0 ? ` (+${money(finishingFee)})` : ''}</label>
        <label className={`flex items-center gap-2 ${rushAllowed ? '' : 'text-lightColor'}`}><input type="checkbox" checked={options.expedite} disabled={disabled || !rushAllowed}
          onChange={event => onOptions({ ...options, expedite: event.target.checked })} />Rush, sooner{rushAllowed ? '' : ' (needs an in-stock colour)'}</label>
      </div>
      <details className="rounded-md border border-borderColor bg-baseColor px-4">
        <summary className="cursor-pointer py-2.5 text-sm font-semibold">Advanced options</summary>
        <div className="space-y-4 pb-4 pt-1">
          <p className="border-l-2 border-amber-400 pl-3 text-xs text-lightColor">These are the settings behind Strength and Surface quality. Change them only if you know what you need; the price updates the same way.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ADVANCED_FIELDS.map(field => {
              const value = printSettings[field.key]
              const known = field.options.includes(value)
              return <label key={field.key} className="text-xs font-medium">{field.label}
                <select value={String(value)} disabled={disabled} className={select}
                  onChange={event => onSettings(applyAdvanced(printSettings, field.key, Number(event.target.value)))}>
                  {!known && <option value={String(value)}>{field.format(value)}</option>}
                  {field.options.map(option => <option key={option} value={String(option)}>{field.format(option)}</option>)}
                </select>
              </label>
            })}
            <label className="text-xs font-medium">Supports
              <select value={supportValue(printSettings)} disabled={disabled} className={select}
                onChange={event => onSettings(applyAdvanced(printSettings, 'support', event.target.value))}>
                {SUPPORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <button type="button" onClick={onOpenEditor} disabled={disabled || Boolean(saveHint)}
              className="rounded-md border border-borderColor px-3 py-1.5 font-semibold hover:border-textColor disabled:opacity-50">{busyAction === 'editor' ? 'Saving…' : 'Open 3D editor for per-part colours →'}</button>
            <button type="button" onClick={onManualQuote} disabled={disabled || Boolean(saveHint)} className="text-lightColor underline underline-offset-4 disabled:opacity-50">{busyAction === 'manual' ? 'Sending…' : 'Ask for a manual quote instead'}</button>
            {saveHint && <span className="text-lightColor">{saveHint}</span>}
          </div>
        </div>
      </details>
    </div>
  )
}
