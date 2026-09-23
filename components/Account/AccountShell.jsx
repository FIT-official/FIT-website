'use client'
// Shared "Sunlit Paper" shell for the customer account area. Replaces the old
// translate-x slide-out sidebar with the same rail/ViewTabs vocabulary the
// dashboards use: a quiet rail on desktop (active item = the only ink pill),
// horizontally scrolling pill tabs on mobile. The .dash scope is self-contained
// so it is safe inside the storefront layout.
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DashProvider, ViewTabs } from '@/components/dashboard-ui'

// Hub sections, all reachable as /account?tab=<key> deep links (other pages
// link into these, e.g. the cart links ?tab=billing and product pages link
// ?tab=downloads; the URLs must keep working).
export const ACCOUNT_SECTIONS = [
    { key: 'overview', label: 'Overview' },
    { key: 'profile', label: 'Profile' },
    { key: 'security', label: 'Security' },
    { key: 'orders', label: 'Orders' },
    { key: 'billing', label: 'Billing' },
    { key: 'downloads', label: 'Downloads' },
]

// Standalone account routes that share the shell.
export const ACCOUNT_PAGES = [
    { key: 'prints', label: 'Print requests', href: '/account/prints' },
    { key: 'services', label: 'Service requests', href: '/account/services' },
    { key: 'subscription', label: 'Subscription', href: '/account/subscription' },
]

const SECTION_KEYS = new Set(ACCOUNT_SECTIONS.map((s) => s.key))

function RailItem({ item, active, onSelect }) {
    const isActive = item.key === active
    const cls = `dash-hoverable flex w-full items-center h-8 rounded-full px-3.5 text-[13px] font-medium ${
        isActive
            ? 'bg-[var(--dash-ink)] text-[var(--dash-canvas)]'
            : 'text-[var(--dash-ink-soft)] hover:bg-[var(--dash-sun-soft)] hover:text-[var(--dash-ink)]'
    }`
    // Hub sections switch in place when the hub provides onSelect; everywhere
    // else (and for standalone pages) items are plain links.
    if (onSelect && SECTION_KEYS.has(item.key)) {
        return (
            <button
                type="button"
                onClick={() => onSelect(item.key)}
                aria-current={isActive ? 'page' : undefined}
                className={`${cls} text-left cursor-pointer`}
            >
                {item.label}
            </button>
        )
    }
    return (
        <Link
            href={item.href || `/account?tab=${item.key}`}
            aria-current={isActive ? 'page' : undefined}
            className={cls}
        >
            {item.label}
        </Link>
    )
}

export default function AccountShell({ active, onSelect, header, children }) {
    const router = useRouter()
    const allItems = [
        ...ACCOUNT_SECTIONS.map((s) => ({ ...s, href: `/account?tab=${s.key}` })),
        ...ACCOUNT_PAGES,
    ]

    const goTo = (key) => {
        if (key === active) return
        const item = allItems.find((i) => i.key === key)
        if (!item) return
        if (onSelect && SECTION_KEYS.has(key)) onSelect(key)
        else router.push(item.href)
    }

    return (
        <DashProvider className="border-b border-[var(--dash-line)]">
            <div className="mx-auto w-full max-w-6xl px-4 md:px-8 py-8 md:py-12">
                {header}
                <div className="mt-6 md:mt-8 flex flex-col lg:flex-row lg:items-start gap-6">
                    <aside className="hidden lg:block w-[200px] shrink-0 lg:sticky lg:top-24">
                        <nav aria-label="Account" className="flex flex-col gap-5">
                            <div>
                                <p className="dash-label mb-2 px-3.5">Settings</p>
                                <ul className="flex flex-col gap-1">
                                    {ACCOUNT_SECTIONS.map((item) => (
                                        <li key={item.key}>
                                            <RailItem item={item} active={active} onSelect={onSelect} />
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div>
                                <p className="dash-label mb-2 px-3.5">Services</p>
                                <ul className="flex flex-col gap-1">
                                    {ACCOUNT_PAGES.map((item) => (
                                        <li key={item.key}>
                                            <RailItem item={item} active={active} onSelect={onSelect} />
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </nav>
                    </aside>

                    {/* Mobile: the same destinations as scrollable pill tabs. */}
                    <div className="lg:hidden min-w-0">
                        <ViewTabs
                            tabs={allItems.map(({ key, label }) => ({ key, label }))}
                            active={active}
                            onChange={goTo}
                        />
                    </div>

                    <main className="min-w-0 flex-1">{children}</main>
                </div>
            </div>
        </DashProvider>
    )
}
