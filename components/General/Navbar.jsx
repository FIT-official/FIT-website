'use client'
// Storefront navbar: a flat fixed translucent bar (backdrop blur, hairline
// bottom border, 56px tall) carrying quiet 13px medium links whose active
// item is a thin sliding ink underline, and Untitled-UI style rounded mega
// panels for Shop and Prints (see docs/navbar/). The bar is position:fixed
// (an overflow-hidden layout ancestor defeats position:sticky here) with an
// in-flow spacer so pages keep their offset; the small-screen spacer already
// lives in app/layout.jsx. Panels open on hover intent, click or ArrowDown;
// Escape closes and refocuses the trigger; outside click, focus leaving the
// bar and route changes all close. Mobile keeps the full MobileMenu sheet.
// Panel content (Explore icon rows + featured blog articles) comes from the
// public content API path 'navigation/mega-menu' (same useContent hook as
// Main.jsx), falling back to DEFAULT_MENU_PAGES and the 3 newest published
// posts from /api/blog so zero CMS config still renders a complete panel.
import Link from 'next/link'
import Logo from '../Logo'
import { useUser } from '@clerk/nextjs'
import AccountDropdown from './AccountDropdown'
import MobileMenu from './MobileMenu'
import NavPanel, { navItemCls, NavUnderline, DEFAULT_MENU_PAGES } from './NavPanel'
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, useReducedMotion } from 'framer-motion'
import { usePathname, useSearchParams } from 'next/navigation'
import { IoCartOutline, IoChatbubblesOutline, IoMenuOutline } from 'react-icons/io5'
import useEntitlements from '@/utils/useEntitlements'
import { useContent } from '@/utils/useContent'

// Shop and Prints open a mega panel; the rest are plain routes. `key` doubles
// as the productType segment in panel subcategory hrefs.
const PRIMARY = [
    { key: 'shop', label: 'Shop' },
    { key: 'prints', label: 'Prints' },
    { key: 'services', label: 'Services', href: '/research-fabrication', paths: ['/metal-fabrication', '/3d-design-printing', '/electronics-prototyping'] },
    { key: 'school-programmes', label: 'Programmes', href: '/school-programmes' },
    { key: 'creators', label: 'Creators', href: '/creators' },
    { key: 'about', label: 'About', href: '/about' },
]

// Fixed bar mirrors the centered layout column's width classes exactly.
const barCls =
    'fixed left-1/2 top-0 z-50 w-screen max-w-[1350px] -translate-x-1/2 border-b border-borderColor bg-white/80 backdrop-blur-md backdrop-saturate-150 md:w-[90vw] lg:w-[85vw]'

function Navbar() {
    const { user, isLoaded, isSignedIn } = useUser()
    const { loading: entitlementsLoading, canUseMessaging } = useEntitlements()
    const [unreadMessages, setUnreadMessages] = useState(0)
    const [isOpen, setIsOpen] = useState(false) // mobile sheet
    const [openPanel, setOpenPanel] = useState(null) // 'shop' | 'prints' | null
    const [shopCategories, setShopCategories] = useState([])
    const [printCategories, setPrintCategories] = useState([])
    const [fallbackPosts, setFallbackPosts] = useState([])
    const headerRef = useRef(null)
    const hoverTimer = useRef(null)
    const triggerRefs = useRef({})
    const mobileTriggerRef = useRef(null)
    const reduceMotion = useReducedMotion()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const currentUrl = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '')

    // Single shared timer gives hover intent: a short pause before opening,
    // a grace period on leave so the pointer can travel bar -> panel.
    const setTimer = (fn, ms) => {
        clearTimeout(hoverTimer.current)
        hoverTimer.current = setTimeout(fn, ms)
    }
    const cancelTimer = () => clearTimeout(hoverTimer.current)
    const scheduleClose = () => setTimer(() => setOpenPanel(null), 160)

    // Auto-close menu and panel on route change (keyed on the string, not the
    // params object, whose identity can change per render).
    const searchKey = searchParams ? searchParams.toString() : ''
    useEffect(() => {
        setIsOpen(false)
        setOpenPanel(null)
    }, [pathname, searchKey])

    useEffect(() => () => clearTimeout(hoverTimer.current), [])

    // CMS-driven panel content, fetched once on mount from the same public
    // content API Main.jsx uses. Malformed or missing entries fall back to
    // the hardcoded defaults so the panel never renders half-configured.
    const { content: navContent, isLoading: navContentLoading } = useContent('navigation/mega-menu', {})
    const cmsMenuPages = Array.isArray(navContent?.menuPages)
        ? navContent.menuPages.filter((page) => page && page.label && page.href).slice(0, 8)
        : []
    const cmsFeaturedPosts = Array.isArray(navContent?.featuredPosts)
        ? navContent.featuredPosts.filter((post) => post && post.slug && post.title).slice(0, 4)
        : []
    const menuPages = cmsMenuPages.length > 0 ? cmsMenuPages : DEFAULT_MENU_PAGES
    const featuredArticles = cmsFeaturedPosts.length > 0 ? cmsFeaturedPosts : fallbackPosts

    // No CMS-picked articles: fall back to the 3 newest published posts.
    useEffect(() => {
        if (navContentLoading || cmsFeaturedPosts.length > 0) return undefined
        let cancelled = false
        fetch('/api/blog')
            .then((res) => (res.ok ? res.json() : { posts: [] }))
            .then((data) => {
                if (cancelled) return
                setFallbackPosts(
                    (data.posts || []).slice(0, 3).map((post) => ({ slug: post.slug, title: post.title })),
                )
            })
            .catch(() => {})
        return () => {
            cancelled = true
        }
    }, [navContentLoading, cmsFeaturedPosts.length])

    useEffect(() => {
        const fetchCategories = async () => {
            try {
                const res = await fetch('/api/categories')
                if (!res.ok) {
                    console.error('Failed to fetch categories:', res.status)
                    return
                }
                const data = await res.json()
                const cats = data.categories || []
                setShopCategories(cats.filter((c) => c.type === 'shop' && c.isActive))
                setPrintCategories(cats.filter((c) => c.type === 'print' && c.isActive))
            } catch (e) {
                console.error('Failed to load categories for navbar', e)
            }
        }
        fetchCategories()
    }, [])

    useEffect(() => {
        const fetchUnread = async () => {
            if (!isSignedIn || !isLoaded || !user) return
            try {
                const res = await fetch('/api/chat/inbox')
                if (!res.ok) return
                const data = await res.json()
                const channels = data.channels || []
                setUnreadMessages(channels.reduce((sum, ch) => sum + (ch.unreadCount || 0), 0))
            } catch (e) {
                console.error('Failed to load unread messages for navbar', e)
            }
        }
        fetchUnread()
    }, [isSignedIn, isLoaded, user])

    // Listen for global unread count updates from chat components.
    useEffect(() => {
        if (typeof window === 'undefined') return undefined
        const handleUnreadUpdated = (event) => {
            const total = event.detail?.total
            if (typeof total === 'number') setUnreadMessages(total)
        }
        window.addEventListener('chat:unread-updated', handleUnreadUpdated)
        return () => window.removeEventListener('chat:unread-updated', handleUnreadUpdated)
    }, [])

    // While a panel is open: Escape closes and refocuses its trigger; a
    // pointer-down outside the bar closes.
    useEffect(() => {
        if (!openPanel) return undefined
        const key = openPanel
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                setOpenPanel(null)
                triggerRefs.current[key]?.focus()
            }
        }
        const onPointerDown = (event) => {
            if (headerRef.current && !headerRef.current.contains(event.target)) setOpenPanel(null)
        }
        document.addEventListener('keydown', onKeyDown)
        document.addEventListener('mousedown', onPointerDown)
        return () => {
            document.removeEventListener('keydown', onKeyDown)
            document.removeEventListener('mousedown', onPointerDown)
        }
    }, [openPanel])

    if (!isLoaded) {
        return (
            <div className="flex w-full flex-col">
                <div className={`h-14 ${barCls}`} />
                <div className="hidden h-14 w-full lg:block" />
            </div>
        )
    }

    const routeKey = PRIMARY.find(
        (item) => [item.href ?? `/${item.key}`, ...(item.paths || [])].some(
            (path) => pathname === path || pathname?.startsWith(`${path}/`),
        ),
    )?.key
    const activeKey = openPanel || routeKey
    const openItem = PRIMARY.find((item) => item.key === openPanel)

    return (
        <div className="flex w-full flex-col">
            <header
                ref={headerRef}
                onBlur={(event) => {
                    // Focus moving out of the bar (Tab past the last panel
                    // link, or a click elsewhere) dismisses the panel.
                    if (openPanel && !event.currentTarget.contains(event.relatedTarget)) setOpenPanel(null)
                }}
                className={barCls}
            >
                <nav aria-label="Primary" className="relative flex h-14 items-center justify-between px-5 lg:px-6">
                    <Link
                        href="/"
                        aria-label="Home"
                        className="z-10 text-textColor transition-opacity duration-300 ease-in-out hover:opacity-80"
                    >
                        <Logo width={28} height={28} />
                    </Link>

                    <ul className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 flex-row items-center gap-7 lg:flex">
                        {PRIMARY.map((item) => (
                            <li key={item.key} className="relative flex">
                                {item.href ? (
                                    <Link href={item.href} onMouseEnter={scheduleClose} className={navItemCls(activeKey === item.key)}>
                                        {item.label}
                                    </Link>
                                ) : (
                                    <button
                                        ref={(el) => {
                                            triggerRefs.current[item.key] = el
                                        }}
                                        type="button"
                                        aria-haspopup="true"
                                        aria-expanded={openPanel === item.key}
                                        aria-controls={`nav-panel-${item.key}`}
                                        onClick={() => {
                                            cancelTimer()
                                            setOpenPanel(openPanel === item.key ? null : item.key)
                                        }}
                                        onKeyDown={(event) => {
                                            if (event.key !== 'ArrowDown') return
                                            event.preventDefault()
                                            setOpenPanel(item.key)
                                            requestAnimationFrame(() =>
                                                document.getElementById(`nav-panel-${item.key}`)?.querySelector('a')?.focus(),
                                            )
                                        }}
                                        onMouseEnter={() => setTimer(() => setOpenPanel(item.key), openPanel ? 0 : 90)}
                                        onMouseLeave={scheduleClose}
                                        className={`${navItemCls(activeKey === item.key)} cursor-pointer`}
                                    >
                                        {item.label}
                                    </button>
                                )}
                                {activeKey === item.key && <NavUnderline reduceMotion={reduceMotion} />}
                            </li>
                        ))}
                    </ul>

                    <div className="z-10 flex items-center gap-5">
                        {isSignedIn && user && (
                            <>
                                <Link
                                    href={`/cart?redirect=${encodeURIComponent(currentUrl)}`}
                                    aria-label="Cart"
                                    className="hidden text-lightColor transition-colors duration-200 ease-in-out hover:text-textColor lg:flex"
                                >
                                    <IoCartOutline size={18} aria-hidden="true" />
                                </Link>
                                {canUseMessaging && !entitlementsLoading && (
                                    <Link
                                        href="/dashboard/messages"
                                        aria-label="Messages"
                                        className="relative hidden text-lightColor transition-colors duration-200 ease-in-out hover:text-textColor lg:flex"
                                    >
                                        <IoChatbubblesOutline size={18} aria-hidden="true" />
                                        {unreadMessages > 0 && (
                                            <span className="absolute -right-2 -top-2 rounded-full bg-amber-300 px-1.5 py-0.5 text-[9px] font-semibold text-textColor">
                                                {unreadMessages > 9 ? '9+' : unreadMessages}
                                            </span>
                                        )}
                                    </Link>
                                )}
                            </>
                        )}
                        {isSignedIn ? (
                            <div className="hidden lg:flex">
                                <AccountDropdown />
                            </div>
                        ) : (
                            <div className="hidden items-center gap-5 lg:flex">
                                <Link href="/sign-in" className={navItemCls(false)}>
                                    Sign in
                                </Link>
                                <Link
                                    href="/sign-up"
                                    className="flex items-center rounded-full bg-textColor px-3.5 py-1.5 text-[13px] font-medium text-background transition-opacity duration-200 ease-in-out hover:opacity-85"
                                >
                                    Sign up
                                </Link>
                            </div>
                        )}
                        <button
                            ref={mobileTriggerRef}
                            type="button"
                            onClick={() => setIsOpen((prev) => !prev)}
                            aria-label="Open menu"
                            aria-expanded={isOpen}
                            className="flex cursor-pointer text-textColor transition-opacity duration-200 ease-in-out hover:opacity-70 lg:hidden"
                        >
                            <IoMenuOutline size={22} aria-hidden="true" />
                        </button>
                    </div>
                </nav>

                <AnimatePresence>
                    {openItem && (
                        <NavPanel
                            key={openItem.key}
                            id={`nav-panel-${openItem.key}`}
                            type={openItem.key}
                            label={openItem.label}
                            categories={openItem.key === 'shop' ? shopCategories : printCategories}
                            menuPages={menuPages}
                            articles={featuredArticles}
                            reduceMotion={reduceMotion}
                            onMouseEnter={cancelTimer}
                            onMouseLeave={scheduleClose}
                            onNavigate={() => setOpenPanel(null)}
                        />
                    )}
                </AnimatePresence>
            </header>

            {/* In-flow spacer for the fixed desktop bar. */}
            <div className="hidden h-14 w-full lg:block" />

            <MobileMenu
                open={isOpen}
                onClose={() => setIsOpen(false)}
                triggerRef={mobileTriggerRef}
                shopCategories={shopCategories}
                printCategories={printCategories}
                unreadMessages={unreadMessages}
            />
        </div>
    )
}

export default Navbar
