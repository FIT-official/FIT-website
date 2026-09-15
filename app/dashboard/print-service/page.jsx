'use client'
// Creator print service settings (/dashboard/print-service) — the owner
// surface for the print-on-demand offer shown on the public creator page and
// used by /prints/request?creator=. Rate-card chassis like /dashboard/shop:
// grouped label+input+help rows in cards, one Save that PUTs the whole
// service (server validates via lib/creatorPrintService/validate.js).
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { GoLinkExternal, GoPlus, GoX } from 'react-icons/go'
import { useToast } from '@/components/General/ToastProvider'
import { useShopIdentity, CreatorGate } from '@/components/DashboardComponents/CreatorShell'
import { DashCard, SkeletonRow, StatusPill } from '@/components/dashboard-ui'
import { emptyPrintService, ACCEPTED_FORMATS, MAX_MATERIALS } from '@/lib/creatorPrintService/validate'

const inputCls =
    'w-full rounded-[var(--dash-r-inner)] border border-[var(--dash-line)] bg-[var(--dash-card)] px-3 py-2 text-[13px] focus:outline-none focus:border-[var(--dash-focus-line)] focus:shadow-[var(--dash-focus-ring)]'

function FieldRow({ label, help, children }) {
    return (
        <div className="flex flex-col gap-1.5">
            <span className="dash-label">{label}</span>
            {children}
            {help && <span className="text-[12px] text-[var(--dash-ink-soft)]">{help}</span>}
        </div>
    )
}

const emptyMaterial = () => ({ name: '', colours: [], pricePerGram: 0.1, note: '' })

// Colours are edited as one comma-separated line; kept as a string per row so
// typing a trailing comma does not fight the array normalisation.
function toColourText(colours) {
    return (colours || []).join(', ')
}
function fromColourText(text) {
    return String(text || '')
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean)
        .slice(0, 20)
}

function PrintServiceEditor() {
    const { displayName } = useShopIdentity()
    const { showToast } = useToast()

    const [service, setService] = useState(emptyPrintService())
    const [colourText, setColourText] = useState([])
    const [loaded, setLoaded] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const res = await fetch('/api/user/print-service')
                if (!res.ok) throw new Error('Failed to load print service')
                const data = await res.json()
                if (cancelled) return
                const next = { ...emptyPrintService(), ...(data.service || {}) }
                setService(next)
                setColourText(next.materials.map((m) => toColourText(m.colours)))
            } catch (e) {
                if (!cancelled) setError(e.message || 'Failed to load print service')
            } finally {
                if (!cancelled) setLoaded(true)
            }
        })()
        return () => { cancelled = true }
    }, [])

    const publicHref = useMemo(
        () => (displayName ? `/creators/${encodeURIComponent(displayName)}` : '/creators'),
        [displayName],
    )

    const setField = (field, value) => setService((prev) => ({ ...prev, [field]: value }))
    const setNumber = (field, raw) => setField(field, raw === '' ? '' : Number(raw))
    const setBuild = (axis, raw) =>
        setService((prev) => ({ ...prev, maxBuildMm: { ...prev.maxBuildMm, [axis]: raw === '' ? '' : Number(raw) } }))

    const updateMaterial = (index, patch) =>
        setService((prev) => ({
            ...prev,
            materials: prev.materials.map((m, i) => (i === index ? { ...m, ...patch } : m)),
        }))
    const addMaterial = () => {
        if (service.materials.length >= MAX_MATERIALS) return
        setService((prev) => ({ ...prev, materials: [...prev.materials, emptyMaterial()] }))
        setColourText((prev) => [...prev, ''])
    }
    const removeMaterial = (index) => {
        setService((prev) => ({ ...prev, materials: prev.materials.filter((_, i) => i !== index) }))
        setColourText((prev) => prev.filter((_, i) => i !== index))
    }
    const toggleFormat = (fmt) =>
        setService((prev) => {
            const has = prev.acceptedFormats.includes(fmt)
            const next = has ? prev.acceptedFormats.filter((f) => f !== fmt) : [...prev.acceptedFormats, fmt]
            return { ...prev, acceptedFormats: next }
        })

    const save = async () => {
        setSaving(true)
        setError('')
        try {
            const payload = {
                enabled: Boolean(service.enabled),
                headline: service.headline,
                description: service.description,
                materials: service.materials.map((m, i) => ({
                    name: m.name,
                    colours: fromColourText(colourText[i] ?? toColourText(m.colours)),
                    pricePerGram: Number(m.pricePerGram) || 0,
                    note: m.note || '',
                })),
                minimumCharge: Number(service.minimumCharge) || 0,
                leadTimeDays: Number(service.leadTimeDays) || 1,
                maxBuildMm: {
                    x: Number(service.maxBuildMm.x) || 0,
                    y: Number(service.maxBuildMm.y) || 0,
                    z: Number(service.maxBuildMm.z) || 0,
                },
                acceptedFormats: service.acceptedFormats,
                turnaroundNote: service.turnaroundNote,
            }
            const res = await fetch('/api/user/print-service', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                const detail = data.issues?.[0]?.message
                throw new Error(detail ? `${data.error}: ${detail}` : data.error || 'Failed to save')
            }
            const next = { ...emptyPrintService(), ...(data.service || {}) }
            setService(next)
            setColourText(next.materials.map((m) => toColourText(m.colours)))
            showToast(next.enabled ? 'Print service saved and live.' : 'Print service saved (not enabled yet).', 'success')
        } catch (e) {
            setError(e.message || 'Failed to save')
            showToast(e.message || 'Failed to save', 'error')
        } finally {
            setSaving(false)
        }
    }

    if (!loaded) {
        return (
            <div className="flex flex-col gap-3" aria-label="Loading print service">
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                <div>
                    <p className="dash-label">Print on demand</p>
                    <h1 className="dash-title mt-1 flex items-center gap-2">
                        Print service
                        <StatusPill tone={service.enabled ? 'ok' : 'hatch'}>
                            {service.enabled ? 'Live' : 'Off'}
                        </StatusPill>
                    </h1>
                    <p className="dash-data dash-soft mt-1">
                        Customers upload a model on your page, you quote it, and you arrange payment directly.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        href={publicHref}
                        target="_blank"
                        className="dash-hoverable inline-flex items-center gap-1.5 rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] px-3.5 py-1.5 text-[13px] font-medium hover:bg-[var(--dash-canvas)]"
                    >
                        View page <GoLinkExternal aria-hidden="true" />
                    </Link>
                    <button
                        type="button"
                        onClick={save}
                        disabled={saving}
                        className="dash-hoverable inline-flex items-center rounded-full bg-[var(--dash-ink)] text-[var(--dash-canvas)] px-4 py-2 text-[13px] font-medium cursor-pointer disabled:opacity-50"
                    >
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>

            {error && (
                <p className="dash-data" style={{ color: 'var(--dash-bad)' }} role="alert">{error}</p>
            )}

            <DashCard title="Availability">
                <div className="flex flex-col gap-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={Boolean(service.enabled)}
                            onChange={(e) => setField('enabled', e.target.checked)}
                            className="h-4 w-4"
                        />
                        <span className="text-[13px] font-medium">Accept print requests</span>
                    </label>
                    <span className="text-[12px] text-[var(--dash-ink-soft)]">
                        Needs at least one material. When off, the service is hidden from your page and new requests are refused.
                    </span>
                    <FieldRow label="Headline" help="Up to 80 characters.">
                        <input
                            value={service.headline}
                            maxLength={80}
                            onChange={(e) => setField('headline', e.target.value)}
                            placeholder="e.g. Fast FDM prints in PLA and PETG"
                            className={inputCls}
                        />
                    </FieldRow>
                    <FieldRow label="Description" help="Markdown supported. Up to 1500 characters.">
                        <textarea
                            value={service.description}
                            maxLength={1500}
                            rows={5}
                            onChange={(e) => setField('description', e.target.value)}
                            placeholder="What you print, finish quality, what you do not print."
                            className={inputCls}
                        />
                    </FieldRow>
                </div>
            </DashCard>

            <DashCard
                title="Materials"
                action={
                    <button
                        type="button"
                        onClick={addMaterial}
                        disabled={service.materials.length >= MAX_MATERIALS}
                        className="dash-hoverable inline-flex items-center gap-1 rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] px-3 py-1 text-[12px] font-medium cursor-pointer hover:bg-[var(--dash-canvas)] disabled:opacity-50"
                    >
                        <GoPlus aria-hidden="true" /> Add material
                    </button>
                }
            >
                {service.materials.length === 0 ? (
                    <p className="dash-data dash-soft">No materials yet. Add one to start quoting by weight.</p>
                ) : (
                    <div className="flex flex-col gap-5">
                        {service.materials.map((m, i) => (
                            <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_140px_1fr_auto] gap-3 items-end border-b border-[var(--dash-line)] pb-4 last:border-b-0 last:pb-0">
                                <FieldRow label="Name">
                                    <input
                                        value={m.name}
                                        maxLength={40}
                                        onChange={(e) => updateMaterial(i, { name: e.target.value })}
                                        placeholder="PLA"
                                        className={inputCls}
                                        aria-label={`Material ${i + 1} name`}
                                    />
                                </FieldRow>
                                <FieldRow label="SGD per gram">
                                    <input
                                        type="number"
                                        min={0}
                                        step={0.01}
                                        value={m.pricePerGram}
                                        onChange={(e) => updateMaterial(i, { pricePerGram: e.target.value === '' ? '' : Number(e.target.value) })}
                                        className={inputCls}
                                        aria-label={`Material ${i + 1} price per gram`}
                                    />
                                </FieldRow>
                                <FieldRow label="Colours" help="Comma separated, up to 20.">
                                    <input
                                        value={colourText[i] ?? toColourText(m.colours)}
                                        onChange={(e) => {
                                            const v = e.target.value
                                            setColourText((prev) => prev.map((t, j) => (j === i ? v : t)))
                                        }}
                                        placeholder="Black, White, Red"
                                        className={inputCls}
                                        aria-label={`Material ${i + 1} colours`}
                                    />
                                </FieldRow>
                                <button
                                    type="button"
                                    aria-label={`Remove material ${i + 1}`}
                                    onClick={() => removeMaterial(i)}
                                    className="dash-hoverable h-9 w-9 grid place-items-center rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] cursor-pointer hover:bg-[var(--dash-canvas)]"
                                >
                                    <GoX aria-hidden="true" />
                                </button>
                                <div className="md:col-span-4">
                                    <input
                                        value={m.note}
                                        maxLength={120}
                                        onChange={(e) => updateMaterial(i, { note: e.target.value })}
                                        placeholder="Optional note, e.g. 0.2 mm layers, 20% infill"
                                        className={inputCls}
                                        aria-label={`Material ${i + 1} note`}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </DashCard>

            <DashCard title="Pricing and turnaround">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FieldRow label="Minimum charge (SGD)" help="Quotes never go below this.">
                        <input
                            type="number"
                            min={0}
                            step={0.5}
                            value={service.minimumCharge}
                            onChange={(e) => setNumber('minimumCharge', e.target.value)}
                            className={inputCls}
                        />
                    </FieldRow>
                    <FieldRow label="Lead time (days)" help="1 to 60 days.">
                        <input
                            type="number"
                            min={1}
                            max={60}
                            value={service.leadTimeDays}
                            onChange={(e) => setNumber('leadTimeDays', e.target.value)}
                            className={inputCls}
                        />
                    </FieldRow>
                    <div className="md:col-span-2">
                        <FieldRow label="Turnaround note" help="Up to 200 characters.">
                            <input
                                value={service.turnaroundNote}
                                maxLength={200}
                                onChange={(e) => setField('turnaroundNote', e.target.value)}
                                placeholder="Collection at Jurong East, or courier at cost."
                                className={inputCls}
                            />
                        </FieldRow>
                    </div>
                </div>
            </DashCard>

            <DashCard title="Machine">
                <div className="flex flex-col gap-4">
                    <FieldRow label="Max build volume (mm)" help="Each axis 10 to 1000 mm.">
                        <div className="grid grid-cols-3 gap-3">
                            {['x', 'y', 'z'].map((axis) => (
                                <input
                                    key={axis}
                                    type="number"
                                    min={10}
                                    max={1000}
                                    value={service.maxBuildMm[axis]}
                                    onChange={(e) => setBuild(axis, e.target.value)}
                                    aria-label={`Max build ${axis.toUpperCase()} in mm`}
                                    className={inputCls}
                                />
                            ))}
                        </div>
                    </FieldRow>
                    <FieldRow label="Accepted formats">
                        <div className="flex flex-wrap gap-2">
                            {ACCEPTED_FORMATS.map((fmt) => {
                                const on = service.acceptedFormats.includes(fmt)
                                return (
                                    <button
                                        key={fmt}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() => toggleFormat(fmt)}
                                        className={`dash-hoverable rounded-full px-3 py-1 text-[12px] font-medium uppercase cursor-pointer border ${
                                            on
                                                ? 'bg-[var(--dash-ink)] text-[var(--dash-canvas)] border-[var(--dash-ink)]'
                                                : 'bg-[var(--dash-card)] border-[var(--dash-line)] hover:bg-[var(--dash-canvas)]'
                                        }`}
                                    >
                                        {fmt}
                                    </button>
                                )
                            })}
                        </div>
                    </FieldRow>
                </div>
            </DashCard>
        </div>
    )
}

export default function GatedPrintService() {
    return (
        <CreatorGate>
            <PrintServiceEditor />
        </CreatorGate>
    )
}
