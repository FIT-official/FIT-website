import Link from 'next/link'
import { GoChevronRight } from 'react-icons/go'
import ButtonLink from '@/components/Buttons/ButtonLink'
import { absoluteUrl } from '@/lib/seo/site'
import { buildPageMetadata } from '@/lib/seo/metadata'
import { serviceLinks } from '@/lib/content/researchServices'
import styles from './ServicePage.module.css'

const email = 'fixittoday.contact@gmail.com'

export function serviceMetadata(page) {
    return buildPageMetadata(page)
}

export default function ServicePage({ page }) {
    const enquiryHref = `mailto:${email}?subject=${encodeURIComponent(page.enquirySubject)}&body=${encodeURIComponent(`Hello FIT,\n\n${page.enquiryFields.join('\n\n')}\n\n`)}`
    const related = serviceLinks.filter(item => item.href !== page.path)
    const schema = {
        '@context': 'https://schema.org',
        '@graph': [
            { '@type': 'Service', '@id': `${absoluteUrl(page.path)}#service`, name: page.heading, description: page.description, url: absoluteUrl(page.path), serviceType: page.heading, areaServed: { '@type': 'Country', name: 'Singapore' }, provider: { '@type': 'Organization', name: 'Fix It Today', url: absoluteUrl('/'), email } },
            { '@type': 'BreadcrumbList', itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: absoluteUrl('/') },
                { '@type': 'ListItem', position: 2, name: 'Research fabrication', item: absoluteUrl('/research-fabrication') },
                ...(page.path === '/research-fabrication' ? [] : [{ '@type': 'ListItem', position: 3, name: page.heading, item: absoluteUrl(page.path) }]),
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
                <h1>{page.heading}</h1>
                <p className={styles.intro}>{page.intro}</p>
                <div className={styles.actions}>
                    <ButtonLink lnk="#enquire" text="Request a quote" />
                    <a className={styles.textLink} href="#requirements">What to include</a>
                </div>
            </section>
            <div className={styles.content}>
                <section className={styles.section}>
                    <div className={styles.sectionHeading}><h2>{page.sectionTitle}</h2><p>{page.sectionIntro}</p></div>
                    {page.services && <div className={styles.services}>{page.services.map(item => <Link key={item.href} className={styles.service} href={item.href}><h3>{item.title}<GoChevronRight aria-hidden="true" /></h3><p>{item.text}</p></Link>)}</div>}
                    <h3 className={styles.examplesHeading}>{page.examplesTitle}</h3>
                    <div className={styles.examples}>{page.examples.map(item => <div key={item.title}><h4>{item.title}</h4><p>{item.text}</p></div>)}</div>
                    {page.audience && <p className={styles.audience}>{page.audience}</p>}
                    {page.printLink && <div className={styles.printCta}><div><h3>Have a file ready to print?</h3><p>Upload your model to see the printing options.</p></div><Link className={styles.textLink} href="/prints/request">Start a print request<GoChevronRight aria-hidden="true" /></Link></div>}
                </section>
                <section className={`${styles.section} ${styles.split}`} id="requirements">
                    <div className={styles.sectionHeading}><h2>What to include</h2><p>These details help us prepare your quote. If something is missing, we’ll ask.</p></div>
                    <ul className={styles.checklist}>{page.checklist.map(item => <li key={item}>{item}</li>)}</ul>
                </section>
                {page.process && <section className={styles.section} aria-labelledby="design-request-steps">
                    <div className={styles.sectionHeading}><h2 id="design-request-steps">From your idea to a quote</h2><p>A sketch is enough to start the conversation. Design work and printing can be quoted separately.</p></div>
                    <ol className={styles.examples}>{page.process.map((step, index) => <li key={step.title}><h3>{index + 1}. {step.title}</h3><p>{step.text}</p></li>)}</ol>
                </section>}
                <section className={`${styles.section} ${styles.split}`}>
                    <div className={styles.sectionHeading}><h2>FAQs</h2></div>
                    <div>{page.faqs.map(faq => <details className={styles.question} key={faq.question}><summary>{faq.question}<span aria-hidden="true">+</span></summary><p>{faq.answer}</p></details>)}</div>
                </section>
                {!page.services && <section className={styles.section}><div className={styles.sectionHeading}><h2>Related services</h2></div><div className={styles.related}>{related.map(item => <Link key={item.href} href={item.href}><h3>{item.title}<GoChevronRight aria-hidden="true" /></h3><p>{item.text}</p></Link>)}</div></section>}
                <section className={`${styles.section} ${styles.split}`} aria-labelledby="organisation-enquiry">
                    <div className={styles.sectionHeading}><h2 id="organisation-enquiry">Buying for a school or organisation?</h2><p>Include the purchasing requirements with your enquiry so we can check them before quoting.</p></div>
                    <p className={styles.organisationDetails}>Tell us if you need a written quotation, purchase-order reference, named delivery contact or specific documents. Include your organisation name and required date. We will confirm the scope and paperwork we can provide; supplier registration and special payment terms need separate confirmation.</p>
                </section>
            </div>
            <section className={styles.enquiry} id="enquire">
                <div><h2>Request a quote</h2><p>Email your drawings and a short description of what you need, including the quantity and required date.</p><a className={styles.email} href={`mailto:${email}`}>{email}</a></div>
                <div className={styles.enquiryAction}><ButtonLink lnk={enquiryHref} text="Email FIT" /><p className={styles.emailNote}>Attach your files in the email.</p></div>
            </section>
        </main>
    )
}
