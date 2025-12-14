import React from 'react'
import SelectField from '../SelectField'
import FieldErrorBanner from './FieldErrorBanner'
import { BsPlus } from 'react-icons/bs'
import { BiMinus } from 'react-icons/bi'

export default function DiscountsField({ form, setForm, events }) {
    const showDiscount = !!form.showDiscount

    // Determine if this form supports stacked discounts (ProductForm) or single
    const supportsStacking = Array.isArray(form.discounts)

    // Build a working array of discount rules
    const discounts = supportsStacking
        ? (form.discounts || [])
        : (showDiscount && (form.discount && Object.keys(form.discount).length > 0)
            ? [form.discount]
            : [])

    // Helper to keep primary `discount` in sync with first rule (for legacy users)
    const syncPrimaryDiscount = (f, rules) => {
        const primary = rules[0] || {
            eventId: "",
            percentage: "",
            minimumPrice: "",
            startDate: "",
            endDate: "",
            tiers: [],
        }
        return {
            ...f,
            discount: primary,
        }
    }

    const setDiscounts = (updater) => {
        setForm(f => {
            const current = supportsStacking
                ? (f.discounts || [])
                : (f.showDiscount && f.discount ? [f.discount] : [])
            const next = typeof updater === 'function' ? updater(current) : updater

            if (!supportsStacking) {
                // Single-discount contexts (e.g. custom print) only use the first rule
                const first = next[0] || {
                    eventId: "",
                    percentage: "",
                    minimumPrice: "",
                    startDate: "",
                    endDate: "",
                    tiers: [],
                }
                return {
                    ...f,
                    showDiscount: next.length > 0,
                    discount: first,
                }
            }

            return {
                ...syncPrimaryDiscount(f, next),
                showDiscount: next.length > 0,
                discounts: next,
            }
        })
    }

    const addDiscountRule = () => {
        if (!supportsStacking) {
            // Fallback: behave like legacy single-discount toggle
            setForm(f => ({
                ...f,
                showDiscount: true,
                discount: f.discount || {
                    eventId: "",
                    percentage: "",
                    minimumPrice: "",
                    startDate: "",
                    endDate: "",
                    tiers: [],
                },
            }))
            return
        }

        setDiscounts(prev => ([
            ...prev,
            {
                eventId: "",
                percentage: "",
                minimumPrice: "",
                startDate: "",
                endDate: "",
                tiers: [],
            },
        ]))
    }

    const updateRuleField = (index, field, value) => {
        setDiscounts(prev => {
            const next = prev.slice()
            const rule = next[index] || {}
            next[index] = { ...rule, [field]: value }
            return next
        })
    }

    const updateTier = (ruleIndex, tierIndex, field, value) => {
        setDiscounts(prev => {
            const next = prev.slice()
            const rule = next[ruleIndex] || {}
            const currentTiers = Array.isArray(rule.tiers) ? rule.tiers.slice() : []
            const tier = currentTiers[tierIndex] || { minQty: '', maxQty: '', percentage: '' }
            currentTiers[tierIndex] = { ...tier, [field]: value }
            next[ruleIndex] = { ...rule, tiers: currentTiers }
            return next
        })
    }

    const addTier = (ruleIndex) => {
        setDiscounts(prev => {
            const next = prev.slice()
            const rule = next[ruleIndex] || {}
            const currentTiers = Array.isArray(rule.tiers) ? rule.tiers.slice() : []
            currentTiers.push({ minQty: '', maxQty: '', percentage: '' })
            next[ruleIndex] = { ...rule, tiers: currentTiers }
            return next
        })
    }

    const removeTier = (ruleIndex, tierIndex) => {
        setDiscounts(prev => {
            const next = prev.slice()
            const rule = next[ruleIndex] || {}
            const currentTiers = Array.isArray(rule.tiers) ? rule.tiers.slice() : []
            currentTiers.splice(tierIndex, 1)
            next[ruleIndex] = { ...rule, tiers: currentTiers }
            return next
        })
    }

    const removeRule = (index) => {
        if (!supportsStacking) {
            // Legacy single-discount: just clear
            setForm(f => ({
                ...f,
                showDiscount: false,
                discount: {
                    eventId: "",
                    percentage: "",
                    minimumPrice: "",
                    startDate: "",
                    endDate: "",
                },
            }))
            return
        }

        setDiscounts(prev => {
            const next = prev.slice()
            next.splice(index, 1)
            return next
        })
    }

    // Compute validation flags across all rules
    const ruleValidation = discounts.map(rule => {
        const hasEvent = !!rule.eventId
        const percentageNum = Number(rule.percentage)
        const minimumNum = Number(rule.minimumPrice)
        const startDate = rule.startDate ? new Date(rule.startDate) : null
        const endDate = rule.endDate ? new Date(rule.endDate) : null

        const percentageInvalid = !hasEvent && (Number.isNaN(percentageNum) || percentageNum <= 0 || percentageNum > 100)
        const minimumInvalid = !hasEvent && (!Number.isNaN(minimumNum) && minimumNum < 0)
        const datesInvalid = !hasEvent && !!startDate && !!endDate && startDate > endDate

        return { percentageInvalid, minimumInvalid, datesInvalid }
    })

    const hasDiscountErrors = ruleValidation.some(r => r.percentageInvalid || r.minimumInvalid || r.datesInvalid)

    return (
        <div className="flex flex-col gap-2 w-full">
            <label className="formLabel">Discounts</label>
            <p className="text-[11px] text-lightColor/80 mb-1">
                Set a <span className="font-semibold">general discount</span> below. It applies to all
                orders that meet the minimum amount, unless the order quantity falls into one of the
                volume discount tiers you configure.
            </p>
            <button
                type="button"
                className="formButton"
                onClick={addDiscountRule}
                disabled={supportsStacking ? false : showDiscount}
            >
                Add Discount
                <BsPlus className="ml-2" size={20} />
            </button>

            {showDiscount && discounts.length > 0 && (
                <div className="flex flex-col gap-3 bg-baseColor border border-extraLight p-4 rounded-sm my-3">
                    {hasDiscountErrors && (
                        <FieldErrorBanner
                            title="Discount details need attention"
                            message={"Check each discount card for percentage, minimum amount, and date range."}
                        />
                    )}

                    {discounts.map((rule, idx) => {
                        const { percentageInvalid, minimumInvalid, datesInvalid } = ruleValidation[idx] || {}
                        const tiers = Array.isArray(rule.tiers) ? rule.tiers : []

                        return (
                            <div
                                key={idx}
                                className="flex flex-col gap-2 bg-white/40 border border-borderColor/60 rounded-sm p-3"
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-semibold">
                                        Discount {idx + 1}
                                    </span>
                                    <button
                                        type="button"
                                        className="toggleXbutton px-2 py-1 flex items-center gap-1 text-[11px]"
                                        onClick={() => removeRule(idx)}
                                    >
                                        <BiMinus size={12} />
                                        Remove
                                    </button>
                                </div>

                                {events && events.length > 0 && (
                                    <div className="flex flex-col gap-1">
                                        <SelectField
                                            onChangeFunction={e => updateRuleField(idx, 'eventId', e.target.value)}
                                            value={rule.eventId || ""}
                                            name={`eventId-${idx}`}
                                            label="Event"
                                            options={[{ value: "", label: "None" }, ...events.map(ev => ({ value: ev._id, label: `${ev.name} (${ev.percentage}% off)` }))]}
                                        />
                                    </div>
                                )}

                                <div className="flex flex-col gap-1">
                                    <label className="formLabel">Discount Percentage (%)</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={100}
                                        value={rule.percentage ?? ""}
                                        onChange={e => updateRuleField(idx, 'percentage', e.target.value)}
                                        className={`formInput ${percentageInvalid ? 'border-2 border-red-500 focus:border-red-500' : ''}`}
                                        placeholder="e.g. 10"
                                        required={!rule.eventId}
                                    />
                                    <p className="text-[11px] text-lightColor/80 mt-0.5">
                                        General discount for this rule, applied per item when no
                                        volume tier in this card matches the order quantity.
                                    </p>
                                </div>

                                <div className="flex flex-col gap-1">
                                    <label className="formLabel">Minimum Amount</label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={rule.minimumPrice ?? ""}
                                        step="0.01"
                                        onChange={e => updateRuleField(idx, 'minimumPrice', e.target.value)}
                                        className={`formInput ${minimumInvalid ? 'border-2 border-red-500 focus:border-red-500' : ''}`}
                                        placeholder="e.g. 50"
                                        required={!rule.eventId}
                                    />
                                    <p className="text-[11px] text-lightColor/80 mt-0.5">
                                        Order total (before discount) must meet this amount for this
                                        specific discount card to apply.
                                    </p>
                                </div>

                                <div className="flex flex-col gap-1">
                                    <label className="formLabel">Start Date</label>
                                    <input
                                        type="date"
                                        value={rule.startDate || ""}
                                        onChange={e => updateRuleField(idx, 'startDate', e.target.value)}
                                        className={`formInput ${datesInvalid ? 'border-2 border-red-500 focus:border-red-500' : ''}`}
                                        required={!rule.eventId}
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="formLabel">End Date</label>
                                    <input
                                        type="date"
                                        value={rule.endDate || ""}
                                        onChange={e => updateRuleField(idx, 'endDate', e.target.value)}
                                        className={`formInput ${datesInvalid ? 'border-2 border-red-500 focus:border-red-500' : ''}`}
                                        required={!rule.eventId}
                                    />
                                </div>

                                <div className="flex flex-col gap-2 mt-3">
                                    <div className="flex items-center justify-between">
                                        <span className="formLabel">Volume Discounts (by quantity)</span>
                                        <button
                                            type="button"
                                            className="formButton text-xs px-3 py-1"
                                            onClick={() => addTier(idx)}
                                        >
                                            Add Tier
                                            <BsPlus className="ml-1" size={16} />
                                        </button>
                                    </div>
                                    {tiers.length > 0 && (
                                        <div className="flex flex-col gap-2">
                                            {tiers.map((tier, tierIdx) => (
                                                <div key={tierIdx} className="grid grid-cols-3 gap-2 items-end bg-white p-2 rounded border border-borderColor/40">
                                                    <div className="flex flex-col gap-1">
                                                        <label className="text-[11px] font-medium text-lightColor">Min qty</label>
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            value={tier.minQty ?? ''}
                                                            onChange={e => updateTier(idx, tierIdx, 'minQty', e.target.value)}
                                                            className="formInput text-xs"
                                                            placeholder="e.g. 10"
                                                        />
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                        <label className="text-[11px] font-medium text-lightColor">Max qty</label>
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            value={tier.maxQty ?? ''}
                                                            onChange={e => updateTier(idx, tierIdx, 'maxQty', e.target.value)}
                                                            className="formInput text-xs"
                                                            placeholder="e.g. 20 (leave blank for no upper limit)"
                                                        />
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                        <label className="text-[11px] font-medium text-lightColor">% off</label>
                                                        <div className="flex gap-1">
                                                            <input
                                                                type="number"
                                                                min={1}
                                                                max={100}
                                                                value={tier.percentage ?? ''}
                                                                onChange={e => updateTier(idx, tierIdx, 'percentage', e.target.value)}
                                                                className="formInput text-xs flex-1"
                                                                placeholder="e.g. 2"
                                                            />
                                                            <button
                                                                type="button"
                                                                className="toggleXbutton px-2 py-1 flex items-center justify-center"
                                                                onClick={() => removeTier(idx, tierIdx)}
                                                            >
                                                                <BiMinus size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <p className="text-[11px] text-lightColor/80">
                                        Example: general discount 5% with minimum S$25, plus tiers
                                        like 10-20 items 20% off. Orders within a tier use that
                                        tier's percentage; other quantities that meet the minimum
                                        still get the card's general discount.
                                    </p>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
