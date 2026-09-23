'use client'
import { useEffect, useState } from 'react'

const dateValue = value => value ? new Date(value).toISOString().slice(0, 10) : ''
const dayLabel = value => value ? new Date(value).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const defaultExpiry = () => dateValue(new Date(Date.now() + 365 * 86400000))

export default function CreatorSubscriptions() {
    const [rows, setRows] = useState([])
    const [total, setTotal] = useState(0)
    const [offset, setOffset] = useState(0)
    const [query, setQuery] = useState('')
    const [search, setSearch] = useState('')
    const [selectedId, setSelectedId] = useState(null)
    const [planId, setPlanId] = useState('standard')
    const [expiresAt, setExpiresAt] = useState(defaultExpiry)
    const [products, setProducts] = useState('')
    const [requests, setRequests] = useState('')
    const [busy, setBusy] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [message, setMessage] = useState('')

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError('')
        fetch(`/api/admin/creator-subscriptions?offset=${offset}&q=${encodeURIComponent(search)}`, { cache: 'no-store' })
            .then(async response => { if (!response.ok) throw new Error((await response.json()).error || 'Unable to load accounts.'); return response.json() })
            .then(data => { if (!cancelled) { setRows(data.rows || []); setTotal(data.totalCount || 0) } })
            .catch(err => { if (!cancelled) setError(err.message) })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [offset, search])

    const selected = rows.find(row => row.userId === selectedId)
    function choose(row) {
        setSelectedId(row.userId)
        setPlanId(row.grant?.planId || 'standard')
        setExpiresAt(dateValue(row.grant?.expiresAt) || defaultExpiry())
        setProducts(row.quota?.products == null ? '' : String(row.quota.products))
        setRequests(row.quota?.monthlyPrintRequests == null ? '' : String(row.quota.monthlyPrintRequests))
        setMessage('')
        setError('')
    }
    async function update(payload) {
        if (!selected || busy) return
        setBusy(true)
        setError('')
        setMessage('')
        try {
            const response = await fetch('/api/admin/creator-subscriptions', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...payload, userId: selected.userId }),
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || 'Unable to update access.')
            setRows(current => current.map(row => row.userId === data.row.userId ? data.row : row))
            setMessage('Creator access updated.')
        } catch (err) { setError(err.message) }
        finally { setBusy(false) }
    }
    const expiryIso = expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null
    const quotaValue = value => value.trim() === '' ? null : Number(value)

    return <div className="space-y-6">
        <div>
            <h2 className="text-xl font-semibold">Creator subscriptions</h2>
            <p className="text-sm dash-soft mt-1">See paid and complimentary access, grant time-limited plans, and adjust individual listing or request limits.</p>
        </div>
        <form onSubmit={event => { event.preventDefault(); setOffset(0); setSearch(query.trim()) }} className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="creator-search">Search accounts</label>
            <input id="creator-search" className="min-w-56 flex-1 rounded-xl border border-[var(--dash-line)] bg-[var(--dash-card)] px-3 py-2" placeholder="Search name, email or account ID" value={query} onChange={event => setQuery(event.target.value)} />
            <button type="submit" className="rounded-xl bg-[var(--dash-ink)] px-4 py-2 text-[var(--dash-canvas)]">Search</button>
        </form>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="text-sm text-green-700">{message}</p>}
        <div className="overflow-x-auto rounded-2xl border border-[var(--dash-line)] bg-[var(--dash-card)]">
            <table className="w-full min-w-[690px] text-left text-sm">
                <thead className="border-b border-[var(--dash-line)]"><tr><th className="p-3">Account</th><th className="p-3">Plan</th><th className="p-3">Access</th><th className="p-3">Ends / renews</th><th className="p-3">Limits</th><th className="p-3"><span className="sr-only">Manage</span></th></tr></thead>
                <tbody>{rows.map(row => <tr key={row.userId} className="border-b border-[var(--dash-line)] last:border-b-0">
                    <td className="p-3"><strong>{row.name}</strong><br /><span className="dash-soft">{row.email || row.userId}</span></td>
                    <td className="p-3">{row.isAdmin ? 'Admin' : row.planId === 'free' ? 'Free' : row.planId === 'student' ? 'Student' : row.planId === 'standard' ? 'Standard' : row.planId === 'pro' ? 'Pro' : row.planId}</td>
                    <td className="p-3">{row.source === 'stripe' ? 'Paid' : row.source === 'complimentary' ? 'Complimentary' : row.status === 'unavailable' ? 'Check billing' : row.hasOpenSubscription ? `Billing: ${row.status.replaceAll('_', ' ')}` : 'Free'}{row.cancelAtPeriodEnd ? ' · ending' : ''}</td>
                    <td className="p-3">{dayLabel(row.source === 'complimentary' ? row.expiry : row.billingPeriodEnd ? row.billingPeriodEnd * 1000 : null)}</td>
                    <td className="p-3">{row.limits.products?.toLocaleString() ?? '—'} listings<br />{row.limits.monthlyPrintRequests?.toLocaleString() ?? '—'} requests/mo</td>
                    <td className="p-3"><button type="button" onClick={() => choose(row)} className="underline underline-offset-2">Manage</button></td>
                </tr>)}</tbody>
            </table>
            {!loading && !rows.length && <p className="p-5 text-sm dash-soft">No accounts found.</p>}
            {loading && <p className="p-5 text-sm dash-soft">Loading accounts…</p>}
        </div>
        <div className="flex items-center justify-between text-sm">
            <span>{total ? `${offset + 1}–${Math.min(offset + 20, total)} of ${total} accounts` : 'No accounts'}</span>
            <div className="flex gap-2"><button disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - 20))} className="rounded-xl border px-3 py-1 disabled:opacity-40">Previous</button><button disabled={offset + 20 >= total || loading} onClick={() => setOffset(offset + 20)} className="rounded-xl border px-3 py-1 disabled:opacity-40">Next</button></div>
        </div>
        {selected && <section className="rounded-2xl border border-[var(--dash-line)] bg-[var(--dash-card)] p-5 space-y-5">
            <div><h3 className="font-semibold">Manage {selected.name}</h3><p className="text-sm dash-soft">{selected.email || selected.userId}</p></div>
            {selected.hasOpenSubscription && <p className="text-sm">This account has a Stripe subscription. Complimentary access is unavailable until billing ends. You can still adjust its limits.</p>}
            {!selected.isAdmin && <>
                <div className="grid gap-3 sm:grid-cols-3 items-end">
                    <label className="text-sm">Complimentary plan<select value={planId} onChange={event => setPlanId(event.target.value)} className="mt-1 block w-full rounded-xl border p-2"><option value="student">Student</option><option value="standard">Standard</option><option value="pro">Pro</option></select></label>
                    <label className="text-sm">Access until<input type="date" value={expiresAt} onChange={event => setExpiresAt(event.target.value)} className="mt-1 block w-full rounded-xl border p-2" /></label>
                    <button type="button" disabled={busy || selected.hasOpenSubscription || selected.status === 'unavailable' || !expiresAt} onClick={() => update({ action: 'grant', planId, expiresAt: expiryIso })} className="rounded-xl bg-[var(--dash-ink)] px-4 py-2 text-[var(--dash-canvas)] disabled:opacity-40">Grant / change plan</button>
                </div>
                {selected.grant && <div className="flex flex-wrap items-center gap-3 text-sm"><span>Grant record: {selected.grant.planId}, until {dayLabel(selected.grant.expiresAt)}{new Date(selected.grant.expiresAt) <= new Date() ? ' (expired)' : ''}</span><button type="button" disabled={busy || selected.hasOpenSubscription} onClick={() => update({ action: 'extend', expiresAt: expiryIso })} className="rounded-xl border px-3 py-2 disabled:opacity-40">Extend expiry</button><button type="button" disabled={busy} onClick={() => update({ action: 'revoke' })} className="rounded-xl border px-3 py-2 disabled:opacity-40">Remove grant</button></div>}
                <div className="border-t border-[var(--dash-line)] pt-4 space-y-3">
                    <h4 className="font-medium">Individual limits</h4>
                    <p className="text-sm dash-soft">Leave a field blank to use its plan limit.</p>
                    <div className="grid gap-3 sm:grid-cols-3 items-end"><label className="text-sm">Product listings<input type="number" min="0" max="100000" step="1" value={products} onChange={event => setProducts(event.target.value)} className="mt-1 block w-full rounded-xl border p-2" placeholder={String(selected.limits.products)} /></label><label className="text-sm">Requests per month<input type="number" min="0" max="100000" step="1" value={requests} onChange={event => setRequests(event.target.value)} className="mt-1 block w-full rounded-xl border p-2" placeholder={String(selected.limits.monthlyPrintRequests)} /></label><button type="button" disabled={busy} onClick={() => update({ action: 'quota', quota: { products: quotaValue(products), monthlyPrintRequests: quotaValue(requests) } })} className="rounded-xl border px-4 py-2 disabled:opacity-40">Save limits</button></div>
                </div>
            </>}
        </section>}
    </div>
}
