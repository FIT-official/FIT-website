'use client'
import { useId } from 'react'

export const fieldClass = 'w-full min-w-0 rounded-lg border border-borderColor bg-background px-3 py-2 text-sm text-textColor focus:border-textColor focus:outline-none focus:ring-2 focus:ring-borderColor disabled:bg-baseColor'
export const cardClass = 'min-w-0 rounded-md border border-borderColor bg-background p-5 sm:p-6'
export const buttonClass = 'inline-flex items-center justify-center rounded-lg bg-textColor px-4 py-2.5 text-sm font-medium text-background disabled:opacity-50'
export const minorButtonClass = 'inline-flex items-center justify-center rounded-lg border border-borderColor bg-background px-3 py-2 text-sm text-textColor disabled:opacity-50'
export const money = value => `S$${new Intl.NumberFormat('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)}`

export function Field({ label, hint, children }) {
  return <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium text-textColor">
    <span>{label}</span>{children}{hint && <span className="text-xs font-normal leading-relaxed text-lightColor">{hint}</span>}
  </label>
}

export function AssetInput({ accept, onPick, label = 'Choose file' }) {
  const id = useId()
  return <span className="relative inline-flex w-fit items-center rounded-md border border-borderColor bg-background px-3 py-2 text-sm font-normal focus-within:ring-2 focus-within:ring-borderColor">
    <span>{label}</span><input id={id} type="file" accept={accept} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" onChange={event => { onPick(event.target.files?.[0]); event.target.value = '' }} />
  </span>
}

export async function readResponse(response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.issues?.[0]?.message || data.error || 'Something went wrong. Please try again.')
  return data
}

export async function uploadFabricationAsset(file) {
  const form = new FormData()
  form.append('file', file)
  return readResponse(await fetch('/api/fabrication/assets', { method: 'POST', body: form }))
}

export const defaultPersonalization = () => ({ text: '', fontFamily: 'sans', textColor: '#182c32' })

export function EstimateBreakdown({ snapshot }) {
  const estimate = snapshot?.estimate
  if (!estimate) return null
  if (estimate.manualReviewRequired) return <div className="space-y-3" aria-live="polite"><p className="text-2xl font-semibold">Provider quote</p><p className="text-sm text-lightColor">Send your brief and chosen options. The provider will review the scope and confirm a price.</p>{estimate.options?.length > 0 && <ul className="space-y-1 text-xs text-lightColor">{estimate.options.map(option => <li key={option.groupId}>{option.groupName}: {option.label}{option.priceDelta > 0 ? ` · ${money(option.priceDelta)} per item extra` : ''}</li>)}</ul>}<p className="text-xs text-lightColor">No payment is collected here.</p></div>
  return <div className="space-y-3 text-sm" aria-live="polite">
    <div><p className="text-xs font-medium uppercase tracking-widest text-lightColor">Estimated total</p><p className="mt-1 text-3xl font-semibold text-textColor">{money(estimate.total)}</p></div>
    <dl className="space-y-2 text-lightColor">
      <div className="flex justify-between gap-3"><dt>Material / process × {snapshot.quantity}</dt><dd>{money(estimate.processPerItem * snapshot.quantity)}</dd></div>
      <div className="flex justify-between gap-3"><dt>Item charge × {snapshot.quantity}</dt><dd>{money(estimate.perItemFee * snapshot.quantity)}</dd></div>
      {estimate.options?.map(option => <div key={option.groupId} className="flex justify-between gap-3"><dt>{option.groupName}: {option.label} × {snapshot.quantity}</dt><dd>{money(option.priceDelta * snapshot.quantity)}</dd></div>)}
      <div className="flex justify-between gap-3"><dt>Order setup</dt><dd>{money(estimate.setupFee)}</dd></div>
      {estimate.minimumApplied && <div className="flex justify-between gap-3"><dt>Minimum order top-up</dt><dd>{money(estimate.total - estimate.subtotal)}</dd></div>}
    </dl>
    <p className="text-xs leading-relaxed text-lightColor">{estimate.basis === 'bounding_envelope'
      ? 'Uses the full bounding-box volume, not the solid model volume. The provider checks geometry, packing, supports and finishing before confirming.'
      : estimate.basis === 'length' ? 'Uses your entered length and selected variant. Complexity, finishing and delivery are confirmed by the provider.'
        : estimate.basis === 'item' ? 'Uses your quantity, selected variant and customisation choices. The provider confirms the scope and delivery.'
          : 'Uses your entered width, height and the selected material thickness. Cutting complexity, artwork, finishing and delivery are confirmed by the provider.'}</p>
    <p className="text-xs font-medium text-lightColor">Indicative estimate in SGD. The provider confirms the final quote; payment is arranged directly.</p>
  </div>
}
