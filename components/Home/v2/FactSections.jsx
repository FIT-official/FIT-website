import Image from 'next/image'
import { siteFacts } from '@/lib/home/siteFacts'
import { jsonLdString } from '@/lib/jsonLd'
import { absoluteUrl } from '@/lib/seo/site'
import styles from './home.module.css'

const addressText = address => address && [address.streetAddress, address.addressLocality, address.postalCode, address.addressCountry].filter(Boolean).join(', ')
const hasVisit = facts => addressText(facts.address) || facts.openingHours?.length || facts.pickupDetails || facts.googleBusinessProfileUrl

export function VisitDetails({ facts = siteFacts }) {
    if (!hasVisit(facts)) return null
    return <div className="space-y-3 text-sm leading-6">
        {addressText(facts.address) && <address className="not-italic">{addressText(facts.address)}</address>}
        {facts.openingHours?.length > 0 && <p>{facts.openingHours.join(' · ')}</p>}
        {facts.pickupDetails && <p>{facts.pickupDetails}</p>}
        {facts.googleBusinessProfileUrl && <a href={facts.googleBusinessProfileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline underline-offset-4">Find us on Google Maps ↗</a>}
    </div>
}

export function VisitPickup({ facts = siteFacts }) {
    if (!hasVisit(facts)) return null
    return <section className={styles.section} aria-labelledby="home-visit"><p className={styles.eyebrow}>Meet us in Singapore</p><h2 id="home-visit">Visit & pick up</h2><VisitDetails facts={facts} /></section>
}

export function LocalBusinessSchema({ facts = siteFacts }) {
    if (!facts.address?.streetAddress || !facts.openingHours?.length) return null
    const schema = {
        '@context': 'https://schema.org', '@type': 'LocalBusiness', '@id': absoluteUrl('/#localbusiness'),
        name: 'Fix It Today®', url: absoluteUrl('/'), parentOrganization: { '@id': absoluteUrl('/#organization') },
        address: { '@type': 'PostalAddress', ...facts.address }, openingHours: facts.openingHours,
        ...(facts.email ? { email: facts.email } : {}),
        ...(facts.googleBusinessProfileUrl ? { hasMap: facts.googleBusinessProfileUrl } : {}),
    }
    return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(schema) }} />
}

export function GoogleRating({ facts = siteFacts }) {
    if (!facts.googleRating?.value || !facts.googleRating?.count || !facts.googleBusinessProfileUrl) return null
    return <a href={facts.googleBusinessProfileUrl} target="_blank" rel="noopener noreferrer" className={styles.textLink}>{facts.googleRating.value}/5 on Google · {facts.googleRating.count} reviews</a>
}

export function Reviews({ facts = siteFacts }) {
    const reviews = facts.reviews?.filter(review => review.quote && review.author)
    if (!reviews?.length) return null
    return <section className={styles.section} aria-labelledby="home-reviews"><h2 id="home-reviews">From our community</h2><div className={styles.reviewGrid}>
        {reviews.slice(0, 3).map((review, index) => <figure key={index} className={styles.review}><blockquote>{review.quote}</blockquote><figcaption>{review.author}</figcaption></figure>)}
    </div>{facts.googleBusinessProfileUrl && <a className={styles.textLink} href={facts.googleBusinessProfileUrl}>Read reviews on Google ↗</a>}</section>
}

export function ClientLogos({ facts = siteFacts }) {
    const logos = facts.clientLogos?.filter(logo => logo.src && logo.name)
    if (!logos?.length) return null
    return <section className={styles.section} aria-label="Our clients"><div className={styles.logoRow}>{logos.map(logo => <Image key={logo.name} src={logo.src} alt={logo.name} width={120} height={60} loading="lazy" className="object-contain" />)}</div></section>
}

export function whatsappHref(number) {
    if (typeof number !== 'string' || !/^\+?[1-9]\d{6,14}$/.test(number)) return null
    return `https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent('Hello Fix It Today, I would like help with a print, printer repair or filament enquiry.')}`
}

export function WhatsAppButton({ facts = siteFacts }) {
    const href = whatsappHref(facts.whatsappNumber)
    if (!href) return null
    // The existing chat launcher is bottom-right on mobile, bottom-left on
    // desktop. This stays above it on mobile and on the opposite desktop edge.
    return <a href={href} target="_blank" rel="noopener noreferrer" className={styles.whatsapp}>WhatsApp <span aria-hidden="true">↗</span></a>
}
