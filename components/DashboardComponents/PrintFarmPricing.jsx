'use client'
// Print farm pricing (/dashboard/print-service → Pricing). Fix It Today's
// quoting settings are the recommendation; the creator ticks "Override" only
// where their farm differs, and everything else keeps following the
// recommendation. The live sample is priced with the same pure engine and
// resolver the server uses (lib/quoting/farmProfile.js); the server still
// validates and prices from the saved profile, never from this page.
import { useMemo } from 'react'
import { GoPlus, GoX } from 'react-icons/go'
import { DashCard } from '@/components/dashboard-ui'
import { FILAMENTS } from '@/lib/filamentCatalogue'
import { MAX_FARM_DELIVERY, MULTIPLIER_BOUNDS, SAMPLE_PART, resolveFarmPricing, samplePartQuote } from '@/lib/quoting/farmProfile'

const inputCls =
    'w-full rounded-[var(--dash-r-inner)] border border-[var(--dash-line)] bg-[var(--dash-card)] px-3 py-2 text-[13px] focus:outline-none focus:border-[var(--dash-focus-line)] focus:shadow-[var(--dash-focus-ring)] disabled:opacity-60 disabled:bg-[var(--dash-canvas)]'
const pillBtn =
    'dash-hoverable inline-flex items-center gap-1 rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] px-3 py-1 text-[12px] font-medium cursor-pointer hover:bg-[var(--dash-canvas)] disabled:opacity-50'
const th = 'dash-label text-left font-medium py-2 px-2 border-b border-[var(--dash-line)]'
const td = 'py-2 px-2 border-b border-[var(--dash-line)] align-middle'
const recCls = 'font-mono text-[12px] dash-soft whitespace-nowrap'

const sgd = (value, dp = 2) => `S$${(Number(value) || 0).toFixed(dp)}`

export const RATE_ROWS = [
    { key: 'materialRatePerGram', label: 'Material, per gram', unit: 'S$', step: 0.001, dp: 3 },
    { key: 'printTimeRatePerHour', label: 'Printer time, per hour', unit: 'S$', step: 0.1 },
    { key: 'baseFee', label: 'Setup fee per order', unit: 'S$', step: 0.5 },
    { key: 'minimumPrice', label: 'Minimum order', unit: 'S$', step: 0.5 },
    { key: 'postProcessingFee', label: 'Sand and finish', unit: 'S$', step: 0.5 },
    { key: 'specialRequestFee', label: 'Special request', unit: 'S$', step: 0.5 },
    { key: 'priorityFee', label: 'Priority', unit: 'S$', step: 0.5 },
    { key: 'expediteMode', label: 'Rush surcharge', type: 'mode' },
    { key: 'expediteSurchargePercent', label: 'Rush, percent of order', unit: '%', step: 1 },
    { key: 'expediteSurchargeFlat', label: 'Rush, flat amount', unit: 'S$', step: 0.5 },
]
export const SPEED_ROWS = [
    { key: 'baseFlowCm3PerHour', label: 'Printer speed', unit: 'cm³/h', step: 0.5 },
    { key: 'supportTimeFactor', label: 'Time with supports', unit: '×', step: 0.05 },
    { key: 'wallTimeFactorPerLoop', label: 'Time per extra wall', unit: '×', step: 0.01 },
    { key: 'layerHeightRefMm', label: 'Reference layer height', unit: 'mm', step: 0.01 },
    { key: 'minHours', label: 'Shortest print', unit: 'h', step: 0.05 },
]
export const LIMIT_ROWS = [
    { key: 'maxLengthCm', label: 'Length', unit: 'cm', step: 0.1 },
    { key: 'maxWidthCm', label: 'Width', unit: 'cm', step: 0.1 },
    { key: 'maxHeightCm', label: 'Height', unit: 'cm', step: 0.1 },
    { key: 'maxWeightKg', label: 'Weight', unit: 'kg', step: 0.1 },
]
const MODE_LABELS = { greater: 'Greater of the two', percent: 'Percent only', flat: 'Flat only' }
const GROUP_PATH = { rates: null, time: 'timeModel', limits: 'machineLimits' }

function formatRecommended(row, value) {
    if (row.type === 'mode') return MODE_LABELS[value] || value
    if (value == null) return 'No limit'
    if (row.unit === 'S$') return sgd(value, row.dp || 2)
    return `${value} ${row.unit}`
}

/** Read an override (undefined = follow recommended). */
function readOverride(pricing, group, key) {
    const path = GROUP_PATH[group]
    const source = path ? pricing?.overrides?.[path] : pricing?.overrides
    const value = source?.[key]
    return value === null || value === undefined ? undefined : value
}

/** Return a new pricing draft with one override set (or cleared with undefined). */
export function setOverride(pricing, group, key, value) {
    const overrides = { ...(pricing?.overrides || {}) }
    const path = GROUP_PATH[group]
    const target = path ? { ...(overrides[path] || {}) } : overrides
    if (value === undefined) delete target[key]
    else target[key] = value
    if (path) {
        if (Object.keys(target).length) overrides[path] = target
        else delete overrides[path]
    }
    return { ...pricing, overrides }
}

function OverrideRow({ row, group, recommendedValue, pricing, onChange }) {
    const current = readOverride(pricing, group, row.key)
    const overridden = current !== undefined
    const shown = overridden ? current : recommendedValue ?? ''
    const id = `farm-${group}-${row.key}`
    const toggle = (checked) => onChange(setOverride(pricing, group, row.key,
        checked ? (recommendedValue ?? (row.type === 'mode' ? 'greater' : 0)) : undefined))
    const setValue = (raw) => onChange(setOverride(pricing, group, row.key,
        row.type === 'mode' ? raw : raw === '' ? '' : Number(raw)))
    return (
        <tr>
            <td className={td}><label htmlFor={id} className="text-[13px]">{row.label}</label></td>
            <td className={`${td} ${recCls}`}>{formatRecommended(row, recommendedValue)}</td>
            <td className={td}>
                <div className="flex items-center gap-2">
                    {row.type === 'mode' ? (
                        <select id={id} aria-label={`Your ${row.label.toLowerCase()}`} value={shown} disabled={!overridden}
                            onChange={(e) => setValue(e.target.value)} className={`${inputCls} max-w-[150px]`}>
                            {Object.entries(MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                    ) : (
                        <input id={id} type="number" min={0} step={row.step} value={shown} disabled={!overridden}
                            aria-label={`Your ${row.label.toLowerCase()}`} placeholder={recommendedValue == null ? 'No limit' : undefined}
                            onChange={(e) => setValue(e.target.value)} className={`${inputCls} max-w-[110px]`} />
                    )}
                    <label className="inline-flex items-center gap-1.5 text-[12px] dash-soft whitespace-nowrap cursor-pointer">
                        <input type="checkbox" checked={overridden} onChange={(e) => toggle(e.target.checked)}
                            aria-label={`Override ${row.label.toLowerCase()}`} />
                        Override
                    </label>
                </div>
            </td>
        </tr>
    )
}

function OverrideTable({ rows, group, recommendedValues, pricing, onChange }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-[13px] border-collapse">
                <thead>
                    <tr><th className={th}>Setting</th><th className={th}>Recommended</th><th className={th}>Yours</th></tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <OverrideRow key={row.key} row={row} group={group} recommendedValue={recommendedValues?.[row.key]}
                            pricing={pricing} onChange={onChange} />
                    ))}
                </tbody>
            </table>
        </div>
    )
}

const slug = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32)

/** Give every delivery row a unique key; rows that already have one keep it. */
export function deliveryWithTypes(rows = []) {
    const used = new Set()
    return rows.map((row, index) => {
        let type = row.type || slug(row.label) || `option-${index + 1}`
        let n = 2
        const base = type
        while (used.has(type.toLowerCase())) type = `${base}-${n++}`
        used.add(type.toLowerCase())
        return { ...row, type }
    })
}

function DeliveryCard({ recommended, pricing, onChange }) {
    const rows = pricing.delivery || []
    const inherit = rows.length === 0
    const setRows = (next) => onChange({ ...pricing, delivery: next })
    const update = (index, patch) => setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
    const recommendedRows = recommended?.deliveryOptions || []
    const startOwn = () => setRows(recommendedRows.length
        ? recommendedRows.map((item) => ({ type: item.type, label: item.displayName, price: Number(item.price) || 0,
            description: item.description || '', needsAddress: Boolean(item.needsAddress) }))
        : [{ type: '', label: 'Collection', price: 0, description: '', needsAddress: false }])
    return (
        <DashCard title="Delivery options">
            <div className="flex flex-col gap-3">
                <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                    <input type="checkbox" checked={inherit} onChange={(e) => (e.target.checked ? setRows([]) : startOwn())} />
                    Use Fix It Today&apos;s delivery options
                </label>
                {inherit ? (
                    <ul className="flex flex-col gap-1">
                        {recommendedRows.map((item) => (
                            <li key={item.type} className="dash-data flex justify-between gap-3">
                                <span>{item.displayName}</span>
                                <span className={recCls}>{Number(item.price) > 0 ? sgd(item.price) : 'Free'}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="flex flex-col gap-3">
                        {rows.map((row, i) => (
                            <div key={i} className="grid grid-cols-[1fr_96px_auto] gap-2 items-center border-b border-[var(--dash-line)] pb-3 last:border-b-0">
                                <input value={row.label} maxLength={60} onChange={(e) => update(i, { label: e.target.value })}
                                    aria-label={`Delivery option ${i + 1} name`} placeholder="Collect in Jurong" className={inputCls} />
                                <input type="number" min={0} step={0.5} value={row.price} aria-label={`Delivery option ${i + 1} price`}
                                    onChange={(e) => update(i, { price: e.target.value === '' ? '' : Number(e.target.value) })} className={inputCls} />
                                <button type="button" aria-label={`Remove delivery option ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}
                                    className="dash-hoverable h-9 w-9 grid place-items-center rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] cursor-pointer hover:bg-[var(--dash-canvas)]">
                                    <GoX aria-hidden="true" />
                                </button>
                                <input value={row.description} maxLength={200} onChange={(e) => update(i, { description: e.target.value })}
                                    aria-label={`Delivery option ${i + 1} description`} placeholder="Evenings and weekends" className={`${inputCls} col-span-2`} />
                                <label className="inline-flex items-center gap-1.5 text-[12px] dash-soft whitespace-nowrap cursor-pointer">
                                    <input type="checkbox" checked={Boolean(row.needsAddress)} onChange={(e) => update(i, { needsAddress: e.target.checked })} />
                                    Needs address
                                </label>
                            </div>
                        ))}
                        <button type="button" className={`${pillBtn} w-fit`} disabled={rows.length >= MAX_FARM_DELIVERY}
                            onClick={() => setRows([...rows, { type: '', label: '', price: 0, description: '', needsAddress: false }])}>
                            <GoPlus aria-hidden="true" /> Add option
                        </button>
                    </div>
                )}
                <span className="text-[12px] dash-soft">
                    Customers pick one on the request page. You arrange collection or courier with them directly.
                </span>
            </div>
        </DashCard>
    )
}

function MaterialsCard({ recommended, pricing, profile, onChange }) {
    const entries = pricing.materials || []
    const entryFor = (filament) => entries.find((item) => item.filament === filament)
        || { filament, enabled: false, priceMultiplier: null, coloursOff: [] }
    const put = (filament, patch) => {
        const next = { ...entryFor(filament), ...patch }
        const exists = entries.some((item) => item.filament === filament)
        onChange({ ...pricing, materials: exists ? entries.map((item) => (item.filament === filament ? next : item)) : [...entries, next] })
    }
    const farmRate = profile.rates.materialRatePerGram
    return (
        <DashCard title="Materials you offer">
            <div className="overflow-x-auto">
                <table className="w-full text-[13px] border-collapse">
                    <thead>
                        <tr><th className={th}>Material</th><th className={th}>Rec. price</th><th className={th}>Offer</th><th className={th}>Your price</th></tr>
                    </thead>
                    <tbody>
                        {FILAMENTS.map((family) => {
                            const entry = entryFor(family.value)
                            const rec = recommended.materials?.find((item) => item.filament === family.value)
                            const colours = rec?.colours || []
                            const off = new Set(entry.coloursOff || [])
                            const multiplier = entry.priceMultiplier
                            return [
                                <tr key={family.value}>
                                    <td className={td}>
                                        <span className="font-medium">{family.label}</span>
                                        <span className="block text-[12px] dash-soft">{colours.length - off.size} of {colours.length} colours</span>
                                    </td>
                                    <td className={`${td} ${recCls}`}>{sgd(rec?.ratePerGram, 3)}/g</td>
                                    <td className={td}>
                                        <label className="inline-flex items-center gap-1.5 text-[12px] cursor-pointer">
                                            <input type="checkbox" checked={Boolean(entry.enabled)} aria-label={`Offer ${family.label}`}
                                                onChange={(e) => put(family.value, { enabled: e.target.checked })} />
                                            {entry.enabled ? 'On' : 'Off'}
                                        </label>
                                    </td>
                                    <td className={td}>
                                        <div className="flex items-center gap-2">
                                            <input type="number" min={MULTIPLIER_BOUNDS.min} max={MULTIPLIER_BOUNDS.max} step={0.05}
                                                value={multiplier ?? ''} placeholder="1" disabled={!entry.enabled}
                                                aria-label={`${family.label} price multiplier`}
                                                onChange={(e) => put(family.value, { priceMultiplier: e.target.value === '' ? null : Number(e.target.value) })}
                                                className={`${inputCls} max-w-[80px]`} />
                                            <span className={recCls}>× = {sgd(farmRate * (Number(multiplier) || 1), 3)}/g</span>
                                        </div>
                                    </td>
                                </tr>,
                                entry.enabled && (
                                    <tr key={`${family.value}-colours`}>
                                        <td colSpan={4} className={`${td} pt-0`}>
                                            <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${family.label} colours`}>
                                                {colours.map((colour) => {
                                                    const on = !off.has(colour.name)
                                                    return (
                                                        <button key={colour.name} type="button" aria-pressed={on}
                                                            onClick={() => put(family.value, { coloursOff: on ? [...off, colour.name] : [...off].filter((n) => n !== colour.name) })}
                                                            className={`dash-hoverable inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] cursor-pointer ${
                                                                on ? 'border-[var(--dash-ink)] bg-[var(--dash-card)]' : 'border-[var(--dash-line)] bg-[var(--dash-canvas)] dash-soft line-through'}`}>
                                                            <span aria-hidden="true" className="h-3 w-3 rounded-full border border-[var(--dash-line)]" style={{ backgroundColor: colour.hex }} />
                                                            {colour.name}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </td>
                                    </tr>
                                ),
                            ]
                        })}
                    </tbody>
                </table>
            </div>
            <p className="text-[12px] dash-soft mt-3">
                Colours follow the recommended catalogue; tap a colour to stop offering it. Your price multiplies your material rate.
            </p>
        </DashCard>
    )
}

function SampleCard({ profile, fitProfile }) {
    const filament = profile.materials.some((item) => item.filament === 'pla') ? 'pla' : profile.materials[0]?.filament
    const quote = filament ? samplePartQuote(profile, filament) : null
    const fitQuote = samplePartQuote(fitProfile, filament || 'pla')
    const line = (key) => quote?.lines.find((item) => item.key === key)?.amount || 0
    const label = FILAMENTS.find((item) => item.value === filament)?.label || 'PLA'
    const { length, width, height } = SAMPLE_PART.metrics.dimensionsCm
    const sampleSize = [length, width, height].map((cm) => Math.round(cm * 10)).join('×')
    return (
        <DashCard title="What a customer would pay">
            <p className="text-[12px] dash-soft mb-2">{SAMPLE_PART.name} · {SAMPLE_PART.metrics.volumeCm3} cm³ · 80×42×18 mm · {label} · Normal · Medium</p>
            {quote ? (
                <ul className="flex flex-col gap-1 text-[13px]" aria-label="Sample price">
                    <li className="flex justify-between gap-3"><span className="dash-soft">Material, {Math.round(quote.inputs.weightGrams)} g</span><span className="font-mono">{sgd(line('material'))}</span></li>
                    <li className="flex justify-between gap-3"><span className="dash-soft">Printing, {quote.inputs.printHours.toFixed(1)} h</span><span className="font-mono">{sgd(line('printTime'))}</span></li>
                    <li className="flex justify-between gap-3"><span className="dash-soft">Setup</span><span className="font-mono">{sgd(line('baseFee'))}</span></li>
                    {quote.minimumApplied && <li className="flex justify-between gap-3"><span className="dash-soft">Minimum order</span><span className="font-mono">{sgd(profile.rates.minimumPrice)}</span></li>}
                    <li className="flex justify-between gap-3 border-t border-dashed border-[var(--dash-line)] pt-1.5 mt-1 font-semibold">
                        <span>Total (collect)</span><span className="font-mono" data-testid="sample-total">{sgd(quote.total)}</span>
                    </li>
                </ul>
            ) : <p className="dash-data dash-soft">Offer at least one material to see a price.</p>}
            {fitQuote && (
                <p className="text-[12px] dash-soft mt-3" data-testid="sample-fit">
                    Fix It Today would charge {sgd(fitQuote.total)} for the same part.
                </p>
            )}
        </DashCard>
    )
}

/**
 * @param {object} props
 * @param {object} props.recommended - GET /api/user/print-service `recommended`
 * @param {object} props.pricing - the draft farm pricing ({ overrides, materials, delivery })
 * @param {number} props.leadTimeDays
 * @param {(next: object) => void} props.onChange
 */
export default function PrintFarmPricing({ recommended, pricing, leadTimeDays, onChange }) {
    const recommendedDelivery = useMemo(() => recommended?.deliveryOptions || [], [recommended])
    const profile = useMemo(() => resolveFarmPricing({ recommended, service: { pricing, leadTimeDays }, recommendedDelivery }),
        [recommended, pricing, leadTimeDays, recommendedDelivery])
    const fitProfile = useMemo(() => resolveFarmPricing({ recommended, recommendedDelivery }), [recommended, recommendedDelivery])
    const recommendedRates = recommended?.quotingConfig || {}
    return (
        <div className="flex flex-col gap-4" aria-label="Pricing">
            <div>
                <h2 className="dash-section">Pricing</h2>
                <p className="dash-data dash-soft mt-1 max-w-[70ch]">
                    Fix It Today&apos;s numbers are the recommended starting point. Override only what differs for your farm;
                    everything else follows the recommendation, including future updates. Customers see an estimate and you confirm the final price.
                </p>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                <div className="flex flex-col gap-4">
                    <DashCard title="Rates and fees" action={
                        <button type="button" className={pillBtn} onClick={() => onChange({ ...pricing, overrides: {} })}>Use all recommended</button>
                    }>
                        <OverrideTable rows={RATE_ROWS} group="rates" recommendedValues={recommendedRates} pricing={pricing} onChange={onChange} />
                        <p className="text-[12px] dash-soft mt-3">Rush and priority are offered to your customers only when you set those fees here.</p>
                    </DashCard>
                    <DashCard title="Printer speed">
                        <OverrideTable rows={SPEED_ROWS} group="time" recommendedValues={recommendedRates.timeModel} pricing={pricing} onChange={onChange} />
                    </DashCard>
                    <DashCard title="Machine limits">
                        <OverrideTable rows={LIMIT_ROWS} group="limits" recommendedValues={recommended?.machineLimits} pricing={pricing} onChange={onChange} />
                    </DashCard>
                </div>
                <div className="flex flex-col gap-4">
                    <MaterialsCard recommended={recommended} pricing={pricing} profile={profile} onChange={onChange} />
                    <SampleCard profile={profile} fitProfile={fitProfile} />
                    <DeliveryCard recommended={recommended} pricing={pricing} onChange={onChange} />
                </div>
            </div>
        </div>
    )
}
