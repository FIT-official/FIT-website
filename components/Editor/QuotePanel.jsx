'use client'
import { useEffect, useRef, useState } from 'react'
import posthog from 'posthog-js'

const OPTION_LABELS = {
  postProcessing: 'Post-processing',
  specialRequest: 'Special request',
  priority: 'Priority',
}

// Quote-line key for each option, so the panel can show the fee it adds
// (admin-configured; 0 until set in Admin → Quoting).
const OPTION_LINE_KEYS = {
  postProcessing: 'postProcessing',
  specialRequest: 'specialRequest',
  priority: 'priority',
}

function money(amount, currency = 'sgd') {
  const n = Number(amount) || 0
  return `${String(currency).toUpperCase()} ${n.toFixed(2)}`
}

/**
 * Live instant-quote panel for the editor. Sends geometry metrics + print
 * settings + option toggles to the server-authoritative /api/quote endpoint
 * (debounced) and renders the itemized breakdown. The server owns the pricing;
 * this component never computes or sends a price.
 */
const DEFAULT_OPTIONS = { postProcessing: false, specialRequest: false, priority: false, expedite: false }

export default function QuotePanel({ metrics, settings, deliveryTypeName, options: optionsProp, onOptionsChange, requestId }) {
  // Controlled when `options`/`onOptionsChange` are supplied (so the editor can
  // persist the exact selection at submit); otherwise self-managed.
  const [internalOptions, setInternalOptions] = useState(DEFAULT_OPTIONS)
  const options = optionsProp || internalOptions
  const [quote, setQuote] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const abortRef = useRef(null)

  const hasModel = !!(metrics && metrics.volumeCm3 > 0)

  useEffect(() => {
    if (!hasModel) {
      setQuote(null)
      return
    }
    const t = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            volumeCm3: metrics.volumeCm3,
            dimensionsCm: {
              length: metrics.dimensionsCm?.length || 0,
              width: metrics.dimensionsCm?.width || 0,
              height: metrics.dimensionsCm?.height || 0,
            },
            confidence: metrics.confidence || 'high',
            settings,
            options,
            ...(deliveryTypeName ? { deliveryTypeName } : {}),
            // With a saved request the server can recompute print time from the
            // STORED model, which is what the cart will charge. `preview` asks
            // for that number without saving anything. Without a requestId
            // (ad-hoc drag-and-drop) there is no stored model, so the quote
            // stays a heuristic estimate until the request is saved.
            ...(requestId ? { requestId, preview: true } : {}),
          }),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Quote failed')
        const data = await res.json()
        setQuote(data.quote)
        posthog.capture('instant_quote_received', {
          total: data.quote.total,
          currency: data.quote.currency,
          confidence: metrics.confidence || 'high',
          volume_cm3: metrics.volumeCm3,
          expedite: options.expedite,
        })
      } catch (e) {
        if (e.name !== 'AbortError') setError(e.message || 'Could not get a quote')
      } finally {
        setLoading(false)
      }
    }, 500)
    return () => clearTimeout(t)
  }, [hasModel, metrics, settings, options, deliveryTypeName, requestId])

  if (!hasModel) return null

  const toggle = (key) => {
    const next = { ...options, [key]: !options[key] }
    if (onOptionsChange) onOptionsChange(next)
    else setInternalOptions(next)
  }

  return (
    <div className="absolute top-4 left-4 z-40 w-72 rounded-md border border-borderColor bg-baseColor p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-textColor tracking-tight">Instant Quote</h3>
        {loading && <span className="text-[10px] text-light">updating…</span>}
      </div>

      {metrics.confidence === 'low' && (
        <p className="mb-2 rounded bg-amber-50 border border-amber-200 px-2 py-1 text-[11px] text-amber-700">
          This model isn’t watertight, so the estimate is approximate.
        </p>
      )}

      <div className="mb-2 flex flex-col gap-0.5 text-[11px] text-light">
        <div className="flex justify-between">
          <span>Material volume</span>
          <span className="text-textColor whitespace-nowrap">
            {Number(metrics.volumeCm3).toFixed(1)} cm³
          </span>
        </div>
        <div className="flex justify-between" title="Bounding size of the model: length × width × height">
          <span>Size (L×W×H)</span>
          <span className="text-textColor whitespace-nowrap">
            {Number(metrics.dimensionsCm?.length).toFixed(1)} × {Number(metrics.dimensionsCm?.width).toFixed(1)} ×{' '}
            {Number(metrics.dimensionsCm?.height).toFixed(1)} cm
          </span>
        </div>
      </div>

      {error && <p className="text-[11px] text-red-500 mb-2">{error}</p>}

      {quote && (
        <>
          <ul className="flex flex-col gap-1 text-xs text-textColor">
            {quote.lines
              .filter((l) => l.amount > 0 || ['material', 'printTime', 'baseFee'].includes(l.key))
              .map((l) => (
                <li key={l.key} className="flex flex-col">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-light truncate">{l.label}</span>
                    <span className="whitespace-nowrap">{money(l.amount, quote.currency)}</span>
                  </div>
                  {l.key === 'printTime' && (
                    <span className="text-[10px] text-light/80">
                      ~{Number(quote.inputs?.printHours ?? 0).toFixed(1)} h machine time (estimate)
                    </span>
                  )}
                </li>
              ))}
            {quote.expedite?.applied && (
              <li className="flex items-baseline justify-between gap-2">
                <span className="text-light">Expedite</span>
                <span className="whitespace-nowrap">{money(quote.expedite.amount, quote.currency)}</span>
              </li>
            )}
          </ul>

          <div className="mt-2 flex justify-between border-t border-borderColor pt-2 text-sm font-semibold text-textColor">
            <span>Total</span>
            <span>{money(quote.total, quote.currency)}</span>
          </div>

          {quote.minimumApplied && (
            <p className="mt-1.5 rounded bg-borderColor/20 px-2 py-1 text-[10px] text-light">
              Minimum order price of {money(quote.total, quote.currency)} applied — smaller
              changes won’t move the total until it rises above this floor.
            </p>
          )}
        </>
      )}

      <div className="mt-3 flex flex-col gap-1.5">
        {Object.keys(OPTION_LABELS).map((key) => {
          const line = quote?.lines?.find((l) => l.key === OPTION_LINE_KEYS[key])
          const enabledAtZero = options[key] && line && !(line.amount > 0)
          return (
            <label key={key} className="flex items-center gap-2 text-[11px] text-light cursor-pointer">
              <input type="checkbox" checked={options[key]} onChange={() => toggle(key)} />
              <span>
                {OPTION_LABELS[key]}
                {options[key] && line?.amount > 0 && (
                  <span className="text-textColor"> · +{money(line.amount, quote.currency)}</span>
                )}
                {enabledAtZero && <span className="text-light/70"> · no extra charge set</span>}
              </span>
            </label>
          )
        })}
        <label className="flex items-center gap-2 text-[11px] font-medium text-textColor cursor-pointer">
          <input type="checkbox" checked={options.expedite} onChange={() => toggle('expedite')} />
          <span>
            Expedite / rush
            {options.expedite && quote?.expedite?.applied && quote.expedite.amount > 0 && (
              <span> · +{money(quote.expedite.amount, quote.currency)}</span>
            )}
            {options.expedite && quote?.expedite && !(quote.expedite.amount > 0) && (
              <span className="text-light/70 font-normal"> · no surcharge set</span>
            )}
          </span>
        </label>
      </div>
    </div>
  )
}
