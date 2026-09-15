'use client'
import { useEffect, useMemo, useState } from 'react'
import { IoSearchOutline, IoDownloadOutline, IoEllipsisHorizontal, IoFileTrayOutline, IoAlertCircleOutline } from 'react-icons/io5'
import * as XLSX from 'xlsx'
import { useToast } from '@/components/General/ToastProvider'
import { useAdminSettings } from '@/utils/AdminSettingsContext'
import {
    DashCard,
    ViewTabs,
    StatusPill,
    Tag,
    ConfirmDialog,
    GlassBar,
    EmptyState,
    SkeletonRow,
    FreshnessStamp,
    CoachMarks,
    useTourOffer,
    TourOfferStrip,
    TourHelpButton,
    TOURS,
} from '@/components/dashboard-ui'
import RequestPeek, {
    STATUS_LABELS,
    NEEDS_QUOTE_STATUSES,
    statusTone,
    normalizeMeshColors,
} from './RequestPeek'
import { useUrlSub } from './dashPanelUi'

// Saved views over the queue (§5.8) — every lifecycle status maps to a view.
const VIEWS = [
    { key: 'all', label: 'All' },
    { key: 'needs_quote', label: 'Needs quote', statuses: NEEDS_QUOTE_STATUSES },
    { key: 'quoted', label: 'Quoted', statuses: ['quoted', 'payment_pending'] },
    { key: 'paid', label: 'Paid', statuses: ['paid'] },
    { key: 'printing', label: 'Printing', statuses: ['printing', 'printed'] },
    { key: 'shipped', label: 'Shipped', statuses: ['shipped'] },
    { key: 'done', label: 'Done', statuses: ['delivered', 'cancelled'] },
]

const NEEDS_QUOTE_SET = new Set(NEEDS_QUOTE_STATUSES)

/**
 * Admin print requests — the job queue (§5.8). GlassBar (search + saved views
 * + export), compact job cards, and a RequestPeek slide-over carrying the
 * config sheet, timeline, quote editor and cancel flow.
 */
export default function CustomPrintRequests() {
    const { showToast } = useToast()
    const { settings: adminSettings } = useAdminSettings()

    const [requests, setRequests] = useState([])
    const [fetchedAt, setFetchedAt] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [tourOpen, setTourOpen] = useState(false)
    const tourOffer = useTourOffer('customPrintRequests')
    const [search, setSearch] = useState('')
    // Creator-handled jobs (creatorUserId set) are fulfilled by the creator, not
    // FIT, so the queue defaults to FIT-only; the toggle brings them in.
    const [includeCreatorJobs, setIncludeCreatorJobs] = useState(false)
    const [view, setView] = useUrlSub(VIEWS.map((v) => v.key), 'all')
    const [menuFor, setMenuFor] = useState(null) // requestId whose "…" menu is open
    const [peek, setPeek] = useState(null) // { id, editor }
    const [cancelTarget, setCancelTarget] = useState(null) // requestId pending confirm
    const [cancelBusy, setCancelBusy] = useState(false)

    const load = async () => {
        setLoading(true)
        setError('')
        try {
            const res = await fetch('/api/admin/custom-print-requests')
            if (!res.ok) throw new Error('Failed to load requests')
            const data = await res.json()
            setRequests(data.requests || [])
            setFetchedAt(Date.now())
        } catch (e) {
            setError(e.message || 'Failed to load requests')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        load()
    }, [])

    // Client-side search across model name, customer email and request ID.
    const searched = useMemo(() => {
        const scoped = includeCreatorJobs ? requests : requests.filter((r) => !r.creatorUserId)
        if (!search) return scoped
        const q = search.toLowerCase()
        return scoped.filter((r) => (
            (r.modelFile?.originalName || '').toLowerCase().includes(q) ||
            (r.userEmail || '').toLowerCase().includes(q) ||
            (r.requestId || '').toLowerCase().includes(q) ||
            (r.creatorDisplayName || '').toLowerCase().includes(q)
        ))
    }, [search, requests, includeCreatorJobs])

    const creatorJobCount = useMemo(() => requests.filter((r) => r.creatorUserId).length, [requests])

    const counts = useMemo(() => {
        const byView = {}
        for (const v of VIEWS) {
            byView[v.key] = v.statuses
                ? searched.filter((r) => v.statuses.includes(r.status)).length
                : searched.length
        }
        return byView
    }, [searched])

    const activeView = VIEWS.find((v) => v.key === view) || VIEWS[0]
    const visible = activeView.statuses
        ? searched.filter((r) => activeView.statuses.includes(r.status))
        : searched

    // Download print config as txt
    const downloadConfig = (r) => {
        if (!r.printConfiguration) return
        const configStr = JSON.stringify(r.printConfiguration, null, 2)
        const blob = new Blob([configStr], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `print-config-${r.requestId}.txt`
        document.body.appendChild(a)
        a.click()
        setTimeout(() => {
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        }, 100)
    }

    const downloadModel = (r) => {
        if (!r.modelFile?.s3Key) return
        const originalName = r.modelFile.originalName || r.modelFile.s3Key.split('/').pop() || 'model.stl'
        // Pass the original filename so the server sets Content-Disposition correctly
        // (its header takes precedence over the anchor's download attribute).
        const url = `/api/proxy?key=${encodeURIComponent(r.modelFile.s3Key)}&download=1&filename=${encodeURIComponent(originalName)}`
        const a = document.createElement('a')
        a.href = url
        a.download = originalName
        document.body.appendChild(a)
        a.click()
        setTimeout(() => document.body.removeChild(a), 100)
    }

    // Exports the rows currently in view (search + active tab).
    const exportToExcel = () => {
        if (!visible.length) return
        const exportData = visible.map((r) => ({
            RequestID: r.requestId,
            User: r.userEmail,
            Creator: r.creatorDisplayName || '',
            Status: r.status,
            ModelName: r.modelFile?.originalName || '',
            ModelSize: r.modelFile?.fileSize || '',
            PrintConfig: r.printConfiguration ? JSON.stringify(r.printConfiguration) : '',
            CreatedAt: r.createdAt ? new Date(r.createdAt).toLocaleString() : '',
            UpdatedAt: r.updatedAt ? new Date(r.updatedAt).toLocaleString() : '',
        }))
        const ws = XLSX.utils.json_to_sheet(exportData)
        ws['!cols'] = [
            { wch: 36 }, { wch: 24 }, { wch: 20 }, { wch: 16 }, { wch: 24 }, { wch: 12 }, { wch: 60 }, { wch: 24 }, { wch: 24 },
        ]
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Print Requests')
        const filename = `Custom_Print_Requests_${new Date().toISOString().split('T')[0]}.xlsx`
        XLSX.writeFile(wb, filename)
        showToast('Export successful!', 'success')
    }

    const copyRequestId = async (id) => {
        try {
            await navigator.clipboard.writeText(id)
            showToast('Request ID copied.', 'success')
        } catch {
            showToast('Copy failed. Select the ID manually.', 'error')
        }
    }

    const openPeek = (r, editor = false) => {
        setMenuFor(null)
        setPeek({ id: r.requestId, editor })
    }

    const confirmCancel = async () => {
        const requestId = cancelTarget
        setCancelBusy(true)
        try {
            const res = await fetch('/api/admin/custom-print-requests', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestId, action: 'cancel' }),
            })
            if (!res.ok) throw new Error('Failed to cancel request')
            setCancelTarget(null)
            showToast('Request cancelled.', 'success')
            await load()
        } catch (e) {
            showToast(e.message || 'Failed to cancel request', 'error')
        } finally {
            setCancelBusy(false)
        }
    }

    const peekRequest = peek ? requests.find((r) => r.requestId === peek.id) : null

    const menuItemCls =
        'w-full text-left px-3 py-1.5 text-[13px] hover:bg-[var(--dash-canvas)] cursor-pointer'

    return (
        <div className="p-4 md:p-6">
            {/* Stable bar layout (client polish, 2026-07-05): tabs own the flexible
                left region and scroll inside it; the controls on the right are a
                shrink-0 group. Growing tab counts never push anything around. */}
            <GlassBar>
                <ViewTabs
                    className="flex-1 min-w-0"
                    tabs={VIEWS.map((v) => ({ key: v.key, label: v.label, count: counts[v.key] }))}
                    active={view}
                    onChange={setView}
                    data-tour="requests-views"
                />
                <div className="flex items-center gap-2 shrink-0">
                    <label
                        data-tour="requests-search"
                        className="flex items-center gap-2 bg-[var(--dash-card)] border border-[var(--dash-line)] rounded-full px-3 py-1.5 w-[160px] sm:w-[220px] focus-within:border-[var(--dash-focus-line)] focus-within:shadow-[var(--dash-focus-ring)]"
                    >
                        <IoSearchOutline size={14} className="shrink-0 text-[var(--dash-ink-soft)]" aria-hidden="true" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search model, email, or ID…"
                            aria-label="Search requests"
                            className="dash-input-bare w-full min-w-0 bg-transparent outline-none text-[13px]"
                        />
                    </label>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={includeCreatorJobs}
                        onClick={() => setIncludeCreatorJobs((v) => !v)}
                        title="Jobs routed to a creator's own print service"
                        className={`dash-hoverable flex items-center gap-1.5 rounded-full border border-[var(--dash-line)] px-3.5 py-1.5 text-[13px] font-medium cursor-pointer ${
                            includeCreatorJobs
                                ? 'bg-[var(--dash-ink)] text-[var(--dash-canvas)]'
                                : 'bg-[var(--dash-card)] hover:bg-[var(--dash-canvas)]'
                        }`}
                    >
                        Include creator jobs{creatorJobCount > 0 ? ` (${creatorJobCount})` : ''}
                    </button>
                    <button
                        type="button"
                        onClick={exportToExcel}
                        disabled={visible.length === 0}
                        data-tour="requests-export"
                        className="dash-hoverable flex items-center gap-1.5 rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] px-3.5 py-1.5 text-[13px] font-medium cursor-pointer hover:bg-[var(--dash-canvas)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <IoDownloadOutline size={14} aria-hidden="true" /> Export
                    </button>
                    <FreshnessStamp at={fetchedAt} className="hidden md:inline" />
                    <TourHelpButton onClick={() => setTourOpen(true)} />
                </div>
            </GlassBar>

            {tourOffer.offered && !tourOpen && (
                <TourOfferStrip
                    className="mt-4"
                    onStart={() => { tourOffer.accept(); setTourOpen(true) }}
                    onDismiss={tourOffer.dismiss}
                />
            )}

            <div className="mt-4" data-tour="requests-list">
                {loading ? (
                    <div className="flex flex-col gap-3" aria-label="Loading requests">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <SkeletonRow key={i} />
                        ))}
                    </div>
                ) : error ? (
                    <EmptyState
                        icon={<IoAlertCircleOutline />}
                        title="Couldn't Load Requests"
                        body={error}
                        cta="Retry"
                        onCta={load}
                    />
                ) : requests.length === 0 ? (
                    <EmptyState
                        icon={<IoFileTrayOutline />}
                        title="No Print Requests Yet"
                        body="Customer print requests will appear here as soon as they come in."
                    />
                ) : visible.length === 0 ? (
                    <EmptyState
                        icon={<IoSearchOutline />}
                        title="No Matching Requests"
                        body="Nothing matches the current search or view."
                        secondary="Clear filters"
                        onSecondary={() => { setSearch(''); setView('all') }}
                    />
                ) : (
                    <div className="flex flex-col gap-3">
                        {visible.map((r) => {
                            const needsQuote = NEEDS_QUOTE_SET.has(r.status)
                            const material = r.printConfiguration?.printSettings?.materialType
                            const swatches = [...new Set(Object.values(normalizeMeshColors(r.printConfiguration?.meshColors)))].slice(0, 5)
                            const printHours = r.quote?.inputs?.printHours
                            return (
                                <div
                                    key={r.requestId}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => openPeek(r)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') openPeek(r) }}
                                    className="text-left"
                                >
                                    <DashCard interactive className="cursor-pointer">
                                        <div className="flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
                                            <div className="min-w-0">
                                                <p className="text-[13px] font-semibold truncate">
                                                    {r.modelFile?.originalName || 'Custom print'}
                                                </p>
                                                <p className="text-[13px] dash-soft truncate">{r.userEmail}</p>
                                                {r.creatorUserId && (
                                                    <Tag className="!h-5">Creator: {r.creatorDisplayName || 'Creator'}</Tag>
                                                )}
                                                <button
                                                    type="button"
                                                    title="Copy request ID"
                                                    onClick={(e) => { e.stopPropagation(); copyRequestId(r.requestId) }}
                                                    className="dash-data dash-soft hover:text-[var(--dash-ink)] cursor-pointer"
                                                >
                                                    {r.requestId}
                                                </button>
                                            </div>
                                            {(material || swatches.length > 0 || Number.isFinite(printHours)) && (
                                                <div className="hidden md:flex items-center gap-2 min-w-0">
                                                    {material && <span className="dash-data dash-soft">{material}</span>}
                                                    {swatches.length > 0 && (
                                                        <>
                                                            {material && <span className="h-3 w-px bg-[var(--dash-line)]" aria-hidden="true" />}
                                                            <span className="flex items-center gap-1">
                                                                {swatches.map((color) => (
                                                                    <span
                                                                        key={color}
                                                                        className="h-3 w-3 rounded-full border border-[var(--dash-line)]"
                                                                        style={{ backgroundColor: color }}
                                                                        aria-hidden="true"
                                                                    />
                                                                ))}
                                                            </span>
                                                        </>
                                                    )}
                                                    {Number.isFinite(printHours) && (
                                                        <>
                                                            <span className="h-3 w-px bg-[var(--dash-line)]" aria-hidden="true" />
                                                            <span className="dash-data dash-soft whitespace-nowrap">
                                                                ≈ {Number(printHours).toFixed(1)} h
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                            <div className="flex items-center gap-2 shrink-0">
                                                <StatusPill tone={statusTone(r.status)}>
                                                    {STATUS_LABELS[r.status] || r.status}
                                                </StatusPill>
                                                {needsQuote && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); openPeek(r, true) }}
                                                        className="dash-hoverable rounded-full px-3.5 py-1.5 text-[13px] font-medium bg-[var(--dash-sun)] text-[var(--dash-ink)] cursor-pointer hover:bg-[var(--dash-sun-deep)] active:scale-[0.97]"
                                                    >
                                                        Quote
                                                    </button>
                                                )}
                                                <div className="relative">
                                                    <button
                                                        type="button"
                                                        aria-label="More actions"
                                                        aria-haspopup="menu"
                                                        aria-expanded={menuFor === r.requestId}
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setMenuFor((m) => (m === r.requestId ? null : r.requestId))
                                                        }}
                                                        className="dash-hoverable h-7 w-7 grid place-items-center rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] hover:bg-[var(--dash-canvas)] cursor-pointer"
                                                    >
                                                        <IoEllipsisHorizontal size={14} aria-hidden="true" />
                                                    </button>
                                                    {menuFor === r.requestId && (
                                                        <>
                                                            <div
                                                                className="fixed inset-0 z-20"
                                                                onClick={(e) => { e.stopPropagation(); setMenuFor(null) }}
                                                            />
                                                            <div
                                                                role="menu"
                                                                className="absolute right-0 top-full mt-1 z-30 min-w-[180px] py-1 bg-[var(--dash-card)] border border-[var(--dash-line)] rounded-[var(--dash-r-inner)] shadow-[var(--dash-shadow-float)]"
                                                            >
                                                                {r.modelFile?.s3Key && (
                                                                    <button
                                                                        type="button"
                                                                        role="menuitem"
                                                                        onClick={(e) => { e.stopPropagation(); setMenuFor(null); downloadModel(r) }}
                                                                        className={menuItemCls}
                                                                    >
                                                                        Download model
                                                                    </button>
                                                                )}
                                                                {r.printConfiguration && (
                                                                    <button
                                                                        type="button"
                                                                        role="menuitem"
                                                                        onClick={(e) => { e.stopPropagation(); setMenuFor(null); downloadConfig(r) }}
                                                                        className={menuItemCls}
                                                                    >
                                                                        Download config
                                                                    </button>
                                                                )}
                                                                {r.status !== 'cancelled' && (
                                                                    <button
                                                                        type="button"
                                                                        role="menuitem"
                                                                        onClick={(e) => { e.stopPropagation(); setMenuFor(null); setCancelTarget(r.requestId) }}
                                                                        className={`${menuItemCls} text-[var(--dash-bad)]`}
                                                                    >
                                                                        Cancel request
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </DashCard>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            <RequestPeek
                request={peekRequest}
                open={Boolean(peekRequest)}
                initialEditor={Boolean(peek?.editor)}
                adminSettings={adminSettings}
                onClose={() => setPeek(null)}
                onChanged={load}
                onCancelRequest={(id) => setCancelTarget(id)}
                onDownloadModel={downloadModel}
                onDownloadConfig={downloadConfig}
            />

            <ConfirmDialog
                open={Boolean(cancelTarget)}
                onClose={() => setCancelTarget(null)}
                onConfirm={confirmCancel}
                title="Cancel this request?"
                body="The customer will see this request as cancelled. This can't be undone."
                confirmLabel="Cancel request"
                cancelLabel="Keep request"
                tone="bad"
                busy={cancelBusy}
            />

            {/* Guided tour (§9.11) */}
            <CoachMarks
                steps={TOURS.customPrintRequests}
                open={tourOpen}
                onClose={() => setTourOpen(false)}
                panelKey="customPrintRequests"
            />
        </div>
    )
}
