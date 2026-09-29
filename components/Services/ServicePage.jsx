import Link from 'next/link'
import { absoluteUrl } from '@/lib/seo/site'
import { serviceLinks } from '@/lib/content/researchServices'
import styles from './ServicePage.module.css'

const email = 'fixittoday.contact@gmail.com'

export function serviceMetadata(page) {
    return {
        title: page.title,
        description: page.description,
        alternates: { canonical: absoluteUrl(page.path) },
        openGraph: { title: page.title, description: page.description, url: absoluteUrl(page.path), siteName: 'Fix It Today', locale: 'en_SG', type: 'website', images: [absoluteUrl('/fitogimage.png')] },
        twitter: { card: 'summary_large_image', title: page.title, description: page.description, images: [absoluteUrl('/fitogimage.png')] },
    }
}

export default function ServicePage({ page }) {
    const enquiryHref = `mailto:${email}?subject=${encodeURIComponent(page.enquirySubject)}&body=${encodeURIComponent(`Hello FIT,\n\n${page.enquiryFields.join('\n\n')}\n\n`)}`
    const related = serviceLinks.filter(item => item.href !== page.path)
    const schema = {
        '@context': 'https://schema.org',
        '@graph': [
            { '@type': 'Service', '@id': `${absoluteUrl(page.path)}#service`, name: page.sectionTitle, description: page.description, url: absoluteUrl(page.path), serviceType: page.sectionTitle, areaServed: { '@type': 'Country', name: 'Singapore' }, provider: { '@type': 'Organization', name: 'Fix It Today', url: absoluteUrl('/'), email } },
            { '@type': 'BreadcrumbList', itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: absoluteUrl('/') },
                { '@type': 'ListItem', position: 2, name: 'Research fabrication', item: absoluteUrl('/research-fabrication') },
                ...(page.path === '/research-fabrication' ? [] : [{ '@type': 'ListItem', position: 3, name: page.eyebrow.split(' · ')[0], item: absoluteUrl(page.path) }]),
            ] },
        ],
    }

    return (
        <main className={styles.page}>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }} />
            <nav className={styles.pageNav} aria-label="Fabrication services">
                <Link href="/research-fabrication" aria-current={page.path === '/research-fabrication' ? 'page' : undefined}>Overview</Link>
                {serviceLinks.map(item => <Link key={item.href} href={item.href} aria-current={page.path === item.href ? 'page' : undefined}>{item.title}</Link>)}
            </nav>
            <section className={styles.hero}>
                <div>
                    <p className={styles.eyebrow}>{page.eyebrow}</p>
                    <h1>{page.heading}</h1>
                    <p className={styles.intro}>{page.intro}</p>
                    <div className={styles.actions}>
                        <a className={styles.button} href="#enquire">Request a quotation <span aria-hidden="true">↗</span></a>
                        <a className={styles.textLink} href="#requirements">What to send <span aria-hidden="true">↓</span></a>
                    </div>
                </div>
                <aside className={styles.brief} aria-label={page.briefTitle}>
                    <p className={styles.eyebrow}>{page.briefTitle}</p>
                    {page.highlight && <p className={styles.highlight}>{page.highlight}</p>}
                    <ul>{page.brief.map((item, index) => <li key={item}><span aria-hidden="true">0{index + 1}</span>{item}</li>)}</ul>
                    <p className={styles.note}>{page.note}</p>
                </aside>
            </section>
            <div className={styles.content}>
                <section className={styles.section}>
                    <div className={styles.sectionHeading}><p className={styles.eyebrow}>What we can help with</p><h2>{page.sectionTitle}</h2><p>{page.sectionIntro}</p></div>
                    {page.services && <div className={styles.services}>{page.services.map((item, index) => <Link key={item.href} className={styles.service} href={item.href}><span className={styles.number}>0{index + 1}</span><div><h3>{item.title}</h3><p>{item.text}</p></div><span aria-hidden="true">↗</span></Link>)}</div>}
                    <h3 className={styles.examplesHeading}>{page.examplesTitle}</h3>
                    <div className={styles.examples}>{page.examples.map(item => <div key={item.title}><h4>{item.title}</h4><p>{item.text}</p></div>)}</div>
                    {page.audience && <p className={styles.audience}>{page.audience}</p>}
                    {page.printLink && <div className={styles.printCta}><div><h3>Already have a printable model?</h3><p>Upload it to start a print request and review the available options.</p></div><Link className={styles.textLink} href="/prints/request">Start a print request <span aria-hidden="true">↗</span></Link></div>}
                </section>
                <section className={`${styles.section} ${styles.split}`} id="requirements">
                    <div className={styles.sectionHeading}><p className={styles.eyebrow}>Your project brief</p><h2>What to send for a quotation</h2><p>Send what you have. We’ll clarify any missing details before agreeing the work.</p></div>
                    <ol className={styles.checklist}>{page.checklist.map((item, index) => <li key={item}><span className={styles.number}>0{index + 1}</span><p>{item}</p></li>)}</ol>
                </section>
                <section className={styles.section}>
                    <div className={styles.sectionHeading}><p className={styles.eyebrow}>Working together</p><h2>From enquiry to delivery</h2></div>
                    <ol className={styles.steps}>{page.steps.map((step, index) => <li key={step.title}><span className={styles.number}>0{index + 1}</span><h3>{step.title}</h3><p>{step.text}</p></li>)}</ol>
                </section>
                <section className={`${styles.section} ${styles.split}`}>
                    <div className={styles.sectionHeading}><p className={styles.eyebrow}>Before you enquire</p><h2>Common questions</h2></div>
                    <div>{page.faqs.map(faq => <details className={styles.question} key={faq.question}><summary>{faq.question}<span aria-hidden="true">+</span></summary><p>{faq.answer}</p></details>)}</div>
                </section>
                {!page.services && <section className={styles.section}><div className={styles.sectionHeading}><p className={styles.eyebrow}>Related services</p><h2>Other parts of your project</h2></div><div className={styles.related}>{related.map(item => <Link key={item.href} href={item.href}><h3>{item.title} <span aria-hidden="true">↗</span></h3><p>{item.text}</p></Link>)}</div></section>}
            </div>
            <section className={styles.enquiry} id="enquire">
                <div><p className={styles.eyebrow}>Start an enquiry</p><h2>Tell us about your project.</h2></div>
                <div><p>Email your drawings or project details to start a quotation. Include the intended use, quantity and required date.</p><a className={styles.button} href={enquiryHref}>Email your enquiry <span aria-hidden="true">↗</span></a><a className={styles.email} href={`mailto:${email}`}>{email}</a><p className={styles.emailNote}>The button opens your email app with a short brief to fill in. You can attach your files there.</p></div>
            </section>
        </main>
    )
}
