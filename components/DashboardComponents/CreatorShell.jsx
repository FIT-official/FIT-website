'use client'
// Creator shell (blueprint §5.1) — the shared rail + canvas layout provider
// for every /dashboard/* page, wired once via app/dashboard/layout.jsx. The
// rail sits ON the paper canvas (Tier 0, no border box); the active route is
// the only ink pill (usePathname). The shop identity block (display name +
// inline edit) lives at the rail top and is shared with subpages through
// ShopIdentityContext so the home greeting stays in sync with rail edits.
// Mobile: the rail collapses to a top block with a wrapping pill nav.
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { IoPencilOutline, IoStorefrontOutline } from 'react-icons/io5'
import { DashProvider } from '@/components/dashboard-ui'
import useAccess from '@/utils/useAccess'
import useEntitlements from '@/utils/useEntitlements'
import Fallback from '@/app/dashboard/Fallback'
import NotificationsBell from './NotificationsBell'

const ShopIdentityContext = createContext({ displayName: '', displayNameAvailable: false })

/** Shop identity shared from the rail: `{ displayName, displayNameAvailable }`. */
export const useShopIdentity = () => useContext(ShopIdentityContext)

// creatorOnly links require a paid subscription (or admin) — the same
// entitlement that unlocks the dashboard itself. Without it the rail shows
// only Home (which renders the upgrade Fallback) and Account settings.
export const NAV_LINKS = [
    { href: '/dashboard', label: 'Home', exact: true },
    { href: '/dashboard/products', label: 'My products', creatorOnly: true },
    { href: '/dashboard/print-jobs', label: 'Print jobs', creatorOnly: true },
    { href: '/dashboard/print-service', label: 'Print service', creatorOnly: true },
    { href: '/dashboard/services', label: 'Custom services', creatorOnly: true },
    { href: '/dashboard/service-jobs', label: 'Service jobs', creatorOnly: true },
    { href: '/dashboard/shop', label: 'My shop', icon: IoStorefrontOutline, creatorOnly: true },
    { href: '/dashboard/messages', label: 'Messages', creatorOnly: true },
    { href: '/dashboard/payouts', label: 'Payouts', creatorOnly: true },
    { href: '/dashboard/discounts', label: 'Discounts', creatorOnly: true },
    { href: '/account', label: 'Account settings', exact: true },
]

/**
 * Client-side gate for creator-only /dashboard subpages: while entitlements
 * load nothing is revealed; without the creator entitlement the page renders
 * the same upgrade Fallback the dashboard home uses. (APIs enforce the same
 * rule server-side; this keeps the UI honest.)
 */
export function CreatorGate({ children }) {
    const { loading, canAccessDashboard } = useEntitlements()
    if (loading) return null
    if (!canAccessDashboard) return <Fallback />
    return children
}

const isActiveLink = (link, pathname) =>
    link.exact ? pathname === link.href : pathname === link.href || pathname.startsWith(`${link.href}/`)

export default function CreatorShell({ children }) {
    const { user, isLoaded } = useUser()
    const { isAdmin } = useAccess()
    const { loading: entitlementsLoading, canAccessDashboard } = useEntitlements()
    // Creator-only links stay hidden while entitlements load, so a
    // non-subscriber never sees them flash in.
    const visibleLinks = NAV_LINKS.filter(
        (link) => !link.creatorOnly || (!entitlementsLoading && canAccessDashboard),
    )
    const pathname = usePathname() || ''

    // Shop display name (rail identity block). GET/PUT /api/user/display-name;
    // if the GET fails the inline editor stays hidden, as before.
    const [displayName, setDisplayName] = useState('')
    const [displayNameAvailable, setDisplayNameAvailable] = useState(false)
    const [editingName, setEditingName] = useState(false)
    const [nameDraft, setNameDraft] = useState('')
    const [savingDisplayName, setSavingDisplayName] = useState(false)
    const [displayNameError, setDisplayNameError] = useState('')
    const [displayNameSaved, setDisplayNameSaved] = useState(false)

    useEffect(() => {
        if (!user || !isLoaded) return
        let cancelled = false
        ;(async () => {
            try {
                const res = await fetch('/api/user/display-name')
                if (!res.ok) return // Non-subscribed users may not have access; keep editor hidden.
                const data = await res.json()
                if (!cancelled) {
                    setDisplayName(data.displayName || '')
                    setDisplayNameAvailable(true)
                }
            } catch (e) {
                // Keep the editor hidden on failure.
            }
        })()
        return () => { cancelled = true }
    }, [user, isLoaded])

    const saveDisplayName = async () => {
        try {
            setSavingDisplayName(true)
            setDisplayNameError('')
            setDisplayNameSaved(false)
            const res = await fetch('/api/user/display-name', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName: nameDraft }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                setDisplayNameError(data.error || 'Failed to save')
                return
            }
            setDisplayName(data.displayName || nameDraft)
            setDisplayNameSaved(true)
            setEditingName(false)
        } catch (e) {
            setDisplayNameError(e?.message || 'Failed to save')
        } finally {
            setSavingDisplayName(false)
        }
    }

    const identity = useMemo(
        () => ({ displayName, displayNameAvailable }),
        [displayName, displayNameAvailable],
    )

    return (
        <DashProvider>
            <ShopIdentityContext.Provider value={identity}>
                <div className="mx-auto w-full max-w-[1200px] px-6 py-8 flex flex-col lg:flex-row gap-8 lg:gap-12">
                    {/* Rail — on the canvas, no bordered boxes (§5.1). Collapses
                        to a top strip on mobile. */}
                    <aside className="shrink-0 lg:w-52 flex flex-col gap-6">
                        <div id="shop-name">
                            <div className="flex items-center justify-between gap-2">
                                <span className="dash-label">Your shop</span>
                                <NotificationsBell />
                            </div>
                            {displayNameAvailable ? (
                                editingName ? (
                                    <div className="mt-1 flex flex-col gap-2">
                                        <input
                                            autoFocus
                                            value={nameDraft}
                                            onChange={(e) => {
                                                setNameDraft(e.target.value)
                                                setDisplayNameSaved(false)
                                            }}
                                            placeholder="e.g. Lorem Ipsum"
                                            className="w-full rounded-[var(--dash-r-inner)] border border-[var(--dash-line)] bg-[var(--dash-card)] px-3 py-1.5 text-[13px]"
                                        />
                                        {displayNameError && (
                                            <span className="dash-data" style={{ color: 'var(--dash-bad)' }}>{displayNameError}</span>
                                        )}
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={saveDisplayName}
                                                disabled={savingDisplayName}
                                                className="dash-hoverable rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] px-3 py-1 text-[12px] font-medium cursor-pointer hover:bg-[var(--dash-canvas)] disabled:opacity-50"
                                            >
                                                {savingDisplayName ? 'Saving…' : 'Save'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditingName(false)
                                                    setDisplayNameError('')
                                                }}
                                                className="text-[12px] dash-soft hover:text-[var(--dash-ink)] cursor-pointer"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mt-1 group flex items-center gap-1.5 min-w-0">
                                        <span className={`text-[15px] font-semibold truncate ${displayName ? '' : 'dash-soft'}`}>
                                            {displayName || 'Name your shop'}
                                        </span>
                                        <button
                                            type="button"
                                            aria-label="Edit shop display name"
                                            onClick={() => {
                                                setNameDraft(displayName)
                                                setEditingName(true)
                                                setDisplayNameSaved(false)
                                            }}
                                            className="dash-hoverable shrink-0 rounded-full h-6 w-6 grid place-items-center text-[var(--dash-ink-soft)] cursor-pointer opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-[var(--dash-ink)] hover:bg-[var(--dash-card)]"
                                        >
                                            <IoPencilOutline size={13} />
                                        </button>
                                        {displayNameSaved && !displayNameError && (
                                            <span className="dash-data dash-soft shrink-0">Saved</span>
                                        )}
                                    </div>
                                )
                            ) : (
                                <p className="mt-1 text-[15px] font-semibold truncate">{user?.firstName || 'Creator'}</p>
                            )}
                        </div>

                        <nav aria-label="Creator dashboard" className="flex flex-row lg:flex-col flex-wrap gap-1 -mx-3 lg:mx-0">
                            {visibleLinks.map((link) => {
                                const active = isActiveLink(link, pathname)
                                return (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        aria-current={active ? 'page' : undefined}
                                        className={
                                            active
                                                ? 'rounded-full bg-[var(--dash-ink)] text-[var(--dash-canvas)] px-3 py-1.5 text-[13px] font-medium w-fit lg:w-full'
                                                : 'dash-hoverable rounded-full px-3 py-1.5 text-[13px] dash-soft hover:text-[var(--dash-ink)] hover:bg-[var(--dash-card)] w-fit lg:w-full'
                                        }
                                    >
                                        {link.icon ? (
                                            <span className="flex items-center gap-1.5">
                                                <link.icon size={13} aria-hidden="true" />
                                                {link.label}
                                            </span>
                                        ) : (
                                            link.label
                                        )}
                                    </Link>
                                )
                            })}
                        </nav>

                        {isAdmin && (
                            <Link
                                href="/admin"
                                className="lg:mt-auto px-3 lg:px-3 -mx-3 lg:mx-0 text-[12px] dash-soft hover:text-[var(--dash-ink)] w-fit"
                            >
                                Admin dashboard →
                            </Link>
                        )}
                    </aside>

                    <main className="flex-1 min-w-0">{children}</main>
                </div>
            </ShopIdentityContext.Provider>
        </DashProvider>
    )
}
