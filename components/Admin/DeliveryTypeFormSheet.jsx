'use client'
import { useEffect, useState } from 'react'
import { useToast } from '@/components/General/ToastProvider'
import { Sheet, GlassBar, DottedRow, StatusPill } from '@/components/dashboard-ui'
import { inputCls, quietBtnCls } from '@/components/DashboardComponents/ProductFormFields/dashFormUi'
import { clampPrice, pricingSentence, sunBtnCls } from './deliveryTypeUi'

/**
 * Stepped create/edit flow for delivery types (client feedback: the single
 * long form was info overload). One small field group per step, plain-language
 * helper copy, Back/Next, and a human-readable review before saving. All
 * fields and validation from the legacy form are preserved; this is a
 * relocation, not a schema change.
 */

const TYPE_LABELS = { shop: 'Shop', print: 'Print' }

const STEPS = [
    { title: 'Name', blurb: 'Give this delivery option a name customers will recognise at checkout.' },
    { title: 'Pricing', blurb: 'The price starts at a base fee. Bigger and heavier parcels can add a little on top.' },
    { title: 'Bounds', blurb: 'Optional guard rails so the formula never surprises anyone. Skip any you do not need.' },
    { title: 'Review', blurb: 'Check the summary below. You can go back and change anything.' },
]

const PREVIEW_PRESETS = [
    { volume: 1000, weight: 100, label: 'Small item (1000 cm³, 100 g)' },
    { volume: 5000, weight: 500, label: 'Medium item (5000 cm³, 500 g)' },
    { volume: 10000, weight: 1000, label: 'Large item (10000 cm³, 1000 g)' },
]

const filled = (v) => v !== '' && v != null

export default function DeliveryTypeFormSheet({ open, onClose, editing, formData, setFormData, saving, onSubmit }) {
    const [step, setStep] = useState(0)
    const [customExample, setCustomExample] = useState({ volume: '', weight: '' })
    const { showToast } = useToast()

    useEffect(() => {
        if (open) {
            setStep(0)
            setCustomExample({ volume: '', weight: '' })
        }
    }, [open])

    const bp = formData.basePricing

    // Same rules as the legacy single-form validation, checked per step so
    // the user is corrected at the step that owns the field.
    const validateStep = (s) => {
        if (s === 0) {
            if (!formData.name || !formData.displayName || formData.applicableToProductTypes.length === 0) {
                return 'Please fill in all required fields'
            }
        }
        if (s === 1) {
            const anyCharge = [bp.basePrice, bp.volumeFactor, bp.weightFactor].some(filled)
            if (anyCharge) {
                const trio = [parseFloat(bp.basePrice), parseFloat(bp.volumeFactor), parseFloat(bp.weightFactor)]
                if (trio.some((v) => isNaN(v) || v < 0)) {
                    return 'Base price, volume factor, and weight factor must be non-negative numbers'
                }
            }
        }
        if (s === 2) {
            if (filled(bp.minPrice) || filled(bp.maxPrice)) {
                const trio = [parseFloat(bp.basePrice), parseFloat(bp.volumeFactor), parseFloat(bp.weightFactor)]
                if (trio.some((v) => isNaN(v) || v < 0)) {
                    return 'Base price, volume factor, and weight factor must be non-negative numbers'
                }
                const min = parseFloat(bp.minPrice)
                const max = parseFloat(bp.maxPrice)
                if (!isNaN(min) && !isNaN(max) && min > max) {
                    return 'Minimum price cannot exceed maximum price'
                }
            }
        }
        return null
    }

    const goNext = () => {
        const err = validateStep(step)
        if (err) {
            showToast(err, 'error')
            return
        }
        setStep((s) => Math.min(s + 1, STEPS.length - 1))
    }

    const handleFormSubmit = (e) => {
        // Enter mid-flow advances instead of submitting a half-reviewed form.
        if (step < STEPS.length - 1) {
            e.preventDefault()
            goNext()
            return
        }
        onSubmit(e)
    }

    const setBp = (key, value) =>
        setFormData((prev) => ({ ...prev, basePricing: { ...prev.basePricing, [key]: value } }))

    const numberField = (label, key, { placeholder, step: inputStep, help }) => (
        <div className="flex flex-col gap-1.5">
            <label htmlFor={`bp-${key}`} className="text-[13px] font-medium text-[var(--dash-ink)]">{label}</label>
            <input
                id={`bp-${key}`}
                type="number"
                value={bp[key]}
                onChange={(e) => setBp(key, e.target.value)}
                className={`${inputCls()} text-right dash-data`}
                placeholder={placeholder}
                min="0"
                step={inputStep}
            />
            <span className="text-[13px] dash-soft">{help}</span>
        </div>
    )

    const previewReady = bp.basePrice && bp.volumeFactor && bp.weightFactor

    return (
        <Sheet
            open={open}
            onClose={onClose}
            label={editing ? 'Edit delivery type' : 'New delivery type'}
            widthClass="max-w-xl"
        >
            <form onSubmit={handleFormSubmit} className="p-4 flex flex-col gap-4">
                <GlassBar className="flex-wrap">
                    <h3 className="dash-section">{editing ? 'Edit Delivery Type' : 'New Delivery Type'}</h3>
                    <button type="button" onClick={onClose} className={`${quietBtnCls} ml-auto`} disabled={saving}>
                        Cancel
                    </button>
                </GlassBar>

                {/* Small numbered steps */}
                <ol className="flex flex-wrap items-center gap-2" aria-label="Steps">
                    {STEPS.map((s, i) => (
                        <li key={s.title} aria-current={i === step ? 'step' : undefined} className="flex items-center gap-2">
                            <span
                                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium ${
                                    i === step
                                        ? 'bg-[var(--dash-ink)] text-[var(--dash-canvas)]'
                                        : i < step
                                            ? 'border border-[var(--dash-ink)] text-[var(--dash-ink)]'
                                            : 'border border-[var(--dash-line)] text-[var(--dash-ink-soft)]'
                                }`}
                            >
                                {i + 1}
                            </span>
                            <span className={`text-[11px] font-medium ${i === step ? 'text-[var(--dash-ink)]' : 'dash-soft'}`}>
                                {s.title}
                            </span>
                            {i < STEPS.length - 1 && <span className="h-px w-4 bg-[var(--dash-line)]" aria-hidden="true" />}
                        </li>
                    ))}
                </ol>

                <p className="text-[13px] dash-soft">{STEPS[step].blurb}</p>

                {/* Step 1: name and description */}
                {step === 0 && (
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="dt-displayName" className="text-[13px] font-medium text-[var(--dash-ink)]">Display Name*</label>
                            <input
                                id="dt-displayName"
                                type="text"
                                value={formData.displayName}
                                onChange={(e) => setFormData((prev) => ({ ...prev, displayName: e.target.value }))}
                                className={inputCls()}
                                placeholder="Premium Delivery"
                            />
                            <span className="text-[13px] dash-soft">This is what customers see</span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="dt-name" className="text-[13px] font-medium text-[var(--dash-ink)]">URL Name*</label>
                            <input
                                id="dt-name"
                                type="text"
                                value={formData.name}
                                onChange={(e) =>
                                    setFormData((prev) => ({ ...prev, name: e.target.value.toLowerCase().replace(/\s+/g, '-') }))
                                }
                                className={inputCls()}
                                placeholder="premium-delivery"
                            />
                            <span className="text-[13px] dash-soft">A short technical id. Lowercase, no spaces</span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="dt-description" className="text-[13px] font-medium text-[var(--dash-ink)]">Description</label>
                            <textarea
                                id="dt-description"
                                value={formData.description}
                                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                                className={`${inputCls()} resize-none`}
                                placeholder="Optional notes, like pickup location or estimated delivery time"
                                rows={2}
                            />
                            <span className="text-[13px] dash-soft">Optional. Creators can customize this per product</span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <span className="text-[13px] font-medium text-[var(--dash-ink)]">Applicable To*</span>
                            <div className="flex gap-4">
                                {['shop', 'print'].map((type) => (
                                    <label key={type} className="flex items-center gap-2 text-[13px] dash-soft cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="accent-[var(--dash-ink)]"
                                            checked={formData.applicableToProductTypes.includes(type)}
                                            onChange={(e) => {
                                                const checked = e.target.checked
                                                setFormData((prev) => ({
                                                    ...prev,
                                                    applicableToProductTypes: checked
                                                        ? [...prev.applicableToProductTypes, type]
                                                        : prev.applicableToProductTypes.filter((t) => t !== type),
                                                }))
                                            }}
                                        />
                                        {TYPE_LABELS[type]} Products
                                    </label>
                                ))}
                            </div>
                            <span className="text-[13px] dash-soft">Pick where this delivery option can be offered</span>
                        </div>
                    </div>
                )}

                {/* Step 2: how it charges */}
                {step === 1 && (
                    <div className="flex flex-col gap-4">
                        {numberField('Base Price ($)', 'basePrice', {
                            placeholder: '5.00',
                            step: '0.01',
                            help: 'A flat fee every delivery starts from',
                        })}
                        {numberField('Volume Factor ($/cm³)', 'volumeFactor', {
                            placeholder: '0.001',
                            step: '0.0001',
                            help: 'Adds this much for every cubic cm of the parcel',
                        })}
                        {numberField('Weight Factor ($/g)', 'weightFactor', {
                            placeholder: '0.01',
                            step: '0.001',
                            help: 'Adds this much for every gram of weight',
                        })}
                        <p className="text-[13px] dash-soft">
                            Leave these fields empty to let creators set their own price. Zero configured rates remain subject to the existing shop delivery fallback.
                        </p>
                    </div>
                )}

                {/* Step 3: bounds */}
                {step === 2 && (
                    <div className="flex flex-col gap-4">
                        {numberField('Minimum Price ($)', 'minPrice', {
                            placeholder: '5.00',
                            step: '0.01',
                            help: 'The price never drops below this',
                        })}
                        {numberField('Maximum Price ($)', 'maxPrice', {
                            placeholder: '50.00',
                            step: '0.01',
                            help: 'The price never goes above this',
                        })}
                    </div>
                )}

                {/* Step 4: review */}
                {step === 3 && (
                    <div className="flex flex-col gap-4">
                        <div>
                            <p className="dash-label mb-1">Summary</p>
                            <p className="text-[14px] text-[var(--dash-ink)]">{pricingSentence(bp)}</p>
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                                <span className="text-[13px] font-medium text-[var(--dash-ink)]">
                                    {formData.displayName || 'Unnamed'}
                                </span>
                                <span className="dash-data rounded-full border border-[var(--dash-line)] bg-[var(--dash-canvas)] px-2 py-0.5 text-[var(--dash-ink-soft)]">
                                    {formData.name || 'no-url-name'}
                                </span>
                                {formData.applicableToProductTypes.map((type) => (
                                    <StatusPill key={type} tone="paper">{TYPE_LABELS[type] || type}</StatusPill>
                                ))}
                            </div>
                        </div>

                        {previewReady && (
                            <div className="rounded-[var(--dash-r-inner)] border border-[var(--dash-line)] bg-[var(--dash-card)] p-4">
                                <p className="dash-label mb-2">Example Calculations</p>
                                <div className="flex flex-col">
                                    {PREVIEW_PRESETS.map((example) => (
                                        <DottedRow key={example.label} label={example.label}>
                                            ${clampPrice(bp, example.volume, example.weight).toFixed(2)}
                                        </DottedRow>
                                    ))}
                                </div>

                                <div className="mt-3 border-t border-[var(--dash-line)] pt-3">
                                    <p className="dash-label mb-2">Test Your Own Example</p>
                                    <div className="flex gap-2">
                                        <input
                                            type="number"
                                            value={customExample.volume}
                                            onChange={(e) => setCustomExample((prev) => ({ ...prev, volume: e.target.value }))}
                                            className={`${inputCls()} text-right dash-data`}
                                            placeholder="Volume (cm³)"
                                            aria-label="Volume (cm³)"
                                            min="0"
                                            step="1"
                                        />
                                        <input
                                            type="number"
                                            value={customExample.weight}
                                            onChange={(e) => setCustomExample((prev) => ({ ...prev, weight: e.target.value }))}
                                            className={`${inputCls()} text-right dash-data`}
                                            placeholder="Weight (g)"
                                            aria-label="Weight (g)"
                                            min="0"
                                            step="1"
                                        />
                                    </div>
                                    <div className="mt-2">
                                        {(() => {
                                            const volume = parseFloat(customExample.volume)
                                            const weight = parseFloat(customExample.weight)
                                            if (
                                                isNaN(parseFloat(bp.basePrice)) || isNaN(parseFloat(bp.volumeFactor)) ||
                                                isNaN(parseFloat(bp.weightFactor)) || isNaN(volume) || isNaN(weight)
                                            ) {
                                                return <p className="text-[13px] dash-soft">Enter volume and weight to preview</p>
                                            }
                                            return (
                                                <DottedRow label="Calculated price">
                                                    ${clampPrice(bp, volume, weight).toFixed(2)}
                                                </DottedRow>
                                            )
                                        })()}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Back / Next / Save */}
                <div className="flex items-center justify-between border-t border-[var(--dash-line)] pt-4">
                    <button
                        type="button"
                        onClick={() => setStep((s) => Math.max(s - 1, 0))}
                        className={`${quietBtnCls} ${step === 0 ? 'invisible' : ''}`}
                        disabled={saving}
                    >
                        Back
                    </button>
                    {step < STEPS.length - 1 ? (
                        <button type="button" onClick={goNext} className={sunBtnCls}>
                            Next
                        </button>
                    ) : (
                        <button type="submit" disabled={saving} className={sunBtnCls}>
                            {saving
                                ? (editing ? 'Saving…' : 'Adding…')
                                : (editing ? 'Save Changes' : 'Add Delivery Type')}
                        </button>
                    )}
                </div>
            </form>
        </Sheet>
    )
}
