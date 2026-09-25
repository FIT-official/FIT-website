'use client'

const money = value => new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' }).format(value)

function materialLabel(filament) {
  return { pla: 'PLA', pla_matte: 'PLA Matte', petg: 'PETG', asa: 'ASA', abs: 'ABS', tpu: 'TPU' }[filament] || 'Material'
}

// Itemised price lines from a server quote plus the flat delivery fee the cart
// charges for the chosen delivery option. Pure presentation: no pricing here.
export function priceLines({ quote, delivery, filament }) {
  if (!quote) return []
  const line = key => quote.lines?.find(item => item.key === key)
  const amount = key => Number(line(key)?.amount) || 0
  const lines = [
    { key: 'material', label: `${materialLabel(filament)}, ${Math.round(Number(quote.inputs?.weightGrams) || 0)} g`, amount: amount('material') },
    { key: 'printTime', label: `Printing, ${(Number(quote.inputs?.printHours) || 0).toFixed(1)} h`, amount: amount('printTime') },
    { key: 'baseFee', label: 'Setup', amount: amount('baseFee') },
  ]
  if (amount('postProcessing') > 0) lines.push({ key: 'postProcessing', label: 'Finishing', amount: amount('postProcessing') })
  if (amount('priority') > 0) lines.push({ key: 'priority', label: 'Priority', amount: amount('priority') })
  if (quote.expedite?.applied && quote.expedite.amount > 0) lines.push({ key: 'expedite', label: 'Rush', amount: quote.expedite.amount })
  if (delivery) lines.push({ key: 'delivery', label: delivery.displayName, amount: Number(delivery.price) || 0, free: !(delivery.price > 0) })
  return lines
}

export default function PricePanel({ quote, quoteState, quoteError, delivery, filament, checklist, ready, printedBy, estimateOnly,
  submitting, progress, error, cta, hint, hasModel, children, totalNote = 'Nothing is charged until you check out.',
  checklistLabel = 'Before you add to cart' }) {
  const lines = priceLines({ quote, delivery, filament })
  const total = quote ? (Number(quote.total) || 0) + (Number(delivery?.price) || 0) : null
  return (
    <aside aria-label="Your price" aria-live="polite" className="overflow-hidden rounded-md border border-borderColor bg-background lg:sticky lg:top-4">
      <div className="flex items-center justify-between border-b border-borderColor px-5 py-3.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider">Your price</h2>
        {quote && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${estimateOnly ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800'}`}>{estimateOnly ? 'Estimate' : 'Instant'}</span>}
      </div>
      <div className="flex items-center gap-3 border-b border-borderColor px-5 py-2.5 text-sm"><span className="text-[11px] font-semibold uppercase tracking-wider text-lightColor">Printed by</span><span className="font-medium">{printedBy}</span></div>
      <div className="border-b border-borderColor px-5 py-4">
        {total != null ? <><p className="font-mono text-3xl font-semibold tracking-tight">{money(total)}</p><p className="text-xs text-lightColor">{totalNote}</p></>
          : <><p className="font-mono text-3xl font-semibold text-lightColor/60">S$ —</p>
            <p className="text-xs text-lightColor">{quoteState === 'loading' ? 'Calculating your price…' : hasModel ? quoteError || 'This model needs a review before it can be priced.' : 'Upload a model to see the price'}</p></>}
      </div>
      {lines.length > 0 && <ul className="border-b border-borderColor px-5 py-2 text-sm">
        {lines.map(line => <li key={line.key} className="flex justify-between gap-3 py-1"><span className="text-lightColor">{line.label}</span><span className="font-mono">{line.free ? 'Free' : money(line.amount)}</span></li>)}
        <li className="mt-1.5 flex justify-between gap-3 border-t border-dashed border-borderColor pt-2 font-semibold"><span>Total</span><span className="font-mono">{money(total)}</span></li>
        {quote?.minimumApplied && <li className="pb-1 text-xs text-lightColor">Minimum order {money(Number(quote.total) || 0)} applied</li>}
      </ul>}
      <ul aria-label={checklistLabel} className="space-y-1 border-b border-borderColor px-5 py-3 text-xs text-lightColor">
        {checklist.map(item => <li key={item.key} data-ok={item.ok} className="flex items-center gap-2"><span aria-hidden="true" className={item.ok ? 'text-green-700' : 'text-borderColor'}>{item.ok ? '●' : '○'}</span><span className={item.ok ? 'text-textColor' : ''}>{item.label}</span></li>)}
      </ul>
      <div className="space-y-2 px-5 py-4">
        {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {children}
        <p className="text-center text-xs text-lightColor">{submitting && progress > 0 && progress < 100 ? `Uploading ${progress}%` : ready ? hint : 'Finish the steps above to continue.'}</p>
        {cta}
      </div>
    </aside>
  )
}
