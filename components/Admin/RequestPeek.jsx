'use client'
import { useEffect, useState } from 'react'
import { IoDownloadOutline, IoPrintOutline } from 'react-icons/io5'
import ShippingFields from '@/components/DashboardComponents/ProductFormFields/ShippingFields'
import { useToast } from '@/components/General/ToastProvider'
import { PeekPanel, DottedRow, Timeline, StatusPill, ComingSoon } from '@/components/dashboard-ui'

// Status vocabulary shared by the queue list and the peek (§5.8).
export const STATUS_LABELS = {
    pending_upload: 'Awaiting Model Upload',
    pending_config: 'Awaiting Print Config',
    configured: 'Awaiting Quote',
    quoted: 'Quoted',
    payment_pending: 'Awaiting Payment',
    paid: 'Paid',
    printing: 'Printing',
    printed: 'Printed',
    shipped: 'Shipped',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
}

// Tone mapping: needs-quote = hatch · quoted/awaiting payment = sun ·
// in production = ink · shipped/delivered = ok · cancelled = bad.
const STATUS_TONES = {
    pending_upload: 'hatch',
    pending_config: 'hatch',
    configured: 'hatch',
    quoted: 'sun',
    payment_pending: 'sun',
    paid: 'ink',
    printing: 'ink',
    printed: 'ink',
    shipped: 'ok',
    delivered: 'ok',
    cancelled: 'bad',
}

export const NEEDS_QUOTE_STATUSES = ['pending_upload', 'pending_config', 'configured']

export function statusTone(status) {
    return STATUS_TONES[status] || 'paper'
}

export function normalizeMeshColors(meshColors) {
    if (!meshColors) return {}
    if (meshColors instanceof Map) return Object.fromEntries(meshColors)
    if (typeof meshColors === 'object') return meshColors
    return {}
}

// One-line human description per status (parity with the old status line).
function describeStatus(r) {
    switch (r.status) {
        case 'pending_upload': return 'No model uploaded'
        case 'pending_config': return 'Model uploaded, awaiting print config'
        case 'configured': return 'Model & config done, awaiting quote'
        case 'quoted': {
            const base = typeof r.basePrice === 'number' ? r.basePrice : 0
            const fee = typeof r.printFee === 'number' ? r.printFee : 0
            return `Quote: ${(base + fee).toFixed(2)} ${r.currency?.toUpperCase() || 'SGD'}`
        }
        case 'payment_pending': return 'Quote sent, awaiting payment'
        case 'paid': return 'Paid, in queue for printing'
        case 'printing': return 'Printing in progress'
        case 'printed': return 'Printed, ready for shipping'
        case 'shipped': return 'Shipped'
        case 'delivered': return 'Delivered'
        case 'cancelled': return 'Request cancelled'
        default: return r.status
    }
}

// Every print setting the old expandable config view showed. Exported for
// the printable job sheet (app/admin/job-sheet/[requestId]) — one spec list,
// two renderers.
export function configEntries(settings) {
    return [
        ['Layer height', settings.layerHeight != null ? `${settings.layerHeight}mm` : null],
        ['Initial layer', settings.initialLayerHeight != null ? `${settings.initialLayerHeight}mm` : null],
        ['Material', settings.materialType],
        ['Wall loops', settings.wallLoops],
        ['Infill density', settings.sparseInfillDensity != null ? `${settings.sparseInfillDensity}%` : null],
        ['Infill pattern', settings.sparseInfillPattern],
        ['Internal pattern', settings.internalSolidInfillPattern],
        ['Nozzle', settings.nozzleDiameter != null ? `${settings.nozzleDiameter}mm` : null],
        ['Support', settings.enableSupport ? settings.supportType : 'None'],
        ['Print plate', settings.printPlate],
    ]
}

const inputCls =
    'w-full border border-[var(--dash-line)] rounded-[var(--dash-r-inner)] bg-[var(--dash-card)] px-3 py-2 text-[13px] outline-none'
const quietBtnCls =
    'dash-hoverable flex items-center gap-1.5 rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] px-3.5 py-1.5 text-[13px] font-medium cursor-pointer hover:bg-[var(--dash-canvas)]'
const inkBtnCls =
    'dash-hoverable rounded-full px-4 py-2 text-[13px] font-medium bg-[var(--dash-ink)] text-[var(--dash-canvas)] cursor-pointer disabled:opacity-50 active:scale-[0.97]'

/**
 * Right-hand peek for one print request (§5.8): dotted-leader config sheet,
 * dimensions/weight, mesh colour swatches, quote total, statusHistory
 * Timeline, downloads, and the quote editor (price + Auto-Calculate +
 * ShippingFields + note) collapsed behind Create/Edit quote.
 * Note: the current admin UI advances status only via quote/cancel — there
 * are no other transitions, so no status-advance buttons are invented here.
 */
export default function RequestPeek({
    request,
    open,
    initialEditor = false,
    adminSettings,
    onClose,
    onChanged,
    onCancelRequest,
    onDownloadModel,
    onDownloadConfig,
}) {
    const { showToast } = useToast()
    const [editing, setEditing] = useState(false)
    const [quoteAmount, setQuoteAmount] = useState('')
    const [note, setNote] = useState('')
    const [saving, setSaving] = useState(false)
    const [shippingEdit, setShippingEdit] = useState({}) // { [requestId]: {dimensions, delivery} }

    const startQuote = (r) => {
        setEditing(true)
        setQuoteAmount(typeof r.printFee === 'number' && r.printFee > 0 ? String(r.printFee) : '')
        setNote(r.adminNote || '')
        setShippingEdit((edit) => ({
            ...edit,
            [r.requestId]: {
                dimensions: {
                    length: r.dimensions?.length ?? '',
                    width: r.dimensions?.width ?? '',
                    height: r.dimensions?.height ?? '',
                    weight: r.dimensions?.weight ?? '',
                },
                delivery: r.delivery || { deliveryTypes: [] },
            },
        }))
    }

    // Reset the editor whenever the peek (re)opens; the "Quote" row action
    // opens straight into the editor.
    useEffect(() => {
        if (!open || !request) return
        if (initialEditor) startQuote(request)
        else setEditing(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, request?.requestId, initialEditor])

    if (!request) return <PeekPanel open={false} onClose={onClose} title="" />

    const r = request
    const settings = r.printConfiguration?.printSettings
    const meshColors = normalizeMeshColors(r.printConfiguration?.meshColors)
    const hasQuote = typeof r.printFee === 'number' && r.printFee > 0
    const printHours = r.quote?.inputs?.printHours

    const historyItems = [...(r.statusHistory || [])]
        .map((e, i) => ({
            id: `h${i}`, // non-falsy — Timeline falls back to the array index for falsy ids
            title: STATUS_LABELS[e.status] || e.status,
            at: e.updatedAt || e.timestamp || e.date,
            note: e.note,
        }))
        .reverse() // newest first

    const copyRequestId = async () => {
        try {
            await navigator.clipboard.writeText(r.requestId)
            showToast('Request ID copied.', 'success')
        } catch {
            showToast('Copy failed. Select the ID manually.', 'error')
        }
    }

    // Print job sheet (§6): hand the request to the print route via
    // sessionStorage (window.open copies session storage to the new tab;
    // the route falls back to fetching by id when the key is absent).
    const openJobSheet = () => {
        try {
            sessionStorage.setItem(`dashJobSheet.${r.requestId}`, JSON.stringify(r))
        } catch { /* the route's fetch fallback covers this */ }
        window.open(`/admin/job-sheet/${r.requestId}?print=1`, '_blank')
    }

    const autoCalculate = async () => {
        try {
            const shipping = shippingEdit[r.requestId] || {}
            const res = await fetch('/api/admin/calculate-print-cost', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    printSettings: r.printConfiguration?.printSettings,
                    dimensions: shipping.dimensions || r.dimensions,
                }),
            })
            if (res.ok) {
                const { suggestedPrice } = await res.json()
                setQuoteAmount(String(suggestedPrice))
                showToast(`Suggested price: ${suggestedPrice}`, 'info')
            }
        } catch (e) {
            console.error('Auto-calculate failed:', e)
        }
    }

    const submitQuote = async () => {
        setSaving(true)
        try {
            const requestId = r.requestId
            const shipping = shippingEdit[requestId] || {}
            // Sanitize dimensions: ensure numbers or null, match Product.js
            const dims = shipping.dimensions || {}
            const dimensions = {
                length: dims.length !== undefined && dims.length !== '' ? Number(dims.length) : null,
                width: dims.width !== undefined && dims.width !== '' ? Number(dims.width) : null,
                height: dims.height !== undefined && dims.height !== '' ? Number(dims.height) : null,
                weight: dims.weight !== undefined && dims.weight !== '' ? Number(dims.weight) : null,
            }
            // Sanitize deliveryTypes: match Product.js DeliveryTypeSchema
            const delivery = { deliveryTypes: [] }
            if (shipping.delivery && Array.isArray(shipping.delivery.deliveryTypes)) {
                delivery.deliveryTypes = shipping.delivery.deliveryTypes.map((dt) => ({
                    type: dt.type,
                    price: dt.price !== undefined ? Number(dt.price) : 0,
                    customPrice: dt.customPrice !== undefined ? Number(dt.customPrice) : null,
                    customDescription: dt.customDescription || null,
                    pickupLocation: dt.pickupLocation || null,
                    deliveryTypeConfigId: dt.deliveryTypeConfigId || null,
                })).filter((dt) => dt.type)
            }
            const body = {
                requestId,
                action: 'quote',
                quoteAmount: Number(quoteAmount || 0),
                note,
                dimensions,
                delivery,
            }
            const res = await fetch('/api/admin/custom-print-requests', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            if (!res.ok) throw new Error('Failed to save quote')
            setEditing(false)
            showToast('Quote saved.', 'success')
            await onChanged?.()
        } catch (e) {
            showToast(e.message || 'Failed to save quote', 'error')
        } finally {
            setSaving(false)
        }
    }

    return (
        <PeekPanel
            open={open}
            onClose={onClose}
            title={r.modelFile?.originalName || 'Custom print'}
            actions={
                <>
                    <button type="button" onClick={openJobSheet} className={quietBtnCls} title="Print job sheet">
                        <IoPrintOutline size={14} aria-hidden="true" /> Job sheet
                    </button>
                    {r.modelFile?.s3Key && (
                        <button type="button" onClick={() => onDownloadModel(r)} className={quietBtnCls}>
                            <IoDownloadOutline size={14} aria-hidden="true" /> Model
                        </button>
                    )}
                    {r.printConfiguration && (
                        <button type="button" onClick={() => onDownloadConfig(r)} className={quietBtnCls}>
                            <IoDownloadOutline size={14} aria-hidden="true" /> Config
                        </button>
                    )}
                </>
            }
        >
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <StatusPill tone={statusTone(r.status)}>{STATUS_LABELS[r.status] || r.status}</StatusPill>
                <span className="dash-data dash-soft">{describeStatus(r)}</span>
            </div>

            <div className="mt-4">
                <DottedRow label="Customer">{r.userEmail || '–'}</DottedRow>
                {r.designSource?.url?.startsWith('https://') && <DottedRow label="Design source">
                    <a href={r.designSource.url} target="_blank" rel="noopener noreferrer" className="underline">Original design</a>
                    {r.designSource.attribution ? ` · ${r.designSource.attribution}` : ''}
                </DottedRow>}
                <DottedRow label="Request ID">
                    <button
                        type="button"
                        onClick={copyRequestId}
                        title="Copy request ID"
                        className="dash-data cursor-pointer hover:text-[var(--dash-ink-soft)]"
                    >
                        {r.requestId}
                    </button>
                </DottedRow>
                {r.createdAt && (
                    <DottedRow label="Created">
                        {new Date(r.createdAt).toLocaleString(undefined, {
                            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                    </DottedRow>
                )}
            </div>

            {(settings || r.dimensions?.length != null || r.dimensions?.weight != null || r.quote?.total != null) && (
                <div className="mt-5">
                    <p className="dash-label mb-1.5">Print Configuration</p>
                    {settings && configEntries(settings).map(([label, val]) => (
                        <DottedRow key={label} label={label}>{val ?? 'N/A'}</DottedRow>
                    ))}
                    {r.dimensions?.length != null && (
                        <DottedRow label="Dimensions">
                            {`${r.dimensions.length}×${r.dimensions.width}×${r.dimensions.height} cm`}
                        </DottedRow>
                    )}
                    {r.dimensions?.weight != null && <DottedRow label="Weight">{`${r.dimensions.weight} kg`}</DottedRow>}
                    {Number.isFinite(printHours) && (
                        <DottedRow label="Est. print time">{`≈ ${Number(printHours).toFixed(1)} h`}</DottedRow>
                    )}
                    {r.quote?.total != null && (
                        <>
                            <DottedRow label="Quote total" className="font-medium">
                                {`${String(r.quote.currency || 'sgd').toUpperCase()} ${Number(r.quote.total).toFixed(2)}`}
                            </DottedRow>
                            {/* Honest stub (openspec add-quote-review-state): quotes have no
                                validity window yet — the value stays a dash, never a fake date. */}
                            <DottedRow label="Valid until">
                                <span className="dash-soft">–</span>
                                <ComingSoon />
                            </DottedRow>
                        </>
                    )}
                </div>
            )}

            {Object.keys(meshColors).length > 0 && (
                <div className="mt-4">
                    <p className="dash-label mb-1.5">Mesh Colours</p>
                    <div className="flex flex-wrap gap-2">
                        {Object.entries(meshColors).map(([mesh, color]) => (
                            <span
                                key={mesh}
                                className="flex items-center gap-1.5 border border-[var(--dash-line)] bg-[var(--dash-card)] rounded-full px-2.5 py-1 text-[11px] font-medium"
                            >
                                <span
                                    className="h-3 w-3 rounded-full border border-[var(--dash-line)]"
                                    style={{ backgroundColor: color }}
                                    aria-hidden="true"
                                />
                                {mesh}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <div className="mt-5">
                <p className="dash-label mb-1.5">History</p>
                {historyItems.length > 0 ? (
                    <Timeline items={historyItems} />
                ) : (
                    <p className="text-[13px] dash-soft">No status history recorded.</p>
                )}
            </div>

            {/* Quote editor — collapsed behind Create/Edit quote; the form sits
                on a solid card plate (glass is banned on forms, §4.4). */}
            <div className="mt-6 bg-[var(--dash-card)] border border-[var(--dash-line)] rounded-[var(--dash-r-inner)] p-4">
                <div className="flex items-center justify-between gap-3">
                    <h4 className="dash-section">Quote</h4>
                    {!editing && (
                        <button type="button" onClick={() => startQuote(r)} className={inkBtnCls}>
                            {hasQuote ? 'Edit quote' : 'Create quote'}
                        </button>
                    )}
                </div>
                {editing && (
                    <div className="flex flex-col gap-4 mt-3">
                        <div className="flex gap-2 items-end">
                            <div className="flex-1">
                                <label htmlFor="peek-quote-price" className="dash-label block mb-1">Print price</label>
                                <input
                                    id="peek-quote-price"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={quoteAmount}
                                    onChange={(e) => setQuoteAmount(e.target.value)}
                                    className={inputCls}
                                />
                            </div>
                            <button type="button" onClick={autoCalculate} className={`${quietBtnCls} whitespace-nowrap`}>
                                Auto-Calculate
                            </button>
                        </div>
                        {/* ShippingFields for dimensions and delivery types — shared
                            component, wiring unchanged from the previous inline editor. */}
                        <div className="border border-[var(--dash-line)] rounded-[var(--dash-r-inner)] p-2 bg-[var(--dash-canvas)]">
                            <ShippingFields
                                form={{
                                    productType: 'print',
                                    dimensions: (shippingEdit[r.requestId]?.dimensions) || r.dimensions || { length: '', width: '', height: '', weight: '' },
                                    delivery: (shippingEdit[r.requestId]?.delivery) || r.delivery || { deliveryTypes: [] },
                                }}
                                handleChange={(e) => {
                                    const { name, value } = e.target
                                    setShippingEdit((edit) => ({
                                        ...edit,
                                        [r.requestId]: {
                                            ...edit[r.requestId],
                                            dimensions: {
                                                ...((edit[r.requestId] && edit[r.requestId].dimensions) || r.dimensions || {}),
                                                [name]: ['length', 'width', 'height', 'weight'].includes(name)
                                                    ? (value === '' ? '' : Number(value))
                                                    : value,
                                            },
                                            delivery: (edit[r.requestId] && edit[r.requestId].delivery) || r.delivery || { deliveryTypes: [] },
                                        },
                                    }))
                                }}
                                setForm={(updater) => {
                                    setShippingEdit((edit) => {
                                        const current = {
                                            productType: 'print',
                                            dimensions: edit[r.requestId]?.dimensions || r.dimensions || { length: '', width: '', height: '', weight: '' },
                                            delivery: edit[r.requestId]?.delivery || r.delivery || { deliveryTypes: [] },
                                        }

                                        const next = typeof updater === 'function' ? updater(current) : updater

                                        // ShippingFields signals "no change" by returning the same
                                        // object it was given — mirror that by returning the same
                                        // state reference, or React re-renders forever.
                                        if (!next || next === current) return edit
                                        if (
                                            next.dimensions === current.dimensions &&
                                            next.delivery === current.delivery
                                        ) return edit

                                        return {
                                            ...edit,
                                            [r.requestId]: {
                                                ...edit[r.requestId],
                                                dimensions: next?.dimensions ?? current.dimensions,
                                                delivery: next?.delivery ?? current.delivery,
                                            },
                                        }
                                    })
                                }}
                                availableDeliveryTypes={adminSettings?.deliveryTypes || []}
                                hidePriceEditor={false}
                                hideDimensions={false}
                            />
                        </div>
                        <div>
                            <label htmlFor="peek-quote-note" className="dash-label block mb-1">Admin note (optional)</label>
                            <textarea
                                id="peek-quote-note"
                                rows={2}
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                className={inputCls}
                            />
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button type="button" onClick={() => setEditing(false)} className={quietBtnCls}>
                                Discard
                            </button>
                            <button type="button" onClick={submitQuote} disabled={saving} className={inkBtnCls}>
                                {saving ? 'Saving…' : 'Save quote'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {r.status !== 'cancelled' && (
                <div className="mt-5 flex justify-end">
                    <button
                        type="button"
                        onClick={() => onCancelRequest(r.requestId)}
                        className="dash-hoverable rounded-full px-4 py-2 text-[13px] font-medium border border-[var(--dash-line)] bg-[var(--dash-card)] text-[var(--dash-bad)] hover:bg-[var(--dash-bad-bg)] cursor-pointer"
                    >
                        Cancel request
                    </button>
                </div>
            )}
        </PeekPanel>
    )
}
