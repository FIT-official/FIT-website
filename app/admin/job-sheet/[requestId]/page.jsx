'use client'
// Printable job sheet for one custom print request (blueprint §6 [UI]).
//
// Data handoff: RequestPeek writes the request to
// `sessionStorage["dashJobSheet.<requestId>"]` and window.open()s this route
// (script-opened tabs receive a copy of session storage); when the key is
// absent (manual URL / scanned QR) we fall back to fetching the admin list
// endpoint — which is admin-auth'd, so this page shows nothing to outsiders.
//
// Print isolation: the storefront chrome (Navbar/Footer from the root
// layout) is suppressed with the classic visibility trick — everything is
// hidden under `@media print` except the sheet subtree, which is lifted to
// the page origin. On-screen toolbar uses the existing `dash-print-hidden`
// utility (app/dashboard.css). Ink on white; A5 via @page.
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { DottedRow, StatusPill } from '@/components/dashboard-ui'
import { STATUS_LABELS, statusTone, normalizeMeshColors, configEntries } from '@/components/Admin/RequestPeek'
import { encodeQr, qrSvgPath } from '@/lib/qr'
import { customPrintDisplayPrice } from '@/lib/customPrintDisplayPrice'

const PRINT_CSS = `
@page { size: A5 portrait; margin: 10mm; }
@media print {
    body * { visibility: hidden; }
    .dash-job-sheet, .dash-job-sheet * { visibility: visible; }
    .dash-job-sheet {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        margin: 0;
        border: none;
        box-shadow: none;
        border-radius: 0;
    }
}
`

function JobSheet() {
    const { requestId } = useParams()
    const searchParams = useSearchParams()
    const autoPrint = searchParams.get('print') === '1'
    const [request, setRequest] = useState(null)
    const [state, setState] = useState('loading') // loading | ready | missing

    useEffect(() => {
        if (!requestId) return undefined
        let cancelled = false
        try {
            const raw = sessionStorage.getItem(`dashJobSheet.${requestId}`)
            if (raw) {
                setRequest(JSON.parse(raw))
                setState('ready')
                return undefined
            }
        } catch { /* corrupt/absent — use the fetch fallback */ }
        ;(async () => {
            try {
                const res = await fetch('/api/admin/custom-print-requests')
                if (!res.ok) throw new Error('load failed')
                const data = await res.json()
                const found = (data.requests || []).find((x) => x.requestId === requestId)
                if (cancelled) return
                if (found) {
                    setRequest(found)
                    setState('ready')
                } else {
                    setState('missing')
                }
            } catch {
                if (!cancelled) setState('missing')
            }
        })()
        return () => {
            cancelled = true
        }
    }, [requestId])

    // ?print=1 → open the browser print dialog once the sheet is painted.
    useEffect(() => {
        if (!autoPrint || state !== 'ready') return undefined
        const t = setTimeout(() => window.print(), 400)
        return () => clearTimeout(t)
    }, [autoPrint, state])

    // QR target: this job sheet's own admin URL — scanning the printed sheet
    // reopens the live record (admin-only behind auth).
    const adminUrl = useMemo(
        () => (typeof window === 'undefined' || !requestId ? '' : `${window.location.origin}/admin/job-sheet/${requestId}`),
        [requestId],
    )
    const qr = useMemo(() => (adminUrl ? encodeQr(adminUrl) : null), [adminUrl])

    if (state === 'loading') {
        return (
            <div className="dash min-h-[60vh] grid place-items-center">
                <p className="text-[13px] dash-soft">Preparing job sheet…</p>
            </div>
        )
    }
    if (state === 'missing' || !request) {
        return (
            <div className="dash min-h-[60vh] grid place-items-center">
                <p className="text-[13px] dash-soft">Request {requestId} not found. Open it from Print Requests.</p>
            </div>
        )
    }

    const r = request
    const settings = r.printConfiguration?.printSettings
    const swatches = Object.entries(normalizeMeshColors(r.printConfiguration?.meshColors))
    const quoteTotal = r.quote?.total != null || (typeof r.printFee === 'number' && r.printFee > 0)
        ? `${String(r.currency || 'sgd').toUpperCase()} ${customPrintDisplayPrice(r).amount.toFixed(2)}`
        : '–'

    return (
        <div className="dash min-h-[92vh] py-8 px-4">
            <style>{PRINT_CSS}</style>

            {/* Screen-only toolbar */}
            <div className="dash-print-hidden mx-auto max-w-[480px] flex items-center justify-between gap-3 mb-4">
                <p className="text-[13px] dash-soft">A5 job sheet, ink on white.</p>
                <button
                    type="button"
                    onClick={() => window.print()}
                    className="dash-hoverable rounded-full px-4 py-2 text-[13px] font-medium bg-[var(--dash-ink)] text-[var(--dash-canvas)] cursor-pointer active:scale-[0.97]"
                >
                    Print
                </button>
            </div>

            {/* The sheet — the only thing that prints */}
            <div className="dash-job-sheet mx-auto max-w-[480px] bg-[var(--dash-card)] border border-[var(--dash-line)] rounded-[var(--dash-r-card)] shadow-[var(--dash-shadow-card)] p-6">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <p className="dash-label">Job sheet</p>
                        <h1 className="dash-title mt-1 break-words">{r.modelFile?.originalName || 'Custom print'}</h1>
                        <p className="dash-data dash-soft mt-1 break-all">{r.requestId}</p>
                    </div>
                    {qr && (
                        <svg
                            viewBox={`0 0 ${qr.length} ${qr.length}`}
                            width="96"
                            height="96"
                            role="img"
                            aria-label="QR code linking to this job sheet"
                            className="shrink-0"
                            shapeRendering="crispEdges"
                        >
                            <rect width={qr.length} height={qr.length} fill="#ffffff" />
                            <path d={qrSvgPath(qr)} fill="#111111" />
                        </svg>
                    )}
                </div>

                <div className="flex items-center gap-3 mt-3 flex-wrap">
                    <StatusPill tone={statusTone(r.status)}>{STATUS_LABELS[r.status] || r.status}</StatusPill>
                    {r.createdAt && (
                        <span className="dash-data dash-soft">
                            Requested {new Date(r.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                    )}
                </div>

                <div className="mt-4 border-t border-[var(--dash-line)] pt-3">
                    <DottedRow label="Customer">{r.userEmail || '–'}</DottedRow>
                    <DottedRow label="Quantity">1</DottedRow>
                    <DottedRow label="Quote total" className="font-medium">{quoteTotal}</DottedRow>
                </div>

                {settings && (
                    <div className="mt-4">
                        <p className="dash-label mb-1.5">Print settings</p>
                        {configEntries(settings).map(([label, val]) => (
                            <DottedRow key={label} label={label}>{val ?? 'N/A'}</DottedRow>
                        ))}
                    </div>
                )}

                {(r.dimensions?.length != null || r.dimensions?.weight != null) && (
                    <div className="mt-4">
                        <p className="dash-label mb-1.5">Dimensions &amp; weight</p>
                        {r.dimensions?.length != null && (
                            <DottedRow label="Dimensions">
                                {`${r.dimensions.length}×${r.dimensions.width}×${r.dimensions.height} cm`}
                            </DottedRow>
                        )}
                        {r.dimensions?.weight != null && <DottedRow label="Weight">{`${r.dimensions.weight} kg`}</DottedRow>}
                    </div>
                )}

                {swatches.length > 0 && (
                    <div className="mt-4">
                        <p className="dash-label mb-1.5">Colours</p>
                        <div className="flex flex-wrap gap-2">
                            {swatches.map(([mesh, color]) => (
                                <span
                                    key={mesh}
                                    className="flex items-center gap-1.5 border border-[var(--dash-line)] rounded-full px-2.5 py-1 text-[11px] font-medium"
                                >
                                    <span
                                        className="h-3 w-3 rounded-full border border-[var(--dash-line)]"
                                        style={{ backgroundColor: color }}
                                        aria-hidden="true"
                                    />
                                    {mesh} <span className="dash-data dash-soft">{color}</span>
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                <p className="dash-data dash-soft mt-5 pt-3 border-t border-[var(--dash-line)] break-all">{adminUrl}</p>
            </div>
        </div>
    )
}

export default function JobSheetPage() {
    return (
        <Suspense
            fallback={
                <div className="dash min-h-[60vh] grid place-items-center">
                    <p className="text-[13px] dash-soft">Preparing job sheet…</p>
                </div>
            }
        >
            <JobSheet />
        </Suspense>
    )
}
