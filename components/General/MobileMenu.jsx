'use client'
// Mobile navigation sheet, the small-screen counterpart of AccountDropdown
// and the desktop mega panels: a full-height right sheet with soft rounded
// corners, layered shadow, small uppercase hairline-underlined group headers
// (default tracking, matching the flat desktop panel) and compact icon +
// label rows. Rows are entitlement-gated (Dashboard, Admin, Messages) and
// mirror the desktop nav (Home, Shop, Prints, Creators, About) plus every
// account destination. Flat theme: ink, grey, hairlines and a single flat
// amber-300 chip for the paid plan badge; no gradients anywhere.
// Storefront vocabulary only (borderColor/baseColor/lightColor/textColor).
// Esc and backdrop close; Esc returns focus to the hamburger trigger; body
// scroll is locked while open; reduced motion collapses the slide to a fade.
import useAccess from '@/utils/useAccess'
import useEntitlements from '@/utils/useEntitlements'
import { SignOutButton, useUser } from '@clerk/nextjs'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
    IoHomeOutline,
    IoStorefrontOutline,
    IoCubeOutline,
    IoConstructOutline,
    IoPeopleOutline,
    IoInformationCircleOutline,
    IoCartOutline,
    IoChatbubblesOutline,
    IoPersonOutline,
    IoBagHandleOutline,
    IoDownloadOutline,
    IoPrintOutline,
    IoCardOutline,
    IoGridOutline,
    IoShieldOutline,
    IoLogOutOutline,
    IoLogInOutline,
    IoPersonAddOutline,
    IoCloseOutline,
    IoChevronDownOutline,
} from 'react-icons/io5'

const rowCls = (active) =>
    `flex w-full min-h-[40px] items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150 ease-in-out ${
        active
            ? 'bg-black/[0.05] text-textColor'
            : 'text-lightColor hover:bg-black/[0.03] hover:text-textColor'
    }`

function SheetRow({ href, icon: Icon, label, active = false, badge = null, onNavigate }) {
    return (
        <Link href={href} onClick={onNavigate} className={rowCls(active)}>
            <Icon size={18} aria-hidden="true" className="shrink-0" />
            <span className="truncate">{label}</span>
            {badge}
        </Link>
    )
}

// Small uppercase grey header over a hairline (default tracking), matching
// the desktop mega panel's column headers.
function GroupLabel({ children }) {
    return (
        <p className="mx-3 mb-1 mt-3 border-b border-borderColor pb-1 text-[11px] font-medium uppercase text-lightColor">
            {children}
        </p>
    )
}

function Separator() {
    return <div role="separator" className="mx-3 my-2 h-0 border-t border-borderColor" />
}

// Shop / Prints disclosure: tapping the row reveals the category tree inline,
// flattened one level (category heading + subcategory links) so nothing is
// more than two taps deep.
function CategoryDisclosure({ id, icon: Icon, label, browseHref, productType, categories, expanded, onToggle, onNavigate, reduceMotion }) {
    return (
        <div className="flex w-full flex-col">
            <button
                type="button"
                aria-expanded={expanded}
                aria-controls={id}
                onClick={onToggle}
                className={`${rowCls(false)} cursor-pointer text-left`}
            >
                <Icon size={18} aria-hidden="true" className="shrink-0" />
                <span className="truncate">{label}</span>
                <IoChevronDownOutline
                    size={14}
                    aria-hidden="true"
                    className={`ml-auto shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                />
            </button>
            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        id={id}
                        initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                        animate={reduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
                        exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: 'easeInOut' }}
                        className="overflow-hidden"
                    >
                        <div className="max-h-[40vh] overflow-y-auto pb-1 pl-9 pr-1">
                            <Link
                                href={browseHref}
                                onClick={onNavigate}
                                className="flex min-h-[40px] items-center rounded-lg px-2 text-[13px] font-medium text-lightColor transition-colors duration-150 ease-in-out hover:bg-black/[0.03] hover:text-textColor"
                            >
                                Browse all {label.toLowerCase()}
                            </Link>
                            {categories.map((category) => (
                                <div key={category.name} className="pt-1.5">
                                    <p className="mx-2 border-b border-borderColor pb-1 text-[11px] font-medium uppercase text-lightColor">
                                        {category.displayName}
                                    </p>
                                    {(category.subcategories || [])
                                        .filter((sub) => sub.isActive)
                                        .map((sub) => (
                                            <Link
                                                key={sub.name}
                                                href={`/${productType}?productType=${productType}&productCategory=${encodeURIComponent(category.displayName)}&productSubCategory=${encodeURIComponent(sub.displayName)}`}
                                                onClick={onNavigate}
                                                className="flex min-h-[40px] items-center rounded-lg px-2 text-[13px] text-lightColor transition-colors duration-150 ease-in-out hover:bg-black/[0.03] hover:text-textColor"
                                            >
                                                {sub.displayName}
                                            </Link>
                                        ))}
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

function MobileMenu({ open, onClose, triggerRef, shopCategories = [], printCategories = [], unreadMessages = 0 }) {
    const { user, isLoaded } = useUser()
    const { isAdmin } = useAccess()
    const { loading: entitlementsLoading, canAccessDashboard, canUseMessaging, isPaidTier, subscription } = useEntitlements()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const tab = searchParams?.get('tab')
    const reduceMotion = useReducedMotion()
    const [expanded, setExpanded] = useState(null)
    const [planBadge, setPlanBadge] = useState('')
    const closeButtonRef = useRef(null)

    const signedIn = isLoaded && !!user

    // Plan badge label, same source as AccountDropdown; free tier needs no fetch.
    useEffect(() => {
        let cancelled = false
        const priceId = subscription?.priceId
        if (!priceId) {
            setPlanBadge('')
            return undefined
        }
        fetch(`/api/subscription/info?priceId=${encodeURIComponent(priceId)}`)
            .then((res) => (res.ok ? res.json() : {}))
            .then((data) => {
                if (!cancelled) setPlanBadge(data.productName || 'Member')
            })
            .catch(() => {
                if (!cancelled) setPlanBadge('Member')
            })
        return () => {
            cancelled = true
        }
    }, [subscription?.priceId])

    // Esc closes and returns focus to the hamburger trigger.
    useEffect(() => {
        if (!open) return undefined
        function handleKeyDown(event) {
            if (event.key === 'Escape') {
                onClose()
                triggerRef?.current?.focus()
            }
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [open, onClose, triggerRef])

    // Body scroll lock while the sheet is open.
    useEffect(() => {
        if (!open) return undefined
        const previous = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = previous
        }
    }, [open])

    // Fresh sheet each open: collapse any category disclosure and move focus in.
    useEffect(() => {
        if (!open) {
            setExpanded(null)
            return
        }
        closeButtonRef.current?.focus()
    }, [open])

    const isAccountHub = pathname === '/account'
    const badgeText = subscription?.priceId ? planBadge || 'Member' : 'Free'
    // Flat plan chip: the paid tier is the one amber accent, ink on yellow.
    const planBadgeEl = (
        <span
            className={`ml-auto max-w-[88px] shrink-0 truncate rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                isPaidTier
                    ? 'bg-amber-300 text-textColor'
                    : 'border border-borderColor bg-baseColor text-lightColor'
            }`}
        >
            {badgeText}
        </span>
    )
    const unreadBadgeEl =
        unreadMessages > 0 ? (
            <span className="ml-auto shrink-0 rounded-full bg-amber-300 px-1.5 py-0.5 text-[9px] font-semibold text-textColor">
                {unreadMessages > 9 ? '9+' : unreadMessages}
            </span>
        ) : null

    // Signed-in account destinations, mirrored from AccountDropdown.
    const accountRows = [
        { href: '/cart', icon: IoCartOutline, label: 'Cart', active: pathname?.startsWith('/cart') },
        canUseMessaging && !entitlementsLoading
            ? { href: '/dashboard/messages', icon: IoChatbubblesOutline, label: 'Messages', active: pathname?.startsWith('/dashboard/messages'), badge: unreadBadgeEl }
            : null,
        { href: '/account', icon: IoPersonOutline, label: 'Account', active: isAccountHub && tab !== 'orders' && tab !== 'downloads' },
        { href: '/account?tab=orders', icon: IoBagHandleOutline, label: 'Orders', active: isAccountHub && tab === 'orders' },
        { href: '/account?tab=downloads', icon: IoDownloadOutline, label: 'Downloads', active: isAccountHub && tab === 'downloads' },
        { href: '/account/prints', icon: IoPrintOutline, label: 'Print requests', active: pathname?.startsWith('/account/prints') },
        { href: '/account/subscription', icon: IoCardOutline, label: 'Subscription', active: pathname?.startsWith('/account/subscription'), badge: planBadgeEl },
    ].filter(Boolean)

    const workspaceRows = [
        canAccessDashboard && !entitlementsLoading
            ? { href: '/dashboard', icon: IoGridOutline, label: 'Dashboard', active: pathname?.startsWith('/dashboard') && !pathname?.startsWith('/dashboard/messages') }
            : null,
        isAdmin
            ? { href: '/admin', icon: IoShieldOutline, label: 'Admin dashboard', active: pathname?.startsWith('/admin') }
            : null,
    ].filter(Boolean)

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        key="mobile-menu-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        onClick={onClose}
                        aria-hidden="true"
                        className="fixed inset-0 z-[60] bg-black/25"
                    />
                    <motion.div
                        key="mobile-menu-sheet"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Menu"
                        initial={reduceMotion ? { opacity: 0 } : { x: '100%' }}
                        animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
                        exit={reduceMotion ? { opacity: 0 } : { x: '100%' }}
                        transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                        className="fixed right-0 top-0 z-[70] flex h-dvh w-[85vw] max-w-sm flex-col overflow-hidden rounded-l-2xl border-l border-borderColor bg-background shadow-[0_2px_6px_rgba(17,17,17,0.05),0_16px_40px_rgba(17,17,17,0.10)]"
                    >
                        <div className="flex items-center justify-between gap-3 border-b border-borderColor bg-white/80 px-4 py-3 backdrop-blur-md">
                            {signedIn ? (
                                <div className="flex min-w-0 items-center gap-3">
                                    <span className="flex h-10 w-10 shrink-0 overflow-hidden rounded-full border border-borderColor">
                                        <Image
                                            src={user.imageUrl || '/user.jpg'}
                                            alt="User avatar"
                                            width={40}
                                            height={40}
                                            className="h-full w-full object-cover"
                                        />
                                    </span>
                                    <div className="flex min-w-0 flex-col">
                                        <span className="truncate text-sm font-semibold text-textColor">
                                            {user.firstName || user.fullName || 'Your account'}
                                        </span>
                                        <span className="truncate text-xs text-lightColor">
                                            {user.primaryEmailAddress?.emailAddress ||
                                                user.emailAddresses?.[0]?.emailAddress ||
                                                ''}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <span className="text-sm font-semibold text-textColor">Menu</span>
                            )}
                            <button
                                ref={closeButtonRef}
                                type="button"
                                onClick={onClose}
                                aria-label="Close menu"
                                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-black/[0.04] text-textColor transition-colors duration-150 ease-in-out hover:bg-black/[0.08]"
                            >
                                <IoCloseOutline size={18} aria-hidden="true" />
                            </button>
                        </div>

                        <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-2 pb-6 pt-1">
                            <GroupLabel>Browse</GroupLabel>
                            <SheetRow href="/" icon={IoHomeOutline} label="Home" active={pathname === '/'} onNavigate={onClose} />
                            <CategoryDisclosure
                                id="mobile-menu-shop"
                                icon={IoStorefrontOutline}
                                label="Shop"
                                browseHref="/shop"
                                productType="shop"
                                categories={shopCategories}
                                expanded={expanded === 'shop'}
                                onToggle={() => setExpanded(expanded === 'shop' ? null : 'shop')}
                                onNavigate={onClose}
                                reduceMotion={reduceMotion}
                            />
                            <CategoryDisclosure
                                id="mobile-menu-prints"
                                icon={IoCubeOutline}
                                label="Prints"
                                browseHref="/prints"
                                productType="prints"
                                categories={printCategories}
                                expanded={expanded === 'prints'}
                                onToggle={() => setExpanded(expanded === 'prints' ? null : 'prints')}
                                onNavigate={onClose}
                                reduceMotion={reduceMotion}
                            />
                            <SheetRow href="/research-fabrication" icon={IoConstructOutline} label="Services" active={['/research-fabrication', '/metal-fabrication', '/3d-design-printing', '/electronics-prototyping'].some(path => pathname === path || pathname?.startsWith(`${path}/`))} onNavigate={onClose} />
                            <SheetRow href="/school-programmes" icon={IoPeopleOutline} label="School programmes" active={pathname?.startsWith('/school-programmes')} onNavigate={onClose} />
                            <SheetRow href="/company-workshops" icon={IoPeopleOutline} label="Company workshops" active={pathname?.startsWith('/company-workshops')} onNavigate={onClose} />
                            <SheetRow href="/creators" icon={IoPeopleOutline} label="Creators" active={pathname?.startsWith('/creators')} onNavigate={onClose} />
                            <SheetRow href="/about" icon={IoInformationCircleOutline} label="About" active={pathname?.startsWith('/about')} onNavigate={onClose} />

                            {signedIn ? (
                                <>
                                    <GroupLabel>Account</GroupLabel>
                                    {accountRows.map((row) => (
                                        <SheetRow key={row.href} {...row} onNavigate={onClose} />
                                    ))}

                                    {workspaceRows.length > 0 && <GroupLabel>Workspace</GroupLabel>}
                                    {workspaceRows.map((row) => (
                                        <SheetRow key={row.href} {...row} onNavigate={onClose} />
                                    ))}

                                    <Separator />
                                    <SignOutButton redirectUrl="/">
                                        <button type="button" className={`${rowCls(false)} cursor-pointer text-left`}>
                                            <IoLogOutOutline size={18} aria-hidden="true" className="shrink-0" />
                                            Sign out
                                        </button>
                                    </SignOutButton>
                                </>
                            ) : (
                                <>
                                    <GroupLabel>Account</GroupLabel>
                                    <SheetRow href="/sign-in" icon={IoLogInOutline} label="Sign in" onNavigate={onClose} />
                                    <SheetRow href="/sign-up" icon={IoPersonAddOutline} label="Sign up" onNavigate={onClose} />
                                </>
                            )}
                        </nav>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}

export default MobileMenu
