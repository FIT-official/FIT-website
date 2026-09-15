'use client'
// Links: the shop's external links as chips (external, noopener).
import { GoLinkExternal } from 'react-icons/go'
import { SectionHeading } from '../shared'

export default function LinksBlock({ settings = {}, creator }) {
    const raw = creator?.shop?.links
    const links = Array.isArray(raw)
        ? raw.filter((l) => l && typeof l.label === 'string' && typeof l.url === 'string' && /^https?:\/\//i.test(l.url)).slice(0, 6)
        : []
    if (links.length === 0) return null
    return (
        <div className="flex flex-col gap-4">
            <SectionHeading>{settings.heading}</SectionHeading>
            <div className="flex flex-row flex-wrap gap-2">
                {links.map((link, i) => (
                    <a
                        key={`${link.url}-${i}`}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-full border border-borderColor bg-background px-3 py-1.5 text-xs font-medium text-lightColor hover:text-textColor hover:bg-baseColor transition-colors duration-300"
                    >
                        {link.label}
                        <GoLinkExternal aria-hidden="true" className="text-extraLight" />
                    </a>
                ))}
            </div>
        </div>
    )
}
