import Link from 'next/link'
import { absoluteUrl } from '@/lib/seo/site'

export function programmeMetadata({ title, description, path }) {
    return {
        title, description,
        alternates: { canonical: absoluteUrl(path) },
        openGraph: { title, description, url: absoluteUrl(path), siteName: 'Fix It Today',
            locale: 'en_SG', type: 'website', images: [absoluteUrl('/fitogimage.png')] },
        twitter: { card: 'summary_large_image', title, description, images: [absoluteUrl('/fitogimage.png')] },
    }
}

export const sectionClass = 'border-t border-borderColor py-10 md:py-14'
export const cardClass = 'rounded-xl border border-borderColor p-6'
export const paragraphClass = 'mt-3 text-sm leading-7 text-lightColor'
export const textLinkClass = 'underline underline-offset-4 hover:text-textColor'

export default function ProgrammeLayout({ title, intro, path, serviceType, enquirySubject, enquiryDetails, children }) {
    const schema = {
        '@context': 'https://schema.org', '@type': 'Service',
        name: title, description: intro, serviceType, url: absoluteUrl(path),
        areaServed: { '@type': 'Country', name: 'Singapore' },
        provider: { '@type': 'Organization', name: 'Fix It Today', url: absoluteUrl('/') },
    }
    const enquiryUrl = `mailto:fixittoday.contact@gmail.com?subject=${encodeURIComponent(enquirySubject)}&body=${encodeURIComponent(enquiryDetails)}`
    return (
        <article className="w-full border-b border-borderColor px-6 md:px-12 lg:px-20">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }} />
            <header className="py-12 md:py-20">
                <nav aria-label="Workshop pages" className="mb-10 flex flex-wrap gap-x-6 gap-y-3 text-sm text-lightColor">
                    <Link href="/school-programmes" aria-current={path === '/school-programmes' ? 'page' : undefined} className={textLinkClass}>School programmes</Link>
                    <Link href="/company-workshops" aria-current={path === '/company-workshops' ? 'page' : undefined} className={textLinkClass}>Company workshops</Link>
                </nav>
                <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-lightColor">Fix It Today · Singapore</p>
                <h1 className="max-w-4xl text-3xl leading-tight md:text-5xl">{title}</h1>
                <p className="mt-6 max-w-3xl text-base leading-8 text-lightColor">{intro}</p>
                <div className="mt-8 flex flex-wrap items-center gap-5">
                    <a href="#enquire" className="rounded-lg bg-textColor px-5 py-3 text-sm font-semibold text-background">Plan a workshop</a>
                    <a href="#projects" className={`text-sm ${textLinkClass}`}>See project options</a>
                </div>
            </header>
            {children}
            <section id="enquire" className={`${sectionClass} scroll-mt-20`}>
                <div className="rounded-xl bg-amber-50 p-6 md:p-10">
                    <h2>Let’s plan your workshop</h2>
                    <p className="mt-3 max-w-3xl text-sm leading-7">Tell us what your group would like to learn, how many people will attend, your preferred dates and your budget. We’ll discuss the project, equipment and delivery arrangements before preparing a quote.</p>
                    <a href={enquiryUrl} className="mt-6 inline-flex rounded-lg bg-textColor px-5 py-3 text-sm font-semibold text-background">Email a workshop enquiry</a>
                    <p className="mt-4 break-words text-sm text-lightColor">fixittoday.contact@gmail.com</p>
                </div>
            </section>
        </article>
    )
}
