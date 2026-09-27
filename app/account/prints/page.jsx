'use client'
// Custom print requests as a customer job-tracking view: one job card per
// request (StatusPill vocabulary), the quote breakdown as dotted-leader rows
// when quoted, and a progress Timeline from statusHistory. The customer-facing
// mirror of the admin job queue. Endpoints and action links are unchanged
// (/api/account/custom-print, /prints/request?requestId=, /cart?addCustomRequest=).
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import AccountShell from '@/components/Account/AccountShell'
import { printRequestTone, printStatusLabel, money } from '@/components/Account/accountUi'
import { useToast } from '@/components/General/ToastProvider'
import { DashCard, DottedRow, EmptyState, StatusPill, Tag, Timeline, SkeletonTile } from '@/components/dashboard-ui'
import { customPrintDisplayPrice } from '@/lib/customPrintDisplayPrice'
import { estimateLines, hasEstimate } from '@/lib/customPrint/estimateLines'

export default function AccountPrintRequestsPage() {
    const { user, isLoaded } = useUser()
    const router = useRouter()
    const { showToast } = useToast()
    const [requests, setRequests] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!isLoaded) return
        if (!user) {
            setLoading(false)
            return
        }

        const load = async () => {
            try {
                const res = await fetch('/api/account/custom-print')
                if (!res.ok) throw new Error('Failed to load requests')
                const data = await res.json()
                setRequests(data.requests || [])
            } catch (e) {
                console.error(e)
            } finally {
                setLoading(false)
            }
        }

        load()
    }, [isLoaded, user])

    const header = (
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
                <p className="dash-label">Custom prints</p>
                <h1 className="dash-title mt-1">Print requests</h1>
                <p className="dash-data dash-soft mt-1">
                    Track each job from upload to delivery, and pay once a quote is ready.
                </p>
            </div>
            <Link
                href="/prints/request"
                className="dash-hoverable inline-flex w-fit items-center rounded-full bg-[var(--dash-ink)] text-[var(--dash-canvas)] px-4 py-2 text-[13px] font-medium"
            >
                New request
            </Link>
        </div>
    )

    if (!isLoaded || loading) {
        return (
            <AccountShell active="prints" header={header}>
                <div className="flex flex-col gap-4">
                    <SkeletonTile />
                    <SkeletonTile />
                </div>
            </AccountShell>
        )
    }

    if (!user) {
        return (
            <AccountShell active="prints" header={header}>
                <div className="bg-[var(--dash-card)] border border-[var(--dash-line)] rounded-[var(--dash-r-card)]">
                    <EmptyState
                        title="Sign In to View Requests"
                        body="Please sign in to view your custom print requests."
                        cta="Sign In"
                        onCta={() => router.push('/sign-in?redirect=/account/prints')}
                    />
                </div>
            </AccountShell>
        )
    }

    return (
        <AccountShell active="prints" header={header}>
            {requests.length === 0 ? (
                <div className="bg-[var(--dash-card)] border border-[var(--dash-line)] rounded-[var(--dash-r-card)]">
                    <EmptyState
                        title="No Print Requests Yet"
                        body="Upload a model and we will quote and print it for you."
                        cta="Start a Request"
                        onCta={() => router.push('/prints/request')}
                    />
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    {requests.map((r) => {
                        const base = Number(r.basePrice || 0)
                        const fee = Number(r.printFee || 0)
                        // Same selector the cart and checkout use: instant quotes
                        // store quote.total, manual quotes basePrice + printFee.
                        const priced = customPrintDisplayPrice(r)
                        const quoted = priced.amount
                        const currency = (r.currency || 'SGD').toUpperCase()
                        const creatorJob = Boolean(r.creatorUserId)
                        // TODO(phase5-connect): creator jobs become payable in-cart once
                        // Stripe Connect lands; until then payment is arranged off-platform.
                        const canAddToCart =
                            !creatorJob && (r.status === 'quoted' || r.status === 'payment_pending') && quoted > 0
                        // Instant-quote lines only; a manual quote's price is
                        // basePrice + printFee even if an old quote object lingers.
                        const quoteLines = priced.source === 'instant' ? (r.quote?.lines || []) : []
                        const history = r.statusHistory || []
                        // A print farm's estimate (saved when the request was sent);
                        // the creator's own quote, when sent, is shown below it.
                        const estimate = creatorJob && hasEstimate(r) ? r.estimate : null
                        const farmName = r.creatorDisplayName || 'the creator'

                        return (
                            <DashCard key={r.requestId}>
                                <div className="flex flex-col gap-4">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="dash-section min-w-0 truncate">
                                            {r.modelFile?.originalName || 'Custom print'}
                                        </p>
                                        <span className="flex items-center gap-2">
                                            {creatorJob && (
                                                <Tag>Handled by {r.creatorDisplayName || 'creator'}</Tag>
                                            )}
                                            <StatusPill tone={printRequestTone(r.status)}>
                                                {printStatusLabel[r.status] || r.status}
                                            </StatusPill>
                                        </span>
                                    </div>

                                    {/* Request ids are admin-facing only; the model name identifies
                                        the job for the customer. */}

                                    {estimate && (
                                        <section className="max-w-md" aria-label={`Estimate from ${farmName}`}>
                                            <h4 className="dash-label mb-1">Estimate from {farmName}</h4>
                                            {estimateLines(estimate).map((line) => (
                                                <DottedRow key={line.key} label={line.label}>
                                                    {currency} {money(line.amount)}
                                                </DottedRow>
                                            ))}
                                            <div className="mt-1 pt-1 border-t border-[var(--dash-line)]">
                                                <DottedRow label="Estimate total">
                                                    <span className="font-medium">
                                                        {(estimate.currency || r.currency || 'SGD').toUpperCase()} {money(estimate.total)}
                                                    </span>
                                                </DottedRow>
                                            </div>
                                            <p className="dash-data dash-soft mt-1.5">
                                                {farmName} confirms the final price. Payment is arranged directly with the creator.
                                            </p>
                                        </section>
                                    )}

                                    {/* Quote breakdown, when a quote exists. */}
                                    {/* A creator's quote stays visible after they accept the job. */}
                                    {quoted > 0 && (r.status === 'quoted' || r.status === 'payment_pending'
                                        || (creatorJob && fee > 0 && r.status !== 'cancelled')) && (
                                        <section className="max-w-md">
                                            <h4 className="dash-label mb-1">{creatorJob ? `Quote from ${farmName}` : 'Quote'}</h4>
                                            {quoteLines.length > 0 ? (
                                                <>
                                                    {quoteLines.map((line) => (
                                                        <DottedRow key={line.key || line.label} label={line.label}>
                                                            {currency} {money(line.amount)}
                                                        </DottedRow>
                                                    ))}
                                                    {r.quote?.expedite?.applied && (
                                                        <DottedRow label="Expedite">
                                                            {currency} {money(r.quote.expedite.amount)}
                                                        </DottedRow>
                                                    )}
                                                </>
                                            ) : creatorJob ? (
                                                r.adminNote ? <p className="dash-data dash-soft mb-1">{r.adminNote}</p> : null
                                            ) : (
                                                <>
                                                    <DottedRow label="Base price">
                                                        {currency} {money(base)}
                                                    </DottedRow>
                                                    <DottedRow label="Print fee">
                                                        {currency} {money(fee)}
                                                    </DottedRow>
                                                </>
                                            )}
                                            <div className="mt-1 pt-1 border-t border-[var(--dash-line)]">
                                                <DottedRow label="Total">
                                                    <span className="font-medium">
                                                        {currency} {money(quoted)}
                                                    </span>
                                                </DottedRow>
                                            </div>
                                            <p className="dash-data dash-soft mt-1.5">
                                                {creatorJob
                                                    ? 'Payment is arranged directly with the creator.'
                                                    : 'Delivery is chosen at checkout.'}
                                            </p>
                                        </section>
                                    )}

                                    {/* Progress timeline from statusHistory. */}
                                    {history.length > 0 && (
                                        <section>
                                            <h4 className="dash-label">Progress</h4>
                                            <Timeline
                                                items={[...history].reverse().map((h, i) => ({
                                                    id: i,
                                                    title: printStatusLabel[h.status] || h.status,
                                                    at: h.updatedAt,
                                                    note: h.note,
                                                }))}
                                            />
                                        </section>
                                    )}

                                    <div className="flex flex-wrap items-center gap-2 pt-1">
                                        <Link
                                            href={`/prints/request?requestId=${encodeURIComponent(r.requestId)}`}
                                            className="dash-hoverable inline-flex items-center rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] px-3.5 py-1.5 text-[12px] font-medium dash-soft hover:text-[var(--dash-ink)] hover:bg-[var(--dash-canvas)]"
                                        >
                                            Open request
                                        </Link>
                                        {canAddToCart && (
                                            <Link
                                                href={`/cart?addCustomRequest=${encodeURIComponent(r.requestId)}`}
                                                className="dash-hoverable inline-flex items-center rounded-full bg-[var(--dash-ink)] text-[var(--dash-canvas)] px-3.5 py-1.5 text-[12px] font-medium"
                                            >
                                                {r.status === 'quoted' ? 'Add quoted print to cart' : 'Add to cart'}
                                            </Link>
                                        )}
                                    </div>
                                </div>
                            </DashCard>
                        )
                    })}
                </div>
            )}
        </AccountShell>
    )
}
