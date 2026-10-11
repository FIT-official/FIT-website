'use client'
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip } from 'recharts'
import { IoChevronDownOutline, IoChevronForwardOutline } from 'react-icons/io5'
import { settle, swapExit } from '@/lib/motion/tokens'
import { buildSetupChecklist, summarizeRequests } from '@/lib/admin/setupChecklist'
import AnalyticsPanel from '@/components/Admin/AnalyticsPanel'
import BusinessReportsPanel from '@/components/Admin/BusinessReportsPanel'
import {
    DashCard,
    StatTile,
    Sheet,
    EmptyState,
    FreshnessStamp,
    SkeletonTile,
} from '@/components/dashboard-ui'

const STATUS_LABELS = {
    pending_upload: 'Awaiting upload',
    pending_config: 'Awaiting config',
    configured: 'Awaiting quote',
    quoted: 'Quoted',
    payment_pending: 'Payment pending',
    paid: 'Paid',
    printing: 'Printing',
    printed: 'Printed',
    shipped: 'Shipped',
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Chart tokens per §4.7: 2px ink line, sun-soft fill, x-labels only at 11px
// ink-faint, no gridlines/legend/axis boxes.
const CHART_INK = '#111111'
const CHART_LABEL = '#a6a399'
const tooltipStyle = {
    fontSize: 11,
    border: '1px solid var(--dash-line)',
    borderRadius: 8,
    background: 'var(--dash-card)',
    boxShadow: 'var(--dash-shadow-card)',
}

/** Requests grouped per day over the trailing window, client-side (§9.9). */
function requestsPerDay(requests, days = 30) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const buckets = new Map()
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today)
        d.setDate(today.getDate() - i)
        buckets.set(d.toDateString(), {
            label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
            requests: 0,
        })
    }
    let total = 0
    for (const r of requests || []) {
        if (!r?.createdAt) continue
        const d = new Date(r.createdAt)
        if (Number.isNaN(d.getTime())) continue
        d.setHours(0, 0, 0, 0)
        const bucket = buckets.get(d.toDateString())
        if (bucket) {
            bucket.requests += 1
            total += 1
        }
    }
    return { data: [...buckets.values()], total }
}

/**
 * Dot-matrix source (§4.7): the trailing full weeks as Mon..Sun rows of
 * per-date request counts. Cells after today are null (not yet happened).
 */
function weekdayMatrix(requests, weeks = 4) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const monday = new Date(today)
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
    const start = new Date(monday)
    start.setDate(monday.getDate() - (weeks - 1) * 7)

    const counts = new Map()
    for (const r of requests || []) {
        if (!r?.createdAt) continue
        const d = new Date(r.createdAt)
        if (Number.isNaN(d.getTime())) continue
        d.setHours(0, 0, 0, 0)
        counts.set(d.toDateString(), (counts.get(d.toDateString()) || 0) + 1)
    }

    let peakKey = null
    let peak = 0
    let total = 0
    const rows = []
    for (let w = 0; w < weeks; w++) {
        const row = []
        for (let i = 0; i < 7; i++) {
            const d = new Date(start)
            d.setDate(start.getDate() + w * 7 + i)
            if (d > today) {
                row.push(null)
                continue
            }
            const key = d.toDateString()
            const count = counts.get(key) || 0
            total += count
            if (count > peak) {
                peak = count
                peakKey = key
            }
            row.push({
                key,
                count,
                label: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
            })
        }
        rows.push(row)
    }
    return { rows, peakKey, total }
}

/** Material frequency across the fetched requests, most-requested first. */
function materialMix(requests, top = 5) {
    const counts = new Map()
    for (const r of requests || []) {
        const raw =
            r?.printConfiguration?.printSettings?.materialType ||
            r?.printConfiguration?.generic?.material
        if (!raw) continue
        const label = String(raw).charAt(0).toUpperCase() + String(raw).slice(1)
        counts.set(label, (counts.get(label) || 0) + 1)
    }
    return [...counts.entries()]
        .map(([label, count]) => ({ key: label, label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, top)
}

/** Slim rounded ink bars (§4.7) with the count as a tabular numeral. */
function BarList({ rows, ariaLabel }) {
    const max = Math.max(...rows.map((r) => r.count), 1)
    return (
        <div className="flex flex-col gap-2.5" role="list" aria-label={ariaLabel}>
            {rows.map((r) => (
                <div
                    key={r.key}
                    role="listitem"
                    title={`${r.label}: ${r.count}`}
                    className="grid grid-cols-[7.5rem_minmax(0,1fr)_auto] items-center gap-3"
                >
                    <span className="text-[13px] dash-soft truncate">{r.label}</span>
                    <span className="h-1.5 rounded-full bg-[var(--dash-canvas)] overflow-hidden">
                        <span
                            className="block h-full rounded-full bg-[var(--dash-ink)]"
                            style={{ width: `${(r.count / max) * 100}%` }}
                        />
                    </span>
                    <span className="dash-data">{r.count}</span>
                </div>
            ))}
        </div>
    )
}

/**
 * Day-of-week dot matrix (§4.7): sun = had requests, ink = peak, faint = none.
 * Spans the full card width; there is no legend — each day explains itself on
 * hover ("Tue 2 Jul: 3 requests, the busiest day in this window").
 */
function WeekdayDotMatrix({ matrix }) {
    const busyness = (cell) => {
        if (cell.count === 0) return 'a quiet day'
        if (cell.key === matrix.peakKey) return 'the busiest day in this window'
        return 'had requests'
    }
    return (
        <div className="grid grid-cols-7 gap-x-2 gap-y-3 w-full" role="img" aria-label="Requests per day over the last four weeks. Hover a dot for that day's count.">
            {WEEKDAYS.map((d) => (
                <span key={d} className="dash-label text-center">{d}</span>
            ))}
            {matrix.rows.flat().map((cell, i) =>
                cell === null ? (
                    <span key={`future-${i}`} className="h-3.5 w-3.5 mx-auto" aria-hidden="true" />
                ) : (
                    <span
                        key={cell.key}
                        title={`${cell.label}: ${cell.count} request${cell.count === 1 ? '' : 's'}, ${busyness(cell)}`}
                        className={`h-3.5 w-3.5 mx-auto rounded-full cursor-default ${
                            cell.count === 0
                                ? 'border border-[var(--dash-line)] bg-[var(--dash-canvas)]'
                                : cell.key === matrix.peakKey
                                    ? 'bg-[var(--dash-ink)]'
                                    : 'bg-[var(--dash-sun)]'
                        }`}
                    />
                ),
            )}
        </div>
    )
}

function AdminEmailSheet({ open, onClose }) {
    const [copied, setCopied] = useState(false)
    const snippet = 'ADMIN_EMAIL=you@yourstore.com\nGMAIL_USER=you@gmail.com'
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(snippet)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch { /* clipboard unavailable; the text is selectable */ }
    }
    return (
        <Sheet open={open} onClose={onClose} label="Set the admin notification email">
            <div className="p-6 flex flex-col gap-3">
                <h3 className="dash-section">Set the Admin Notification Email</h3>
                <p className="text-[13px] dash-soft">
                    This one lives outside the dashboard: it&apos;s an environment variable, so it&apos;s
                    set where the app runs. Add either line to your <code className="dash-data">.env.local</code>{' '}
                    file (or your hosting provider&apos;s environment settings), then restart the app.
                </p>
                <pre className="dash-data bg-[var(--dash-card)] border border-[var(--dash-line)] rounded-[var(--dash-r-inner)] p-4 overflow-x-auto whitespace-pre">
                    {snippet}
                </pre>
                <p className="text-[13px] dash-soft">
                    <code className="dash-data">ADMIN_EMAIL</code> wins when both are set;{' '}
                    <code className="dash-data">GMAIL_USER</code> doubles as the sending account.
                    New print requests will email that address.
                </p>
                <div className="flex items-center gap-3 mt-1">
                    <button
                        onClick={copy}
                        className="dash-hoverable rounded-full px-4 py-2 text-[13px] font-medium bg-[var(--dash-sun)] text-[var(--dash-ink)] cursor-pointer hover:bg-[var(--dash-sun-deep)]"
                    >
                        {copied ? 'Copied' : 'Copy Snippet'}
                    </button>
                    <button onClick={onClose} className="text-[13px] dash-soft hover:text-[var(--dash-ink)] cursor-pointer">
                        Done
                    </button>
                </div>
            </div>
        </Sheet>
    )
}

/**
 * Store setup as an EPHEMERAL strip, not a resident card: dashed border and
 * hatch texture say "temporary, unfinished" (§4.1), like profile-completeness
 * steps. It expands into the checklist on demand and disappears entirely once
 * every step is configured (the wizard stays reachable from the palette).
 */
function SetupStrip({ items, done, onFix, onOpenWizard }) {
    const [expandedPref, setExpandedPref] = useState(null)
    const remaining = items.length - done
    const expanded = expandedPref ?? (done < items.length / 2)

    // All configured: the setup phase is over, so the strip leaves the room.
    if (remaining === 0) return null

    return (
        <div className="rounded-[var(--dash-r-card)] border border-dashed border-[var(--dash-focus-line)] px-5 py-3.5">
            <div className="flex items-center gap-3 flex-wrap">
                <button
                    onClick={() => setExpandedPref(!expanded)}
                    aria-expanded={expanded}
                    aria-controls="setup-checklist-rows"
                    className="dash-hoverable flex flex-1 min-w-0 items-center gap-3 text-left cursor-pointer"
                >
                    <span className="dash-hatch inline-block h-3 w-3 shrink-0 rounded-full border border-[var(--dash-line)]" aria-hidden="true" />
                    <span className="dash-section whitespace-nowrap">
                        Finish setting up your store: {remaining} step{remaining === 1 ? '' : 's'} left
                    </span>
                    <span className="flex h-1.5 flex-1 min-w-[64px] max-w-[240px] gap-1" aria-hidden="true">
                        {items.map((item) => (
                            <span
                                key={item.key}
                                className={`flex-1 rounded-full ${item.ok ? 'bg-[var(--dash-ink)]' : 'bg-[var(--dash-line)]'}`}
                            />
                        ))}
                    </span>
                    {expanded ? (
                        <IoChevronDownOutline size={14} className="text-[var(--dash-ink-soft)] shrink-0" aria-hidden />
                    ) : (
                        <IoChevronForwardOutline size={14} className="text-[var(--dash-ink-soft)] shrink-0" aria-hidden />
                    )}
                </button>
                <button
                    onClick={onOpenWizard}
                    className="dash-hoverable text-[12px] px-3 py-1 border border-[var(--dash-line)] rounded-full text-[var(--dash-ink-soft)] hover:text-[var(--dash-ink)] hover:bg-[var(--dash-sun-soft)] cursor-pointer whitespace-nowrap"
                >
                    Run setup wizard
                </button>
            </div>

            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        id="setup-checklist-rows"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0, transition: settle }}
                        exit={{ opacity: 0, transition: swapExit }}
                        className="divide-y divide-[var(--dash-line)] mt-3"
                    >
                        {items.map((item) => (
                            <div key={item.key} className="flex items-start gap-3 py-3 last:pb-1">
                                {item.ok ? (
                                    <span className="mt-0.5 text-[13px]" style={{ color: 'var(--dash-ok)' }} aria-hidden>
                                        ✓
                                    </span>
                                ) : (
                                    <span
                                        className="dash-hatch mt-1.5 inline-block h-3 w-3 shrink-0 rounded-full border border-[var(--dash-line)]"
                                        aria-hidden
                                    />
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-[14px]">{item.label}</p>
                                    {!item.ok && <p className="text-[12px] dash-soft mt-0.5">{item.consequence}</p>}
                                </div>
                                {!item.ok && (
                                    <button
                                        onClick={() => onFix(item)}
                                        className="dash-hoverable text-[12px] px-3 py-1 border border-[var(--dash-line)] rounded-full text-[var(--dash-ink-soft)] hover:text-[var(--dash-ink)] hover:bg-[var(--dash-sun-soft)] whitespace-nowrap cursor-pointer"
                                    >
                                        Fix now
                                    </button>
                                )}
                            </div>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

// Pure-render panel: the page owns the data (it also drives the wizard trigger).
export default function Overview({ setupData, requests, fetchedAt, onNavigate, onOpenWizard }) {
    const [emailSheetOpen, setEmailSheetOpen] = useState(false)

    if (!setupData) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <SkeletonTile />
                <SkeletonTile />
                <SkeletonTile />
            </div>
        )
    }

    const items = buildSetupChecklist(setupData)
    const done = items.filter((i) => i.ok).length
    const summary = summarizeRequests(requests)
    const activity = requestsPerDay(requests)
    const matrix = weekdayMatrix(requests)
    const materials = materialMix(requests)
    const statusRows = Object.keys(STATUS_LABELS)
        .filter((k) => summary.openByStatus[k])
        .map((k) => ({ key: k, label: STATUS_LABELS[k], count: summary.openByStatus[k] }))
        .concat(
            Object.entries(summary.openByStatus)
                .filter(([k]) => !STATUS_LABELS[k])
                .map(([k, count]) => ({ key: k, label: k, count })),
        )

    const fixNow = (item) => {
        // The env-var row can't be fixed by any tab; explain instead (§5.7).
        if (item.key === 'adminEmail') setEmailSheetOpen(true)
        else onNavigate(item.tab)
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between gap-3">
                <h2 className="dash-title">Overview</h2>
                <FreshnessStamp at={fetchedAt} />
            </div>

            {/* Hero cluster (§5.7/§9.9): the ink tile is the view's ONE black
                element; the quote tile claims the sun ONLY when it needs you. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatTile
                    label="Open print requests"
                    value={summary.openTotal}
                    hint="all active jobs"
                    variant="ink"
                    onClick={() => onNavigate('customPrintRequests')}
                    actionLabel="Open queue"
                />
                <StatTile
                    label="Awaiting your quote"
                    value={summary.unquoted}
                    hint="needs a price from you"
                    variant={summary.unquoted > 0 ? 'sun' : 'paper'}
                    onClick={() => onNavigate('customPrintRequests', 'needs_quote')}
                    actionLabel="Open queue"
                />
                <StatTile
                    label="Paid, not printing"
                    value={summary.paidNotPrinted}
                    hint="ready for the printer"
                    variant="paper"
                    onClick={() => onNavigate('customPrintRequests', 'paid')}
                    actionLabel="Open queue"
                />
            </div>

            {/* Visual band (§9.9, client directive: graphs first) — everything
                below derives client-side from the already-fetched requests. */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <DashCard title="Requests, last 30 days" className="lg:col-span-2">
                    {activity.total === 0 ? (
                        <EmptyState
                            title="No Requests Yet"
                            body="New print requests will chart here day by day as they arrive."
                            className="py-8"
                        />
                    ) : (
                        <ResponsiveContainer width="100%" height={180}>
                            <AreaChart data={activity.data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
                                <XAxis
                                    dataKey="label"
                                    tick={{ fontSize: 11, fill: CHART_LABEL }}
                                    tickLine={false}
                                    axisLine={false}
                                    minTickGap={32}
                                />
                                <Tooltip
                                    contentStyle={tooltipStyle}
                                    labelStyle={{ color: 'var(--dash-ink-soft)' }}
                                    cursor={{ stroke: 'var(--dash-line)' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="requests"
                                    stroke={CHART_INK}
                                    strokeWidth={2}
                                    fill="var(--dash-sun-soft)"
                                    fillOpacity={1}
                                    dot={false}
                                    activeDot={{ r: 4, fill: CHART_INK, strokeWidth: 0 }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </DashCard>

                <DashCard title="Open jobs by status">
                    {statusRows.length === 0 ? (
                        <p className="text-[13px] dash-soft py-2">
                            Nothing open right now. New jobs will break down here by pipeline stage.
                        </p>
                    ) : (
                        <BarList rows={statusRows} ariaLabel="Open jobs by status" />
                    )}
                </DashCard>

                <DashCard title="Busy days, last 4 weeks" className="lg:col-span-2">
                    {matrix.total === 0 ? (
                        <p className="text-[13px] dash-soft py-2">
                            Once requests arrive, this shows which days of the week are busiest.
                        </p>
                    ) : (
                        <WeekdayDotMatrix matrix={matrix} />
                    )}
                </DashCard>

                <DashCard title="Materials requested">
                    {materials.length === 0 ? (
                        <p className="text-[13px] dash-soft py-2">
                            The material mix will appear as configured requests come in.
                        </p>
                    ) : (
                        <BarList rows={materials} ariaLabel="Materials requested" />
                    )}
                </DashCard>
            </div>

            {/* Store setup, demoted to a compact collapsible strip (§5.7). */}
            <SetupStrip items={items} done={done} onFix={fixNow} onOpenWizard={onOpenWizard} />

            {/* Site analytics, demoted (§5.7): tiles + traffic line by default,
                the rest behind the panel's own "Full analytics" disclosure. */}
            <AnalyticsPanel compact />
            <BusinessReportsPanel />

            <AdminEmailSheet open={emailSheetOpen} onClose={() => setEmailSheetOpen(false)} />
        </div>
    )
}
