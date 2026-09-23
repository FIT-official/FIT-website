'use client'
// Creator print jobs (/dashboard/print-jobs) — every CustomPrintRequest routed
// to this creator's print service. Job queue chassis like the admin queue:
// ViewTabs over the lifecycle, compact job cards, and a PeekPanel drawer with
// the model download, the customer's brief, the timeline and the creator's
// actions (quote / accept / printing / ready / completed / decline). Status
// vocabulary is the existing CustomPrintRequest one; the mapping from actions
// to statuses lives in lib/creatorPrintService/jobTransitions.js.
import { useEffect, useMemo, useState } from 'react'
import { IoDownloadOutline, IoFileTrayOutline, IoAlertCircleOutline } from 'react-icons/io5'
import { useToast } from '@/components/General/ToastProvider'
import { CreatorGate } from '@/components/DashboardComponents/CreatorShell'
import { printRequestTone, money } from '@/components/Account/accountUi'
import {
    DashCard,
    ViewTabs,
    StatusPill,
    PeekPanel,
    DottedRow,
    Timeline,
    ConfirmDialog,
    EmptyState,
    SkeletonRow,
    FreshnessStamp,
} from '@/components/dashboard-ui'
import { availableCreatorActions } from '@/lib/creatorPrintService/jobTransitions'

// Creator-facing labels over the shared status vocabulary.
export const JOB_STATUS_LABELS = {
    pending_upload: 'Awaiting model',
    pending_config: 'Awaiting details',
    configured: 'Needs quote',
    quoted: 'Quoted',
    payment_pending: 'Quoted',
    paid: 'Accepted',
    printing: 'Printing',
    printed: 'Ready',
    shipped: 'Shipped',
    delivered: 'Completed',
    cancelled: 'Declined',
}

const VIEWS = [
    { key: 'all', label: 'All' },
    { key: 'needs_quote', label: 'Needs quote', statuses: ['pending_upload', 'pending_config', 'configured'] },
    { key: 'quoted', label: 'Quoted', statuses: ['quoted', 'payment_pending'] },
    { key: 'active', label: 'In progress', statuses: ['paid', 'printing', 'printed', 'shipped'] },
    { key: 'done', label: 'Done', statuses: ['delivered', 'cancelled'] },
]

const ACTION_LABELS = {
    quote: 'Send quote',
    accept: 'Accept job',
    printing: 'Mark printing',
    ready: 'Mark ready',
    completed: 'Mark completed',
    reject: 'Decline',
}

const inputCls =
    'w-full rounded-[var(--dash-r-inner)] border border-[var(--dash-line)] bg-[var(--dash-card)] px-3 py-2 text-[13px] focus:outline-none focus:border-[var(--dash-focus-line)] focus:shadow-[var(--dash-focus-ring)]'
const pillBtn =
    'dash-hoverable inline-flex items-center rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] px-3.5 py-1.5 text-[12px] font-medium cursor-pointer hover:bg-[var(--dash-canvas)] disabled:opacity-50 disabled:cursor-not-allowed'
const primaryBtn =
    'dash-hoverable inline-flex items-center rounded-full bg-[var(--dash-ink)] text-[var(--dash-canvas)] px-3.5 py-1.5 text-[12px] font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'

const downloadHref = (job) => {
    const key = job?.modelFile?.s3Key
    if (!key) return null
    const name = job.modelFile.originalName || key.split('/').pop() || 'model.stl'
    return `/api/proxy?key=${encodeURIComponent(key)}&download=1&filename=${encodeURIComponent(name)}`
}

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }) : '')

function PrintJobs() {
    const { showToast } = useToast()
    const [jobs, setJobs] = useState([])
    const [fetchedAt, setFetchedAt] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [view, setView] = useState('all')
    const [peekId, setPeekId] = useState(null)
    const [busy, setBusy] = useState(false)
    const [quoteAmount, setQuoteAmount] = useState('')
    const [quoteNote, setQuoteNote] = useState('')
    const [rejectReason, setRejectReason] = useState('')
    const [rejectOpen, setRejectOpen] = useState(false)

    const load = async () => {
        setLoading(true)
        setError('')
        try {
            const res = await fetch('/api/user/print-jobs')
            if (!res.ok) throw new Error('Failed to load print jobs')
            const data = await res.json()
            setJobs(data.jobs || [])
            setFetchedAt(Date.now())
        } catch (e) {
            setError(e.message || 'Failed to load print jobs')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        load()
    }, [])

    const counts = useMemo(() => {
        const out = {}
        for (const v of VIEWS) out[v.key] = v.statuses ? jobs.filter((j) => v.statuses.includes(j.status)).length : jobs.length
        return out
    }, [jobs])

    const activeView = VIEWS.find((v) => v.key === view) || VIEWS[0]
    const visible = activeView.statuses ? jobs.filter((j) => activeView.statuses.includes(j.status)) : jobs
    const job = peekId ? jobs.find((j) => j.requestId === peekId) : null

    const openPeek = (j) => {
        setPeekId(j.requestId)
        setQuoteAmount(j.printFee ? String(j.printFee) : '')
        setQuoteNote(j.adminNote || '')
        setRejectReason('')
    }

    const act = async (action, extra = {}) => {
        if (!job) return
        setBusy(true)
        try {
            const res = await fetch(`/api/user/print-jobs/${encodeURIComponent(job.requestId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, ...extra }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || 'Action failed')
            setJobs((prev) => prev.map((j) => (j.requestId === job.requestId ? { ...j, ...data.job } : j)))
            showToast(action === 'quote' ? 'Quote sent to the customer.' : 'Job updated.', 'success')
            setRejectOpen(false)
        } catch (e) {
            showToast(e.message || 'Action failed', 'error')
        } finally {
            setBusy(false)
        }
    }

    const sendQuote = () => {
        const amount = Number(quoteAmount)
        if (!Number.isFinite(amount) || amount < 0) {
            showToast('Enter a quote amount in SGD.', 'error')
            return
        }
        act('quote', { amount, note: quoteNote })
    }

    const actions = job ? availableCreatorActions(job.status) : []
    const generic = job?.printConfiguration?.generic || {}
    const history = job?.statusHistory || []
    const quoted = job ? Number(job.basePrice || 0) + Number(job.printFee || 0) : 0
    const currency = (job?.currency || 'SGD').toUpperCase()

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                <div>
                    <p className="dash-label">Print on demand</p>
                    <h1 className="dash-title mt-1">Print jobs</h1>
                    <p className="dash-data dash-soft mt-1">
                        Requests sent to your print service. Quote, accept, and track each job. Payment is arranged directly with the customer.
                    </p>
                </div>
                <FreshnessStamp at={fetchedAt} />
            </div>

            <ViewTabs
                tabs={VIEWS.map((v) => ({ key: v.key, label: v.label, count: counts[v.key] }))}
                active={view}
                onChange={setView}
            />

            {loading ? (
                <div className="flex flex-col gap-3" aria-label="Loading print jobs">
                    {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}
                </div>
            ) : error ? (
                <EmptyState icon={<IoAlertCircleOutline />} title="Couldn't Load Jobs" body={error} cta="Retry" onCta={load} />
            ) : jobs.length === 0 ? (
                <EmptyState
                    icon={<IoFileTrayOutline />}
                    title="No Print Jobs Yet"
                    body="Turn on your print service and requests from your creator page will land here."
                />
            ) : visible.length === 0 ? (
                <EmptyState icon={<IoFileTrayOutline />} title="Nothing In This View" body="No jobs match the selected view." />
            ) : (
                <div className="flex flex-col gap-3">
                    {visible.map((j) => (
                        <div
                            key={j.requestId}
                            role="button"
                            tabIndex={0}
                            onClick={() => openPeek(j)}
                            onKeyDown={(e) => { if (e.key === 'Enter') openPeek(j) }}
                            className="text-left"
                        >
                            <DashCard interactive className="cursor-pointer">
                                <div className="flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
                                    <div className="min-w-0">
                                        <p className="text-[13px] font-semibold truncate">{j.modelFile?.originalName || 'Custom print'}</p>
                                        <p className="text-[13px] dash-soft truncate">{j.userName || j.userEmail}</p>
                                        <p className="dash-data dash-soft">
                                            {[j.printConfiguration?.generic?.material, j.printConfiguration?.generic?.colour].filter(Boolean).join(', ') || 'No material chosen'}
                                            {j.createdAt ? ` · ${fmtDate(j.createdAt)}` : ''}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {Number(j.printFee) > 0 && (
                                            <span className="dash-data dash-soft whitespace-nowrap">
                                                {(j.currency || 'SGD').toUpperCase()} {money(Number(j.basePrice || 0) + Number(j.printFee || 0))}
                                            </span>
                                        )}
                                        <StatusPill tone={printRequestTone(j.status)}>{JOB_STATUS_LABELS[j.status] || j.status}</StatusPill>
                                    </div>
                                </div>
                            </DashCard>
                        </div>
                    ))}
                </div>
            )}

            <PeekPanel
                open={Boolean(job)}
                onClose={() => setPeekId(null)}
                title={job?.modelFile?.originalName || 'Print job'}
                actions={job && <StatusPill tone={printRequestTone(job.status)}>{JOB_STATUS_LABELS[job.status] || job.status}</StatusPill>}
            >
                {job && (
                    <div className="flex flex-col gap-5">
                        <section>
                            <h4 className="dash-label mb-1">Customer</h4>
                            <DottedRow label="Name">{job.userName || 'Unknown'}</DottedRow>
                            <DottedRow label="Email">{job.userEmail}</DottedRow>
                            <DottedRow label="Requested">{fmtDate(job.createdAt) || 'n/a'}</DottedRow>
                        </section>

                        <section>
                            <h4 className="dash-label mb-1">Model</h4>
                            <DottedRow label="File">{job.modelFile?.originalName || 'Not uploaded yet'}</DottedRow>
                            <DottedRow label="Material">{generic.material || 'n/a'}</DottedRow>
                            <DottedRow label="Colour">{generic.colour || 'n/a'}</DottedRow>
                            {downloadHref(job) && (
                                <a href={downloadHref(job)} className={`${pillBtn} mt-2 gap-1.5`} download>
                                    <IoDownloadOutline size={14} aria-hidden="true" /> Download model
                                </a>
                            )}
                        </section>

                        <section>
                            <h4 className="dash-label mb-1">Customer note</h4>
                            <p className="text-[13px] whitespace-pre-wrap">{job.customerNote || 'No note left.'}</p>
                            {job.designSource?.url?.startsWith('https://') && <p className="mt-2 text-xs">
                                <a href={job.designSource.url} target="_blank" rel="noopener noreferrer" className="underline">Original design</a>
                                {job.designSource.attribution ? ` · ${job.designSource.attribution}` : ''}
                            </p>}
                        </section>

                        {quoted > 0 && (
                            <section>
                                <h4 className="dash-label mb-1">Quote</h4>
                                <DottedRow label="Total"><span className="font-medium">{currency} {money(quoted)}</span></DottedRow>
                                {job.adminNote && <p className="dash-data dash-soft mt-1">{job.adminNote}</p>}
                            </section>
                        )}

                        {actions.length > 0 && (
                            <section className="flex flex-col gap-3">
                                <h4 className="dash-label">Actions</h4>
                                {actions.includes('quote') && (
                                    <div className="flex flex-col gap-2 rounded-[var(--dash-r-inner)] border border-[var(--dash-line)] p-3">
                                        <label className="dash-label" htmlFor="quote-amount">Quote (SGD)</label>
                                        <input
                                            id="quote-amount"
                                            type="number"
                                            min={0}
                                            step={0.5}
                                            value={quoteAmount}
                                            onChange={(e) => setQuoteAmount(e.target.value)}
                                            className={inputCls}
                                            placeholder="e.g. 25"
                                        />
                                        <label className="dash-label" htmlFor="quote-note">Note to customer (optional)</label>
                                        <textarea
                                            id="quote-note"
                                            rows={2}
                                            maxLength={500}
                                            value={quoteNote}
                                            onChange={(e) => setQuoteNote(e.target.value)}
                                            className={inputCls}
                                            placeholder="Lead time, collection details, payment method"
                                        />
                                        <button type="button" onClick={sendQuote} disabled={busy} className={`${primaryBtn} w-fit`}>
                                            {job.status === 'quoted' ? 'Update quote' : ACTION_LABELS.quote}
                                        </button>
                                    </div>
                                )}
                                <div className="flex flex-wrap gap-2">
                                    {actions.filter((a) => a !== 'quote' && a !== 'reject').map((a) => (
                                        <button key={a} type="button" onClick={() => act(a)} disabled={busy} className={primaryBtn}>
                                            {ACTION_LABELS[a]}
                                        </button>
                                    ))}
                                    {actions.includes('reject') && (
                                        <button
                                            type="button"
                                            onClick={() => setRejectOpen(true)}
                                            disabled={busy}
                                            className={`${pillBtn} text-[var(--dash-bad)]`}
                                        >
                                            {ACTION_LABELS.reject}
                                        </button>
                                    )}
                                </div>
                                {actions.includes('accept') && (
                                    <p className="dash-data dash-soft">
                                        Accept once the customer has confirmed and paid you directly.
                                    </p>
                                )}
                            </section>
                        )}

                        {history.length > 0 && (
                            <section>
                                <h4 className="dash-label">Progress</h4>
                                <Timeline
                                    items={[...history].reverse().map((h, i) => ({
                                        id: i,
                                        title: JOB_STATUS_LABELS[h.status] || h.status,
                                        at: h.updatedAt,
                                        note: h.note,
                                    }))}
                                />
                            </section>
                        )}
                    </div>
                )}
            </PeekPanel>

            <ConfirmDialog
                open={rejectOpen}
                onClose={() => setRejectOpen(false)}
                onConfirm={() => {
                    if (!rejectReason.trim()) {
                        showToast('Give the customer a short reason.', 'error')
                        return
                    }
                    act('reject', { reason: rejectReason.trim() })
                }}
                title="Decline this job?"
                body={
                    // ConfirmDialog wraps body in a <p>, so keep this inline-only.
                    <span className="flex flex-col gap-2">
                        <span>The customer will see the job as declined with your reason.</span>
                        <input
                            aria-label="Reason"
                            value={rejectReason}
                            maxLength={500}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="e.g. Model is larger than my build volume"
                            className={inputCls}
                        />
                    </span>
                }
                confirmLabel="Decline job"
                cancelLabel="Keep job"
                tone="bad"
                busy={busy}
            />
        </div>
    )
}

export default function GatedPrintJobs() {
    return (
        <CreatorGate>
            <PrintJobs />
        </CreatorGate>
    )
}
