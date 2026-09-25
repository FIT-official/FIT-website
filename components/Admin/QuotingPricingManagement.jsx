'use client'
import { useEffect, useState } from 'react'
import { useToast } from '@/components/General/ToastProvider'
import { DashCard, ViewTabs, GlassBar, SkeletonRow, CoachMarks, useTourOffer, TourOfferStrip, TourHelpButton, TOURS, ComingSoon } from '@/components/dashboard-ui'
import { inputCls, quietBtnCls, DashSelect } from '@/components/DashboardComponents/ProductFormFields/dashFormUi'
import { useUrlSub } from './dashPanelUi'

// Rate-card metadata (blueprint §5.14 + §9.3): label + one-line help + unit
// suffix per knob. The PUT payload iterates NUMERIC_KEYS below so the saved
// shape (and key order) stays byte-identical to the legacy panel.
const RATE_FIELDS = [
    { key: 'materialRatePerGram', label: 'Material rate', help: 'What you charge for material used.', unit: '$ / gram', step: '0.001' },
    { key: 'printTimeRatePerHour', label: 'Print time rate', help: 'Machine time, charged per estimated print hour.', unit: '$ / hour', step: '0.5' },
    { key: 'minimumPrice', label: 'Minimum price', help: 'No quote ever totals below this.', unit: '$', step: '0.5' },
]

const FEE_FIELDS = [
    { key: 'baseFee', label: 'Base fee', help: 'Flat fee added to every quote.', unit: '$', step: '0.5' },
    { key: 'postProcessingFee', label: 'Post-processing fee', help: 'Added when a request needs post-processing.', unit: '$', step: '0.5' },
    { key: 'specialRequestFee', label: 'Special request fee', help: 'Added when a request carries special instructions.', unit: '$', step: '0.5' },
    { key: 'priorityFee', label: 'Priority fee', help: 'Added when a customer picks priority handling.', unit: '$', step: '0.5' },
]

// Rush surcharges — which value fields show depends on the expedite mode.
const RUSH_FIELDS = [
    { key: 'expediteSurchargePercent', label: 'Expedite surcharge (percent)', help: 'Percentage added to the subtotal on expedited orders.', unit: '%', step: '1', modes: ['percent', 'greater'] },
    { key: 'expediteSurchargeFlat', label: 'Expedite surcharge (flat)', help: 'Fixed amount added on expedited orders.', unit: '$', step: '1', modes: ['flat', 'greater'] },
]

// Original save order — the PUT body's quotingConfig keys must not reorder.
const NUMERIC_KEYS = [
    'materialRatePerGram',
    'printTimeRatePerHour',
    'baseFee',
    'postProcessingFee',
    'specialRequestFee',
    'priorityFee',
    'expediteSurchargePercent',
    'expediteSurchargeFlat',
    'minimumPrice',
]

const LIMIT_FIELDS = [
    { key: 'maxLengthCm', label: 'Max length', unit: 'cm' },
    { key: 'maxWidthCm', label: 'Max width', unit: 'cm' },
    { key: 'maxHeightCm', label: 'Max height', unit: 'cm' },
    { key: 'maxWeightKg', label: 'Max weight', unit: 'kg' },
]

// Guided questions for tuning the print-time estimate to the actual machines.
// Each answers one knob of the time model; defaults apply when left empty.
const TIME_MODEL_QUESTIONS = [
    {
        key: 'baseFlowCm3PerHour',
        question: 'How much material does a typical print use per hour?',
        help: 'Pick a recent 0.2mm-layer print: material used (cm³) ÷ hours it took. Mid-range FDM printers manage 8–15 cm³/h.',
        unit: 'cm³ / hour', step: '0.5',
    },
    {
        key: 'layerHeightRefMm',
        question: 'What layer height was that print sliced at?',
        help: 'The speed above is tied to this layer height; thinner layers are estimated proportionally slower.',
        unit: 'mm', step: '0.05',
    },
    {
        key: 'supportTimeFactor',
        question: 'How much longer do prints with supports take?',
        help: 'As a multiplier: 1.25 means 25% longer. Compare a supported vs unsupported print of similar size.',
        unit: '× multiplier', step: '0.05',
    },
    {
        key: 'wallTimeFactorPerLoop',
        question: 'How much does each extra wall loop add?',
        help: 'As a fraction per loop: 0.08 means each wall loop adds ~8% time.',
        unit: 'fraction / loop', step: '0.01',
    },
    {
        key: 'minHours',
        question: 'What is the minimum machine time you bill?',
        help: 'Tiny models never estimate below this (covers setup, heat-up, handling).',
        unit: 'hours', step: '0.05',
    },
]

// Sub-views (§9.3 — one job per screen).
const TABS = [
    { key: 'rates', label: 'Rates' },
    { key: 'fees', label: 'Fees & rush' },
    { key: 'speed', label: 'Machine speed' },
    { key: 'limits', label: 'Limits' },
    { key: 'colours', label: 'Colours' },
]

const sunBtnCls =
    'dash-hoverable rounded-full px-4 py-1.5 text-[13px] font-medium bg-[var(--dash-sun)] text-[var(--dash-ink)] cursor-pointer hover:bg-[var(--dash-sun-deep)] active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed'

// One rate-card row: label + one-line help left, input + unit suffix right.
function RateRow({ id, label, help, unit, step, value, onChange, placeholder = '' }) {
    return (
        <div className="flex flex-col gap-2 py-3 border-b border-[var(--dash-line)] last:border-b-0 last:pb-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="min-w-0">
                <label htmlFor={id} className="text-[13px] font-medium text-[var(--dash-ink)]">{label}</label>
                {help && <p className="text-[13px] dash-soft mt-0.5">{help}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <input
                    id={id}
                    type="number"
                    step={step}
                    min="0"
                    placeholder={placeholder}
                    value={value}
                    onChange={onChange}
                    className={`${inputCls()} w-32 text-right dash-data`}
                />
                <span className="text-[13px] dash-soft whitespace-nowrap w-20">{unit}</span>
            </div>
        </div>
    )
}

// `sections` (optional) limits which config sections render — used by the
// onboarding wizard to reuse these exact forms step-by-step (no tabs there).
// Save always persists the full loaded state, so a scoped step (or sub-view)
// can't wipe other sections.
export default function QuotingPricingManagement({ sections, compact = false }) {
    const { showToast } = useToast()
    const [config, setConfig] = useState(null)
    const [colours, setColours] = useState([])
    const [limits, setLimits] = useState({})
    const [timeModel, setTimeModel] = useState({})
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [tab, setTab] = useUrlSub(TABS.map((t) => t.key), 'rates')
    const [tourOpen, setTourOpen] = useState(false)
    const tourOffer = useTourOffer('quoting')

    const load = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/admin/quoting')
            const data = await res.json()
            if (res.ok) {
                setConfig(data.quotingConfig || {})
                setColours(data.printColours || [])
                setLimits(data.machineLimits || {})
                setTimeModel(data.quotingConfig?.timeModel || {})
            } else {
                showToast(data.error || 'Failed to load quoting config', 'error')
            }
        } catch {
            showToast('Failed to load quoting config', 'error')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const setField = (key, value) => setConfig((c) => ({ ...c, [key]: value }))

    const updateColour = (i, patch) =>
        setColours((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
    const addColour = () => setColours((cs) => [...cs, { name: 'New Colour', hex: '#cccccc', material: '' }])
    const removeColour = (i) => setColours((cs) => cs.filter((_, idx) => idx !== i))

    const handleSave = async () => {
        setSaving(true)
        try {
            const quotingConfig = {}
            for (const key of NUMERIC_KEYS) {
                const n = Number(config?.[key])
                if (Number.isFinite(n)) quotingConfig[key] = n
            }
            if (config?.expediteMode) quotingConfig.expediteMode = config.expediteMode

            // Time model: empty answer = null (use the built-in default)
            const timeModelOut = {}
            for (const { key } of TIME_MODEL_QUESTIONS) {
                const raw = timeModel?.[key]
                if (raw === '' || raw == null) timeModelOut[key] = null
                else if (Number.isFinite(Number(raw))) timeModelOut[key] = Number(raw)
            }
            quotingConfig.timeModel = timeModelOut

            const printColours = colours.map((c) => ({
                name: String(c.name || '').trim(),
                hex: c.hex,
                material: c.material ? String(c.material).trim() : null,
            }))

            // Empty input = no limit (null clears a previously set value)
            const machineLimits = {}
            for (const { key } of LIMIT_FIELDS) {
                const raw = limits?.[key]
                if (raw === '' || raw == null) machineLimits[key] = null
                else if (Number.isFinite(Number(raw)) && Number(raw) > 0) machineLimits[key] = Number(raw)
            }

            const res = await fetch('/api/admin/quoting', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quotingConfig, printColours, machineLimits }),
            })
            const data = await res.json()
            if (res.ok) {
                showToast('Quoting config saved!', 'success')
                load()
            } else {
                showToast(data.error || 'Failed to save', 'error')
            }
        } catch {
            showToast('Failed to save quoting config', 'error')
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className={`flex flex-col gap-3 ${compact ? '' : 'p-4 md:p-6'}`} aria-label="Loading quoting config">
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
            </div>
        )
    }

    const expediteMode = config?.expediteMode ?? 'greater'

    const rateRows = (fields) =>
        fields.map(({ key, label, help, unit, step }) => (
            <RateRow
                key={key}
                id={key}
                label={label}
                help={help}
                unit={unit}
                step={step}
                value={config?.[key] ?? ''}
                onChange={(e) => setField(key, e.target.value)}
            />
        ))

    const rushRows = () => (
        <>
            <div className="flex flex-col gap-2 py-3 border-b border-[var(--dash-line)] first:pt-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <div className="min-w-0">
                    <label htmlFor="expediteMode" className="text-[13px] font-medium text-[var(--dash-ink)]">Expedite mode</label>
                    <p className="text-[13px] dash-soft mt-0.5">How the rush surcharge is applied to expedited orders.</p>
                </div>
                <div className="w-full sm:w-64 shrink-0">
                    <DashSelect
                        name="expediteMode"
                        value={expediteMode}
                        onChangeFunction={(e) => setField('expediteMode', e.target.value)}
                        options={[
                            { value: 'greater', label: 'Greater of percent / flat' },
                            { value: 'percent', label: 'Percent only' },
                            { value: 'flat', label: 'Flat only' },
                        ]}
                    />
                </div>
            </div>
            {rateRows(RUSH_FIELDS.filter((f) => f.modes.includes(expediteMode)))}
        </>
    )

    const speedRows = () => (
        <>
            <p className="text-[13px] dash-soft pb-1">
                Answer these to tune estimated print times (and therefore the time cost in every
                quote) to your actual printers. Leave a field empty to keep the built-in default.
            </p>
            {TIME_MODEL_QUESTIONS.map(({ key, question, help, unit, step }) => (
                <RateRow
                    key={key}
                    id={`tm-${key}`}
                    label={question}
                    help={help}
                    unit={unit}
                    step={step}
                    placeholder="Default"
                    value={timeModel?.[key] ?? ''}
                    onChange={(e) => setTimeModel((t) => ({ ...t, [key]: e.target.value }))}
                />
            ))}
        </>
    )

    const limitRows = () => (
        <>
            <p className="text-[13px] dash-soft pb-1">
                Your printers&apos; maximum build size and weight. Models larger than this are
                rejected at quote time with a clear message. Leave a field empty for no limit.
            </p>
            {LIMIT_FIELDS.map(({ key, label, unit }) => (
                <RateRow
                    key={key}
                    id={key}
                    label={label}
                    unit={unit}
                    step="0.1"
                    placeholder="No limit"
                    value={limits?.[key] ?? ''}
                    onChange={(e) => setLimits((l) => ({ ...l, [key]: e.target.value }))}
                />
            ))}
        </>
    )

    const colourRows = () => (
        <div className="flex flex-col gap-2">
            {colours.length === 0 && <p className="text-[13px] dash-soft">No colours configured.</p>}
            {colours.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                    <input
                        type="color"
                        value={/^#[0-9a-fA-F]{6}$/.test(c.hex) ? c.hex : '#cccccc'}
                        onChange={(e) => updateColour(i, { hex: e.target.value })}
                        className="h-8 w-10 rounded-[var(--dash-r-inner)] border border-[var(--dash-line)] cursor-pointer"
                        title="Colour"
                        aria-label="Colour swatch"
                    />
                    <input
                        type="text"
                        value={c.name}
                        onChange={(e) => updateColour(i, { name: e.target.value })}
                        placeholder="Name"
                        aria-label="Colour name"
                        className={`${inputCls()} flex-1`}
                    />
                    <input
                        type="text"
                        value={c.material || ''}
                        onChange={(e) => updateColour(i, { material: e.target.value })}
                        placeholder="Material (optional, e.g. wood)"
                        aria-label="Material"
                        className={`${inputCls()} flex-1`}
                    />
                    <button
                        onClick={() => removeColour(i)}
                        className="text-[13px] font-medium text-[var(--dash-bad)] hover:underline cursor-pointer px-1 shrink-0"
                    >
                        Remove
                    </button>
                </div>
            ))}
        </div>
    )

    const addColourBtn = (
        <button onClick={addColour} className={quietBtnCls}>
            + Add colour
        </button>
    )

    // Wizard mode: render just the requested groups, no tabs, one plain save.
    if (sections) {
        return (
            <div className={`flex flex-col gap-4 ${compact ? '' : 'p-4 md:p-6'}`}>
                {sections.includes('pricing') && (
                    <DashCard title="Rates & fees">
                        {rateRows(RATE_FIELDS)}
                        {rateRows(FEE_FIELDS)}
                        {rushRows()}
                    </DashCard>
                )}
                {sections.includes('machines') && (
                    <>
                        <DashCard title="Print time estimation: set up for your machines">{speedRows()}</DashCard>
                        <DashCard title="Machine limits">{limitRows()}</DashCard>
                    </>
                )}
                {sections.includes('colours') && (
                    <DashCard title="Colour / material catalogue" action={addColourBtn}>
                        {colourRows()}
                    </DashCard>
                )}
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="dash-hoverable w-full rounded-full px-4 py-2.5 bg-[var(--dash-ink)] text-[var(--dash-canvas)] text-[13px] font-medium cursor-pointer hover:opacity-90 disabled:opacity-50"
                >
                    {saving ? 'Saving…' : 'Save Quoting Config'}
                </button>
            </div>
        )
    }

    return (
        <div className={`flex flex-col gap-4 ${compact ? '' : 'p-4 md:p-6'}`}>
            {!compact && (
                <div>
                    <h2 className="dash-title">Recommended pricing</h2>
                    <p className="text-[13px] dash-soft mt-1">
                        Creator print farms start from these values and override what differs.
                    </p>
                    <p className="text-[13px] dash-soft mt-1">
                        Rates and fees used by the Instant Quoting Engine, plus the colour/material
                        catalogue offered for generic configuration. Money is in your store currency.
                    </p>
                </div>
            )}

            <GlassBar>
                <ViewTabs tabs={TABS} active={tab} onChange={setTab} data-tour="quoting-tabs" className="flex-1 min-w-0" />
                <div className="flex items-center gap-2 shrink-0 ml-auto">
                    <button onClick={handleSave} disabled={saving} data-tour="quoting-save" className={sunBtnCls}>
                        {saving ? 'Saving…' : 'Save Quoting Config'}
                    </button>
                    <TourHelpButton onClick={() => setTourOpen(true)} />
                </div>
            </GlassBar>

            {tourOffer.offered && !tourOpen && (
                <TourOfferStrip
                    onStart={() => { tourOffer.accept(); setTourOpen(true) }}
                    onDismiss={tourOffer.dismiss}
                />
            )}

            {tab === 'rates' && <DashCard title="Rates" data-tour="quoting-card">{rateRows(RATE_FIELDS)}</DashCard>}
            {tab === 'fees' && (
                <>
                    <DashCard title="Fees">{rateRows(FEE_FIELDS)}</DashCard>
                    <DashCard title="Rush orders">{rushRows()}</DashCard>
                </>
            )}
            {tab === 'speed' && <DashCard title="Machine speed">{speedRows()}</DashCard>}
            {tab === 'limits' && <DashCard title="Machine limits">{limitRows()}</DashCard>}
            {tab === 'colours' && (
                <DashCard title="Colours" action={addColourBtn}>
                    {colourRows()}
                    {/* Honest stub (openspec add-print-farm-inventory): spool-level
                        filament stock per colour needs its own backend. */}
                    <div className="mt-4 pt-3 border-t border-[var(--dash-line)] flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] dash-soft">
                            Spool tracking: per-colour filament stock with low-spool warnings
                        </span>
                        <ComingSoon />
                    </div>
                </DashCard>
            )}

            {/* Guided tour (§9.11) */}
            <CoachMarks steps={TOURS.quoting} open={tourOpen} onClose={() => setTourOpen(false)} panelKey="quoting" />
        </div>
    )
}
