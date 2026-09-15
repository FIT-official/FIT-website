'use client'
// Mega panel for the desktop navbar, restyled to the Untitled-UI reference:
// one rounded card split into a white left region (icon rows and category
// columns under 11px uppercase grey headers, default tracking, no gradients)
// and a quiet baseColor right rail with a hairline left border carrying the
// CMS featured articles ("From the blog") plus a compact CMS icon list
// ("Explore"). Flat theme: ink, grey and hairlines only; the single yellow
// accent is a small flat amber-300 dot on the blog header. Pure presentation:
// Navbar owns open state, hover intent, keyboard wiring and content fetching.
import Link from 'next/link'
import { motion } from 'framer-motion'
import { LuArrowUpRight } from 'react-icons/lu'
import {
    IoHomeOutline,
    IoStorefrontOutline,
    IoCubeOutline,
    IoPeopleOutline,
    IoInformationCircleOutline,
    IoNewspaperOutline,
    IoPrintOutline,
    IoSparklesOutline,
    IoDocumentTextOutline,
    IoMailOutline,
    IoHelpCircleOutline,
    IoPricetagOutline,
} from 'react-icons/io5'

// Primary bar link/trigger typography (Untitled UI): normal case, 13px,
// medium weight; quiet grey that inks on hover; the active item is marked by
// NavUnderline. No uppercase, no letter-spacing.
export const navItemCls = (active) =>
    `relative flex items-center py-1 text-[13px] font-medium transition-colors duration-200 ease-in-out ${
        active ? 'text-textColor' : 'text-lightColor hover:text-textColor'
    }`

// Thin ink underline shared across primary items via layoutId, so it slides
// between the active link and whichever panel trigger is open.
export function NavUnderline({ reduceMotion }) {
    return (
        <motion.span
            aria-hidden="true"
            layoutId="nav-underline"
            transition={reduceMotion ? { duration: 0 } : { type: 'tween', duration: 0.2, ease: 'easeOut' }}
            className="absolute inset-x-0 -bottom-0.5 h-px bg-textColor"
        />
    )
}

// Curated named icon set for the CMS-configurable menu rows. The admin icon
// picker (components/Admin/CMSFields/NavMenuPagesField) renders exactly this
// map, so any stored name resolves here; unknown names fall back to the
// document icon. Outline variants only, rendered small and ink, never tiles.
export const NAV_MENU_ICONS = {
    home: IoHomeOutline,
    storefront: IoStorefrontOutline,
    cube: IoCubeOutline,
    people: IoPeopleOutline,
    info: IoInformationCircleOutline,
    newspaper: IoNewspaperOutline,
    print: IoPrintOutline,
    sparkles: IoSparklesOutline,
    document: IoDocumentTextOutline,
    mail: IoMailOutline,
    help: IoHelpCircleOutline,
    pricetag: IoPricetagOutline,
}

// Zero-CMS-config fallback for the Explore list: the navbar must render
// perfectly with no 'navigation/mega-menu' content block saved.
export const DEFAULT_MENU_PAGES = [
    { icon: 'newspaper', label: 'Blog', description: 'Guides, updates and print stories.', href: '/blog' },
    { icon: 'people', label: 'Creators', description: 'Meet the makers behind the models.', href: '/creators' },
    { icon: 'sparkles', label: 'Become a creator', description: 'Plans for selling on Fix It Today.', href: '/creators/join' },
    { icon: 'info', label: 'About', description: 'Who we are and how we work.', href: '/about' },
    { icon: 'print', label: 'Custom 3D print', description: 'Upload a model for an instant quote.', href: '/products/custom-print-request' },
    { icon: 'cube', label: 'Print requests', description: 'Track your custom print orders.', href: '/account/prints' },
]

// 11px uppercase grey group header, default tracking only.
const headerCls = 'text-[11px] font-medium uppercase text-lightColor'

const subcategoryHref = (type, category, sub) =>
    `/${type}?productType=${type}&productCategory=${encodeURIComponent(category.displayName)}&productSubCategory=${encodeURIComponent(sub.displayName)}`

// Untitled-UI icon row: 18px outlined ink icon, 14px medium label, one quiet
// grey line of description. Flat hover tint, no filled chips or tiles.
function IconRow({ href, icon: Icon, label, description, onNavigate }) {
    return (
        <Link
            href={href}
            onClick={onNavigate}
            className="group -mx-2 flex items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors duration-150 ease-in-out hover:bg-black/[0.03]"
        >
            <Icon size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-textColor" />
            <span className="flex min-w-0 flex-col">
                <span className="text-sm font-medium text-textColor">{label}</span>
                {description && <span className="text-[13px] leading-snug text-lightColor">{description}</span>}
            </span>
        </Link>
    )
}

function NavPanel({
    id,
    type,
    label,
    categories,
    menuPages = [],
    articles = [],
    reduceMotion,
    onNavigate,
    onMouseEnter,
    onMouseLeave,
}) {
    const hasRail = articles.length > 0 || menuPages.length > 0
    return (
        <motion.div
            id={id}
            role="region"
            aria-label={`${label} menu`}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
            transition={{ type: 'tween', duration: 0.18, ease: 'easeOut' }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            className="absolute inset-x-4 top-full z-50 mt-2 overflow-hidden rounded-xl border border-borderColor bg-background shadow-[0_2px_6px_rgba(17,17,17,0.05),0_16px_40px_rgba(17,17,17,0.10)] max-lg:hidden"
        >
            <div className="flex items-stretch">
                {/* Left region (white): icon rows + category columns. */}
                <div className="flex flex-1 items-start gap-8 p-6">
                    <div className="flex w-52 shrink-0 flex-col">
                        <p className={headerCls}>Get started</p>
                        <div className="mt-2.5 flex flex-col gap-1">
                            <IconRow
                                href={`/${type}`}
                                icon={type === 'shop' ? IoStorefrontOutline : IoCubeOutline}
                                label={`Browse all ${label.toLowerCase()}`}
                                description="The full catalogue, every category."
                                onNavigate={onNavigate}
                            />
                            <IconRow
                                href="/products/custom-print-request"
                                icon={IoPrintOutline}
                                label="Print your model"
                                description="Upload a 3D model and get an instant quote."
                                onNavigate={onNavigate}
                            />
                        </div>
                    </div>

                    {/* Category columns: 11px uppercase grey headers over quiet
                        13px link lists, tight 8px row gaps. */}
                    <div className="grid flex-1 grid-cols-2 gap-x-8 gap-y-6 xl:grid-cols-3">
                        {categories.map((category) => (
                            <div key={category.name} className="flex flex-col">
                                <p className={headerCls}>{category.displayName}</p>
                                <ul className="mt-2.5 flex flex-col gap-2">
                                    {(category.subcategories || [])
                                        .filter((sub) => sub.isActive)
                                        .map((sub) => (
                                            <li key={sub.name}>
                                                <Link
                                                    href={subcategoryHref(type, category, sub)}
                                                    onClick={onNavigate}
                                                    className="text-[13px] text-lightColor transition-colors duration-200 ease-in-out hover:text-textColor"
                                                >
                                                    {sub.displayName}
                                                </Link>
                                            </li>
                                        ))}
                                </ul>
                            </div>
                        ))}
                        {categories.length === 0 && (
                            <p className="text-[13px] text-lightColor">Nothing here yet. Check back soon.</p>
                        )}
                    </div>
                </div>

                {/* Right rail (baseColor, hairline left border): featured blog
                    articles, then the CMS menu pages as a compact icon list. */}
                {hasRail && (
                    <aside className="flex w-60 shrink-0 flex-col gap-5 border-l border-borderColor bg-baseColor p-5">
                        {articles.length > 0 && (
                            <div>
                                <p className={`${headerCls} flex items-center gap-1.5`}>
                                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-300" />
                                    From the blog
                                </p>
                                <ul className="mt-2.5 flex flex-col gap-2">
                                    {articles.map((post) => (
                                        <li key={post.slug}>
                                            <Link
                                                href={`/blog/${post.slug}`}
                                                onClick={onNavigate}
                                                className="group flex items-center gap-1 text-[13px] font-medium text-textColor"
                                            >
                                                <span className="min-w-0 truncate">{post.title}</span>
                                                <LuArrowUpRight
                                                    size={13}
                                                    aria-hidden="true"
                                                    className="shrink-0 text-lightColor transition-colors duration-200 ease-in-out group-hover:text-textColor"
                                                />
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {menuPages.length > 0 && (
                            <div>
                                <p className={headerCls}>Explore</p>
                                <ul className="mt-2.5 flex flex-col gap-1.5">
                                    {menuPages.map((page) => {
                                        const Icon = NAV_MENU_ICONS[page.icon] || IoDocumentTextOutline
                                        return (
                                            <li key={`${page.href}-${page.label}`}>
                                                <Link
                                                    href={page.href}
                                                    onClick={onNavigate}
                                                    className="flex items-center gap-2 text-[13px] font-medium text-lightColor transition-colors duration-200 ease-in-out hover:text-textColor"
                                                >
                                                    <Icon size={16} aria-hidden="true" className="shrink-0" />
                                                    <span className="truncate">{page.label}</span>
                                                </Link>
                                            </li>
                                        )
                                    })}
                                </ul>
                            </div>
                        )}
                    </aside>
                )}
            </div>
        </motion.div>
    )
}

export default NavPanel
