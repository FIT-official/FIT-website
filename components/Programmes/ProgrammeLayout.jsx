import Image from 'next/image'
import Link from 'next/link'
import { absoluteUrl } from '@/lib/seo/site'
import { buildPageMetadata } from '@/lib/seo/metadata'
import styles from './ProgrammeLayout.module.css'

export { styles }

export function programmeMetadata({ title, description, path, image, imageAlt }) {
    return buildPageMetadata({ title, description, path, image, imageAlt })
}

export function Photo({ src, alt, caption, width = 1080, height = 1440, priority = false, className = '', sizes = '(max-width: 767px) 100vw, (max-width: 1200px) 45vw, 600px' }) {
    return <figure className={`${styles.photo} ${className}`}>
        <div className={styles.photoFrame}>
            <Image src={src} width={width} height={height} alt={alt} priority={priority}
                sizes={sizes} />
        </div>
        <figcaption>{caption}</figcaption>
    </figure>
}

export function SectionHeading({ eyebrow, title, children }) {
    return <div className={styles.sectionHeading}>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}<h2>{title}</h2>
        {children && <p className={styles.description}>{children}</p>}
    </div>
}

export function TextLink({ href, children }) {
    return <Link href={href} className={styles.textLink}>{children}<span aria-hidden="true">↗</span></Link>
}

export function WorkshopList({ items }) {
    return <div className={styles.workshopList}>{items.map(({ title, description, concepts, href, link }) => <div className={styles.workshopRow} key={title}>
        <div><h3>{title}</h3><p>{description}</p><p className={styles.concepts}>{concepts}</p>
            {href && <TextLink href={href}>{link}</TextLink>}
        </div>
    </div>)}</div>
}

export function Questions({ items }) {
    return <section className={`${styles.section} ${styles.questions}`}>
        <SectionHeading title="Before booking" />
        <div>{items.map(({ question, answer }) => <details className={styles.question} key={question}>
            <summary>{question}<span aria-hidden="true" className={styles.plus}>+</span></summary><p>{answer}</p>
        </details>)}</div>
    </section>
}

export function ReadingList({ items }) {
    return <section className={`${styles.section} ${styles.reading}`}>
        <SectionHeading title="Further reading" />
        <div className={styles.readingList}>{items.map(({ href, topic, title }) => <Link key={href} href={href} className={styles.readingLink}>
            <span className={styles.eyebrow}>{topic}</span><span className={styles.readingTitle}>{title}</span>
            <span aria-hidden="true" className={styles.readingArrow}>↗</span>
        </Link>)}</div>
    </section>
}

export default function ProgrammeLayout({ title, titleLead, titleAccent, intro, hero, path, serviceType, enquirySubject, enquiryDetails, children }) {
    const schema = {
        '@context': 'https://schema.org', '@type': 'Service', name: title, description: intro, serviceType, url: absoluteUrl(path),
        areaServed: { '@type': 'Country', name: 'Singapore' },
        provider: { '@type': 'Organization', name: 'Fix It Today', url: absoluteUrl('/') }, image: absoluteUrl(hero.src),
    }
    const enquiryUrl = `mailto:fixittoday.contact@gmail.com?subject=${encodeURIComponent(enquirySubject)}&body=${encodeURIComponent(enquiryDetails)}`
    return <article className={styles.page}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }} />
        <nav aria-label="Workshop pages" className={styles.pageNav}>
            <Link href="/school-programmes" aria-current={path === '/school-programmes' ? 'page' : undefined}>School programmes</Link>
            <Link href="/company-workshops" aria-current={path === '/company-workshops' ? 'page' : undefined}>Company workshops</Link>
        </nav>
        <header className={styles.hero}>
            <p className={styles.edition}><span>Fix It Today</span><span>Workshops in Singapore</span></p>
            <h1>{titleLead}{' '}<em>{titleAccent}</em></h1>
            <Photo {...hero} priority className={styles.heroPhoto} sizes="(max-width: 767px) 100vw, (max-width: 1440px) 63vw, 900px" />
            <div className={styles.heroCopy}>
                <p className={styles.heroIntro}>{intro}</p>
                <div className={styles.heroActions}>
                    <a href="#enquire" className={styles.button}>Enquire about a workshop <span aria-hidden="true">↗</span></a>
                    <a href="#gallery" className={styles.quietLink}>View gallery <span aria-hidden="true">↓</span></a>
                </div>
            </div>
        </header>
        <div className={styles.content}>{children}</div>
        <section id="enquire" className={styles.enquiry}>
            <div><h2>Plan a<br /><em>workshop</em></h2></div>
            <div className={styles.enquiryDetails}>
                <p>Send us your group size, preferred dates and a topic you have in mind. We’ll discuss the equipment, materials and cost.</p>
                <a href={enquiryUrl} className={styles.button}>Get in touch <span aria-hidden="true">↗</span></a>
                <span className={styles.email}>fixittoday.contact@gmail.com</span>
            </div>
        </section>
    </article>
}
