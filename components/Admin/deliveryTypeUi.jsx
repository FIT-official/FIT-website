'use client'
import { TbBolt, TbBuildingStore, TbDownload, TbTruck, TbWorld } from 'react-icons/tb'

/**
 * Shared presentation helpers for the Delivery panel (blueprint §5.14).
 * One icon family (Tb) for the delivery context (§4.6); every colour goes
 * through a --dash-* token; numerals use the dash-data tabular style (§4.2).
 */

export const sunBtnCls =
    'dash-hoverable rounded-full px-4 py-2 text-[13px] font-medium bg-[var(--dash-sun)] text-[var(--dash-ink)] cursor-pointer hover:bg-[var(--dash-sun-deep)] active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed'

const ICONS = {
    download: TbDownload,
    express: TbBolt,
    pickup: TbBuildingStore,
    international: TbWorld,
    truck: TbTruck,
}

/** Pick an icon key from the type's name/display name keywords. */
export function deliveryIconKey(dt = {}) {
    const hay = `${dt.name || ''} ${dt.displayName || ''}`.toLowerCase()
    if (/digital|download|email/.test(hay)) return 'download'
    if (/express|rush|same.?day|instant|priority|fast/.test(hay)) return 'express'
    if (/pick.?up|collect|store/.test(hay)) return 'pickup'
    if (/international|global|world|overseas|abroad/.test(hay)) return 'international'
    return 'truck'
}

export function DeliveryTypeIcon({ dt, size = 18 }) {
    const key = deliveryIconKey(dt)
    const Icon = ICONS[key]
    return (
        <span
            data-icon={key}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--dash-line)] bg-[var(--dash-canvas)] text-[var(--dash-ink)]"
        >
            <Icon size={size} aria-hidden="true" />
        </span>
    )
}

/** Money always 2 decimals (§4.2 numerals law). */
export const fmtMoney = (v) => `$${Number(v).toFixed(2)}`

/** Per-unit rates keep their precision (0.001 stays $0.001, never $0.00). */
export const fmtRate = (v) => `$${parseFloat(Number(v).toFixed(6))}`

export const hasValue = (v) => v !== '' && v != null && !Number.isNaN(Number(v))

/**
 * creator = no base price stored (creators price it per product),
 * free = a formula whose every term is zero, formula = everything else.
 */
export function pricingMode(bp) {
    if (!bp || bp.basePrice == null || bp.basePrice === '') return 'creator'
    if (
        Number(bp.basePrice) === 0 &&
        Number(bp.volumeFactor || 0) === 0 &&
        Number(bp.weightFactor || 0) === 0
    ) {
        return 'free'
    }
    return 'formula'
}

/** One-line formula, e.g. "$9.90 base + $0.01/cm³ + $0.005/g". */
export function formulaLine(bp) {
    const parts = [`${fmtMoney(bp.basePrice)} base`]
    if (Number(bp.volumeFactor) > 0) parts.push(`${fmtRate(bp.volumeFactor)}/cm³`)
    if (Number(bp.weightFactor) > 0) parts.push(`${fmtRate(bp.weightFactor)}/g`)
    return parts.join(' + ')
}

/** Small bounded chips: minimum and maximum configured prices. */
export function boundChips(bp) {
    const chips = []
    if (hasValue(bp?.minPrice)) chips.push(`min ${fmtMoney(bp.minPrice)}`)
    if (hasValue(bp?.maxPrice)) chips.push(`max ${fmtMoney(bp.maxPrice)}`)
    return chips
}

/** Human-readable pricing summary sentence for the review step and cards. */
export function pricingSentence(bp) {
    const mode = pricingMode(bp)
    if (mode === 'creator') return 'Creators set their own delivery price for this option.'
    if (mode === 'free') return 'Zero configured rate. Shop delivery may use the existing fallback.'
    let s = `Charges ${fmtMoney(bp.basePrice)} base`
    const terms = []
    if (Number(bp.volumeFactor) > 0) terms.push(`${fmtRate(bp.volumeFactor)} per cubic cm`)
    if (Number(bp.weightFactor) > 0) terms.push(`${fmtRate(bp.weightFactor)} per gram`)
    if (terms.length) s += ` plus ${terms.join(' and ')}`
    const hasMin = hasValue(bp.minPrice)
    const hasMax = hasValue(bp.maxPrice)
    if (hasMin && hasMax) s += `, never less than ${fmtMoney(bp.minPrice)} or more than ${fmtMoney(bp.maxPrice)}`
    else if (hasMin) s += `, never less than ${fmtMoney(bp.minPrice)}`
    else if (hasMax) s += `, never more than ${fmtMoney(bp.maxPrice)}`
    return `${s}.`
}

/** Formula price for a given parcel, clamped to the min/max bounds. */
export const clampPrice = (bp, volume, weight) => {
    const raw =
        parseFloat(bp.basePrice) + volume * parseFloat(bp.volumeFactor) + weight * parseFloat(bp.weightFactor)
    const minPrice = parseFloat(bp.minPrice) || 0
    const maxPrice = isNaN(parseFloat(bp.maxPrice)) ? Infinity : parseFloat(bp.maxPrice)
    return Math.max(minPrice, Math.min(maxPrice, raw))
}

/**
 * Compact pricing presentation for list cards: a one-line formula in the
 * tabular data style plus small bounded chips. Free / creator-defined types
 * get a plain sentence instead. Never a wall of label/value rows.
 */
export function PricingStrip({ basePricing }) {
    const mode = pricingMode(basePricing)
    if (mode !== 'formula') {
        return <p className="text-[13px] dash-soft">{pricingSentence(basePricing)}</p>
    }
    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="dash-data text-[var(--dash-ink)]">{formulaLine(basePricing)}</span>
            {boundChips(basePricing).map((chip) => (
                <span
                    key={chip}
                    className="dash-data rounded-full border border-[var(--dash-line)] bg-[var(--dash-canvas)] px-2 py-0.5 text-[var(--dash-ink-soft)]"
                >
                    {chip}
                </span>
            ))}
        </div>
    )
}

/**
 * The enable switch, fixed (client feedback): explicit `left-0.5` anchor so
 * the knob translates within the w-9 track (2 + 16 + 16 = 34px of 36px) and
 * the Active/Inactive label is a sibling beside the track, never under it.
 */
export function DeliverySwitch({ checked, onChange, label, className = '', ...props }) {
    return (
        <span className={`flex items-center gap-2 ${className}`}>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={label}
                onClick={onChange}
                className={`dash-hoverable relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                    checked ? 'bg-[var(--dash-ink)]' : 'bg-[var(--dash-line)]'
                }`}
                {...props}
            >
                <span
                    aria-hidden="true"
                    className={`absolute left-0.5 top-0.5 block h-4 w-4 rounded-full bg-[var(--dash-card)] transition-transform ${
                        checked ? 'translate-x-4' : 'translate-x-0'
                    }`}
                />
            </button>
            <span className="min-w-14 text-[13px] dash-soft">{checked ? 'Active' : 'Inactive'}</span>
        </span>
    )
}
