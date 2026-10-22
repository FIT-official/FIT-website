import Link from 'next/link'

export const ABOUT_LINKS = [
    { label: 'MakerAccess', href: '/about/makeraccess' },
    { label: 'FIT Class', href: '/class' },
    { label: 'About the Founder', href: 'https://leewenwei.com', external: true },
]

export function isAboutLinkActive(href, pathname) {
    if (href === '/about') return pathname === href
    return href.startsWith('/') && (pathname === href || pathname?.startsWith(`${href}/`))
}

export default function AboutLinks({ pathname, onNavigate }) {
    return (
        <div className="flex flex-col gap-1 p-2">
            {ABOUT_LINKS.map(({ href, label, external }) => (
                <Link
                    key={href}
                    href={href}
                    onClick={onNavigate}
                    aria-current={isAboutLinkActive(href, pathname) ? 'page' : undefined}
                    className="flex min-h-11 items-center justify-between gap-5 rounded-md px-3 py-2 text-sm font-medium text-textColor transition-colors hover:bg-black/[0.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor"
                >
                    {label}
                    {external && <span aria-hidden="true">↗</span>}
                </Link>
            ))}
            <div className="mx-3 my-1 border-t border-borderColor" />
            <Link
                href="/about"
                onClick={onNavigate}
                aria-current={isAboutLinkActive('/about', pathname) ? 'page' : undefined}
                className="flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium text-lightColor transition-colors hover:bg-black/[0.03] hover:text-textColor focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor"
            >
                About FIT
            </Link>
        </div>
    )
}
