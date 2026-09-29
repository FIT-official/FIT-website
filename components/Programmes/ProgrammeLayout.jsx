import Image from 'next/image'
import Link from 'next/link'
import { absoluteUrl } from '@/lib/seo/site'
import styles from './ProgrammeLayout.module.css'

export { styles }

export function programmeMetadata({ title, description, path, image, imageAlt }) {
    const images = image ? [{ url: absoluteUrl(image), alt: imageAlt }] : [absoluteUrl('/fitogimage.png')]
    return {
        title, description,
        alternates: { canonical: absoluteUrl(path) },
        openGraph: { title, description, url: absoluteUrl(path), siteName: 'Fix It Today', locale: 'en_SG', type: 'website', images },
        twitter: { card: 'summary_large_image', title, description, images },
    }
}

export function Photo({ src, alt, caption, width = 1080, height = 1440, priority = false, className = '' }) {
    return <figure className={`${styles.photo} ${className}`}>
        <div className={styles.photoFrame}>
            <Image src={src} width={width} height={height} alt={alt} priority={priority}
                sizes="(max-width: 767px) 100vw, (max-width: 1200px) 45vw, 600px" />
        </div>
        <figcaption>{caption}</figcaption>
    </figure>
}

export function SectionHeading({ eyebrow, title, children }) {
    return <div className={styles.sectionHeading}>
        <p className={styles.eyebrow}>{eyebrow}</p><h2>{title}</h2>
        {children && <p className={styles.description}>{children}</p>}
    </div>
}

export function TextLink({ href, children }) {
    return <Link href={href} className={styles.textLink}>{children}<span aria-hidden="true">↗</span></Link>
}

export function WorkshopList({ items }) {
    return <div className={styles.workshopList}>{items.map(({ title, description, concepts, href, link }, index) => <div className={styles.workshopRow} key={title}>
        <span className={styles.rowNumber} aria-hidden="true">0{index + 1}</span>
        <div><h3>{title}</h3><p>{description}</p><p className={styles.concepts}>{concepts}</p>
            {href && <TextLink href={href}>{link}</TextLink>}
        </div>
    </div>)}</div>
}

export function Questions({ items }) {
    return <section className={`${styles.section} ${styles.questions}`}>
        <SectionHeading eyebrow="The practical details" title="Before we begin" />
        <div>{items.map(({ question, answer }) => <details className={styles.question} key={question}>
            <summary>{question}<span aria-hidden="true" className={styles.plus}>+</span></summary><p>{answer}</p>
        </details>)}</div>
    </section>
}

export function ReadingList({ items }) {
    return <section className={`${styles.section} ${styles.reading}`}>
        <SectionHeading eyebrow="From the journal" title="Keep exploring" />
        <div className={styles.readingList}>{items.map(({ href, topic, title }) => <Link key={href} href={href} className={styles.readingLink}>
            <span className={styles.eyebrow}>{topic}</span><span className={styles.readingTitle}>{title}</span>
            <span aria-hidden="true" className={styles.readingArrow}>↗</span>
        </Link>)}</div>
    </section>
}

export default function ProgrammeLayout({ title, titleLead, titleAccent, eyebrow, intro, hero, topics, path, serviceType, enquirySubject, enquiryDetails, children }) {
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
            <div className={styles.heroCopy}>
                <p className={styles.eyebrow}>{eyebrow} <span aria-hidden="true">/</span> Singapore</p>
                <h1>{titleLead}{' '}<em>{titleAccent}</em></h1>
                <p className={styles.heroIntro}>{intro}</p>
                <div className={styles.heroActions}>
                    <a href="#enquire" className={styles.button}>Plan a workshop <span aria-hidden="true">↗</span></a>
                    <a href="#gallery" className={styles.quietLink}>View the gallery <span aria-hidden="true">↓</span></a>
                </div>
                <p className={styles.heroNote}>Instructor-led workshops · Practical skills · Project support</p>
            </div>
            <Photo {...hero} priority className={`${styles.heroPhoto} ${hero.landscape ? styles.heroLandscape : ''}`} />
        </header>
        <ul className={styles.topicStrip} aria-label="Workshop topics">{topics.map(topic => <li key={topic}>{topic}</li>)}</ul>
        <div className={styles.content}>{children}</div>
        <section id="enquire" className={styles.enquiry}>
            <div><p className={styles.eyebrow}>Let’s make a start</p><h2>What would you<br /><em>like to make?</em></h2></div>
            <div className={styles.enquiryDetails}>
                <p>Tell us about your group, your idea and the time you have. We’ll work out the project, equipment and materials with you, then prepare a quote.</p>
                <a href={enquiryUrl} className={styles.button}>Email a workshop enquiry <span aria-hidden="true">↗</span></a>
                <span className={styles.email}>fixittoday.contact@gmail.com</span>
            </div>
        </section>
    </article>
}
