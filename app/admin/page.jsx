'use client'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import useAccess from '@/utils/useAccess'
import ContentManagement from '@/components/Admin/DynamicContentManagement'
import BlogManagement from '@/components/Admin/BlogManagement'
import NewsletterManagement from '@/components/Admin/NewsletterManagement'
import CreatorPayments from '@/components/Admin/CreatorPayments'
import CategoryManagement from '@/components/Admin/CategoryManagement'
import DeliveryTypeManagement from '@/components/Admin/DeliveryTypeManagement'
import OrderStatusManagement from '@/components/Admin/OrderStatusManagement'
import CustomPrintProductManagement from '@/components/Admin/CustomPrintProductManagement'
import CustomPrintRequests from '@/components/Admin/CustomPrintRequests'
import QuotingPricingManagement from '@/components/Admin/QuotingPricingManagement'
import PrintTimeCalibration from '@/components/Admin/PrintTimeCalibration'
import ReviewManagement from '@/components/Admin/ReviewManagement'
import CustomersPanel from '@/components/Admin/CustomersPanel'
import CreatorSubscriptions from '@/components/Admin/CreatorSubscriptions'
import NotificationsBell from '@/components/DashboardComponents/NotificationsBell'
import EventManagement from '@/components/Admin/EventManagement'
import Overview from '@/components/Admin/Overview'
import OnboardingWizard from '@/components/Admin/OnboardingWizard'
import { buildSetupChecklist, needsOnboarding } from '@/lib/admin/setupChecklist'
import { useUser } from '@clerk/nextjs'
import {
    DashProvider,
    HeroGreeting,
    EmptyState,
    CommandPalette,
    ShortcutsSheet,
    SkeletonTile,
} from '@/components/dashboard-ui'
import {
    IoGridOutline,
    IoCubeOutline,
    IoReceiptOutline,
    IoCardOutline,
    IoPeopleOutline,
    IoStarOutline,
    IoPrintOutline,
    IoFolderOpenOutline,
    IoCalendarOutline,
    IoDocumentTextOutline,
    IoNewspaperOutline,
    IoMailOutline,
    IoCalculatorOutline,
    IoTimeOutline,
    IoCarOutline,
    IoSparklesOutline,
    IoSearchOutline,
    IoFlashOutline,
    IoResizeOutline,
    IoColorPaletteOutline,
    IoDownloadOutline,
    IoLockClosedOutline,
    IoChevronBackOutline,
    IoChevronForwardOutline,
    IoChevronDownOutline,
    IoChevronUpOutline,
} from 'react-icons/io5'

// Grouped IA: daily operations first, occasional configuration last.
// Descriptions double as the command palette's Navigate copy (§9.1).
const NAV_GROUPS = [
    {
        title: null,
        items: [
            {
                key: 'overview',
                label: 'Overview',
                icon: IoGridOutline,
                description: 'Store health at a glance: requests, setup, traffic.',
            },
        ],
    },
    {
        title: 'Operations',
        items: [
            {
                key: 'customPrintRequests',
                label: 'Print Requests',
                icon: IoCubeOutline,
                description: 'Quote, track and manage custom print jobs.',
            },
            {
                key: 'orders',
                label: 'Orders & Statuses',
                icon: IoReceiptOutline,
                description: 'Configure status flows for regular and print orders.',
            },
            {
                key: 'payments',
                label: 'Payments',
                icon: IoCardOutline,
                description: 'Creator payouts, Stripe sessions and exports.',
            },
            {
                key: 'reviews',
                label: 'Reviews',
                icon: IoStarOutline,
                description: 'Moderate product reviews.',
            },
            {
                key: 'customers',
                label: 'Customers',
                icon: IoPeopleOutline,
                description: 'Customer list with orders, value and requests. Coming soon.',
            },
            {
                key: 'creatorSubscriptions',
                label: 'Creator Plans',
                icon: IoPeopleOutline,
                description: 'Subscriptions, complimentary access and creator limits.',
            },
        ],
    },
    {
        title: 'Catalogue',
        items: [
            {
                key: 'customPrint',
                label: 'Custom Print Product',
                icon: IoPrintOutline,
                description: 'The base product behind Order Print: price and dimensions.',
            },
            {
                key: 'categories',
                label: 'Categories',
                icon: IoFolderOpenOutline,
                description: 'Organise the product catalogue.',
            },
            {
                key: 'events',
                label: 'Events',
                icon: IoCalendarOutline,
                description: 'Sitewide discount events and their windows.',
            },
        ],
    },
    {
        title: 'Storefront',
        items: [
            {
                key: 'content',
                label: 'Site Content',
                icon: IoDocumentTextOutline,
                description: 'Edit storefront copy and images with live preview.',
            },
            {
                key: 'blog',
                label: 'Blog',
                icon: IoNewspaperOutline,
                description: 'Write, schedule and publish articles.',
            },
            {
                key: 'newsletter',
                label: 'Newsletter',
                icon: IoMailOutline,
                description: 'Campaigns, subscribers, interests and welcome emails.',
            },
        ],
    },
    {
        title: 'Settings',
        items: [
            {
                key: 'quoting',
                label: 'Quoting & Pricing',
                icon: IoCalculatorOutline,
                description: 'Rates, fees, machine limits and colour catalogue.',
            },
            {
                key: 'printTiming',
                label: 'Print Timing',
                icon: IoTimeOutline,
                description: 'Calibrate print-time estimates from real jobs.',
            },
            {
                key: 'delivery',
                label: 'Delivery',
                icon: IoCarOutline,
                description: 'Delivery types, applicability and pricing rules.',
            },
        ],
    },
]

const PANELS = {
    content: ContentManagement,
    payments: CreatorPayments,
    events: EventManagement,
    categories: CategoryManagement,
    delivery: DeliveryTypeManagement,
    orders: OrderStatusManagement,
    blog: BlogManagement,
    newsletter: NewsletterManagement,
    customPrint: CustomPrintProductManagement,
    customPrintRequests: CustomPrintRequests,
    quoting: QuotingPricingManagement,
    printTiming: PrintTimeCalibration,
    reviews: ReviewManagement,
    customers: CustomersPanel,
    creatorSubscriptions: CreatorSubscriptions,
}

const VALID_TABS = new Set(['overview', ...Object.keys(PANELS)])

const RAIL_KEY = 'dashRailCollapsed'

function salutation() {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning,'
    if (h < 18) return 'Good afternoon,'
    return 'Good evening,'
}

function AdminDashboard() {
    const { loading, isAdmin } = useAccess()
    const { user } = useUser()
    const router = useRouter()
    const searchParams = useSearchParams()

    const paramTab = searchParams.get('tab')
    const activeTab = VALID_TABS.has(paramTab) ? paramTab : 'overview'
    const setActiveTab = useCallback(
        // Optional `sub` deep-links into a panel's ViewTab (§9.3); omitting it
        // drops any stale sub from the previous panel.
        (key, sub) => router.replace(`/admin?tab=${key}${sub ? `&sub=${encodeURIComponent(sub)}` : ''}`, { scroll: false }),
        [router],
    )

    const [mobileNavOpen, setMobileNavOpen] = useState(false)
    const [railCollapsed, setRailCollapsed] = useState(false)
    const [paletteOpen, setPaletteOpen] = useState(false)
    const [shortcutsOpen, setShortcutsOpen] = useState(false)
    const [setupData, setSetupData] = useState(null)
    const [requests, setRequests] = useState([])
    const [fetchedAt, setFetchedAt] = useState(null)
    const [wizardOpen, setWizardOpen] = useState(false)
    const [wizardChecked, setWizardChecked] = useState(false)

    // Rail collapse persists (§9.2). Read post-mount to keep SSR markup stable.
    useEffect(() => {
        try {
            if (localStorage.getItem(RAIL_KEY) === '1') setRailCollapsed(true)
        } catch { /* ignore */ }
    }, [])
    const toggleRail = () => {
        setRailCollapsed((c) => {
            try { localStorage.setItem(RAIL_KEY, c ? '0' : '1') } catch { /* ignore */ }
            return !c
        })
    }

    const loadOverviewData = useCallback(async () => {
        try {
            const [quotingRes, settingsRes, productRes, requestsRes] = await Promise.all([
                fetch('/api/admin/quoting'),
                fetch('/api/admin/settings'),
                fetch('/api/product/custom-print-config'),
                fetch('/api/admin/custom-print-requests'),
            ])
            const quoting = quotingRes.ok ? await quotingRes.json() : {}
            const settings = settingsRes.ok ? await settingsRes.json() : {}
            const product = productRes.ok ? await productRes.json() : {}
            const reqs = requestsRes.ok ? await requestsRes.json() : {}
            setSetupData({
                quotingConfig: quoting.quotingConfig,
                printColours: quoting.printColours,
                machineLimits: quoting.machineLimits,
                adminEmailPresent: quoting.adminEmailPresent,
                deliveryTypes: settings.deliveryTypes,
                customPrintProduct: product.product,
            })
            setRequests(reqs.requests || [])
            setFetchedAt(Date.now())
        } catch {
            setSetupData({})
        }
    }, [])

    useEffect(() => {
        if (!loading && isAdmin) loadOverviewData()
    }, [loading, isAdmin, loadOverviewData])

    // First-run trigger: required checklist items incomplete + not dismissed.
    useEffect(() => {
        if (!setupData || wizardChecked) return
        setWizardChecked(true)
        let dismissed = false
        try { dismissed = Boolean(localStorage.getItem('adminOnboardingDismissed')) } catch { /* ignore */ }
        if (!dismissed && needsOnboarding(buildSetupChecklist(setupData))) setWizardOpen(true)
    }, [setupData, wizardChecked])

    // `?` opens the shortcuts sheet (§9.6) when nothing editable is focused.
    useEffect(() => {
        const onKey = (e) => {
            if (e.key !== '?' || e.metaKey || e.ctrlKey || e.altKey) return
            const el = document.activeElement
            const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
            if (typing) return
            e.preventDefault()
            setShortcutsOpen(true)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    const closeWizard = () => {
        setWizardOpen(false)
        loadOverviewData() // config may have changed; refresh the checklist
    }

    const openWizard = useCallback(() => {
        setActiveTab('overview')
        setWizardOpen(true)
    }, [setActiveTab])

    // Command registry (§9.1): Navigate = every panel; Settings = deep links;
    // Actions = wizard + exports. Extensible — it is plain data.
    const paletteGroups = useMemo(() => {
        const nav = NAV_GROUPS.flatMap((g) => g.items).map((item) => ({
            id: `nav:${item.key}`,
            label: item.label,
            description: item.description,
            keywords: [item.key],
            icon: item.icon,
            perform: () => setActiveTab(item.key),
        }))
        const settings = [
            { id: 'set:rates', label: 'Change pricing rates', tab: 'quoting', sub: 'rates', icon: IoCalculatorOutline },
            { id: 'set:expedite', label: 'Change expedite fees', tab: 'quoting', sub: 'fees', icon: IoFlashOutline },
            { id: 'set:limits', label: 'Edit machine limits', tab: 'quoting', sub: 'limits', icon: IoResizeOutline },
            { id: 'set:colour', label: 'Add a colour', tab: 'quoting', sub: 'colours', icon: IoColorPaletteOutline },
            { id: 'set:calibrate', label: 'Calibrate print times', tab: 'printTiming', icon: IoTimeOutline },
            { id: 'set:deliveryType', label: 'Add a delivery type', tab: 'delivery', icon: IoCarOutline },
        ].map((s) => ({
            id: s.id,
            label: s.label,
            description: `Opens ${NAV_GROUPS.flatMap((g) => g.items).find((i) => i.key === s.tab)?.label}`,
            icon: s.icon,
            perform: () => setActiveTab(s.tab, s.sub),
        }))
        const actions = [
            {
                id: 'act:wizard',
                label: 'Run setup wizard',
                description: 'Guided store setup: pricing, machines, colours, delivery.',
                icon: IoSparklesOutline,
                perform: openWizard,
            },
            {
                id: 'act:exportRequests',
                label: 'Export print requests',
                description: 'Opens Print Requests, where the export lives.',
                icon: IoDownloadOutline,
                perform: () => setActiveTab('customPrintRequests'),
            },
        ]
        return [
            { key: 'navigate', label: 'Navigate', items: nav },
            { key: 'settings', label: 'Settings', items: settings },
            { key: 'actions', label: 'Actions', items: actions },
        ]
    }, [setActiveTab, openWizard])

    if (loading) {
        return (
            <DashProvider>
                <div className="container mx-auto max-w-6xl px-6 py-24 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <SkeletonTile />
                    <SkeletonTile />
                    <SkeletonTile />
                </div>
            </DashProvider>
        )
    }

    if (!isAdmin) {
        return (
            <DashProvider>
                <div className="flex items-center justify-center min-h-[92vh]">
                    <EmptyState
                        icon={<IoLockClosedOutline />}
                        title="Access Denied"
                        body="You don't have permission to access this page. The admin console needs an admin account."
                    />
                </div>
            </DashProvider>
        )
    }

    const ActivePanel = PANELS[activeTab]
    const allNavItems = NAV_GROUPS.flatMap((g) => g.items)
    const activeLabel = allNavItems.find((i) => i.key === activeTab)?.label || 'Overview'

    const navLink = (item, onSelect, { collapsed = false } = {}) => {
        const Icon = item.icon
        const isActive = activeTab === item.key
        return (
            <button
                key={item.key}
                onClick={() => onSelect(item.key)}
                title={collapsed ? item.label : undefined}
                aria-current={isActive ? 'page' : undefined}
                className={`dash-hoverable flex items-center gap-2.5 rounded-full text-[13px] cursor-pointer whitespace-nowrap ${
                    collapsed ? 'justify-center px-0 py-2 w-10 mx-auto' : 'text-left px-3.5 py-2 w-full'
                } ${
                    isActive
                        ? 'bg-[var(--dash-ink)] text-[var(--dash-canvas)] font-medium'
                        : 'text-[var(--dash-ink-soft)] hover:text-[var(--dash-ink)] hover:bg-[var(--dash-sun-soft)]'
                }`}
            >
                <Icon size={16} className="shrink-0" aria-hidden />
                {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
        )
    }

    const navList = (onSelect, { collapsed = false } = {}) => (
        <nav aria-label="Admin sections" className="flex flex-col gap-4">
            {NAV_GROUPS.map((group, gi) => (
                <div
                    key={group.title || gi}
                    className={`flex flex-col gap-0.5 ${collapsed && gi > 0 ? 'border-t border-[var(--dash-line)] pt-3' : ''}`}
                >
                    {group.title && !collapsed && <p className="dash-label px-3.5 pb-1">{group.title}</p>}
                    {group.items.map((item) => navLink(item, onSelect, { collapsed }))}
                </div>
            ))}
            <div className="border-t border-[var(--dash-line)] pt-3">
                <button
                    onClick={() => { onSelect('overview'); setWizardOpen(true) }}
                    title={collapsed ? 'Setup wizard (re-run)' : undefined}
                    className={`dash-hoverable flex items-center gap-2.5 rounded-full text-[13px] text-[var(--dash-ink-soft)] hover:text-[var(--dash-ink)] hover:bg-[var(--dash-sun-soft)] cursor-pointer whitespace-nowrap ${
                        collapsed ? 'justify-center px-0 py-2 w-10 mx-auto' : 'text-left px-3.5 py-2 w-full'
                    }`}
                >
                    <IoSparklesOutline size={16} className="shrink-0" aria-hidden />
                    {!collapsed && <span>Setup wizard (re-run)</span>}
                </button>
            </div>
        </nav>
    )

    const railSearch = railCollapsed ? (
        <button
            onClick={() => setPaletteOpen(true)}
            title="Search (⌘K)"
            aria-label="Search or jump to…"
            className="dash-hoverable flex items-center justify-center rounded-full w-10 py-2 mx-auto text-[var(--dash-ink-soft)] hover:text-[var(--dash-ink)] hover:bg-[var(--dash-sun-soft)] cursor-pointer"
        >
            <IoSearchOutline size={16} aria-hidden />
        </button>
    ) : (
        <div
            className="relative flex items-center gap-2 rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] px-3.5 py-2 cursor-text"
            onClick={() => setPaletteOpen(true)}
        >
            <IoSearchOutline size={14} className="shrink-0 text-[var(--dash-ink-soft)]" aria-hidden />
            <input
                readOnly
                value=""
                onChange={() => {}}
                onFocus={() => setPaletteOpen(true)}
                placeholder="Search or jump to…"
                aria-label="Search or jump to…"
                className="w-full min-w-0 bg-transparent outline-none text-[13px] cursor-text"
            />
            <kbd className="dash-label shrink-0 rounded-md border border-[var(--dash-line)] px-1.5 py-0.5">⌘K</kbd>
        </div>
    )

    return (
        <DashProvider>
            <div className="container mx-auto py-16 max-w-6xl">
                <div className="flex flex-col px-6 md:px-12 mb-10">
                    <p className="dash-label mb-2">Admin Dashboard</p>
                    <HeroGreeting
                        salutation={salutation()}
                        name={user?.fullName || 'there'}
                        context="Manage your store and view daily operations, catalogue, storefront content and settings."
                    />
                </div>

                {/* Mobile drawer (existing pattern, token restyle) */}
                <div className="md:hidden px-6 mb-4">
                    <button
                        onClick={() => setMobileNavOpen((o) => !o)}
                        className="w-full flex items-center justify-between text-[13px] px-4 py-2.5 bg-[var(--dash-card)] border border-[var(--dash-line)] rounded-full cursor-pointer"
                        aria-expanded={mobileNavOpen}
                    >
                        <span className="font-medium">{activeLabel}</span>
                        {mobileNavOpen ? (
                            <IoChevronUpOutline size={14} className="text-[var(--dash-ink-soft)]" aria-hidden />
                        ) : (
                            <IoChevronDownOutline size={14} className="text-[var(--dash-ink-soft)]" aria-hidden />
                        )}
                    </button>
                    {mobileNavOpen && (
                        <div className="mt-2 bg-[var(--dash-card)] border border-[var(--dash-line)] rounded-[var(--dash-r-card)] p-3 flex flex-col gap-3">
                            {railSearch}
                            {navList((key) => { setActiveTab(key); setMobileNavOpen(false) })}
                        </div>
                    )}
                </div>

                <div className="flex px-6 md:px-12 gap-8 items-start">
                    {/* Rail on the canvas — no border box (§5.6); collapsible (§9.2). */}
                    <aside
                        className={`hidden md:flex flex-col gap-4 shrink-0 sticky top-24 ${railCollapsed ? 'w-16' : 'w-60'}`}
                    >
                        <div className={`flex ${railCollapsed ? 'flex-col items-center gap-1' : 'items-center gap-2'}`}>
                            <div className={railCollapsed ? '' : 'flex-1 min-w-0'}>{railSearch}</div>
                            <NotificationsBell />
                        </div>
                        {navList(setActiveTab, { collapsed: railCollapsed })}
                        <div className={railCollapsed ? 'flex justify-center' : 'flex justify-end pr-1'}>
                            <button
                                onClick={toggleRail}
                                aria-expanded={!railCollapsed}
                                aria-label={railCollapsed ? 'Expand navigation' : 'Collapse navigation'}
                                title={railCollapsed ? 'Expand navigation' : 'Collapse navigation'}
                                className="dash-hoverable flex items-center justify-center rounded-full w-8 h-8 text-[var(--dash-ink-soft)] hover:text-[var(--dash-ink)] hover:bg-[var(--dash-sun-soft)] cursor-pointer"
                            >
                                {railCollapsed ? (
                                    <IoChevronForwardOutline size={14} aria-hidden />
                                ) : (
                                    <IoChevronBackOutline size={14} aria-hidden />
                                )}
                            </button>
                        </div>
                    </aside>

                    {/* Active panel */}
                    <main className="flex-1 min-w-0">
                        {activeTab === 'overview' ? (
                            <Overview
                                setupData={setupData}
                                requests={requests}
                                fetchedAt={fetchedAt}
                                onNavigate={setActiveTab}
                                onOpenWizard={() => setWizardOpen(true)}
                            />
                        ) : (
                            // Panels render on the canvas and own their cards —
                            // wrapping them in a Tier-1 card nests cards (§4.8 #1;
                            // WP2 flag).
                            <ActivePanel />
                        )}
                    </main>
                </div>

                <CommandPalette
                    open={paletteOpen}
                    onOpen={() => setPaletteOpen(true)}
                    onClose={() => setPaletteOpen(false)}
                    groups={paletteGroups}
                />

                <ShortcutsSheet open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

                {wizardOpen && (
                    <OnboardingWizard
                        adminEmailPresent={Boolean(setupData?.adminEmailPresent)}
                        onClose={closeWizard}
                    />
                )}
            </div>
        </DashProvider>
    )
}

export default function AdminPage() {
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center min-h-screen">
                    <div className="loader" />
                </div>
            }
        >
            <AdminDashboard />
        </Suspense>
    )
}
