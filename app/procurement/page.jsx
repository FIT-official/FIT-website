import Link from 'next/link'
import { PROCUREMENT_SUMMARY, procurementQuestions, procurementServices } from '@/lib/content/procurement'
import { buildPageMetadata } from '@/lib/seo/metadata'
import { absoluteUrl } from '@/lib/seo/site'
import { ORGANIZATION_ID, WEBSITE_ID } from '@/lib/seo/organization'
import { faqJsonLd } from '@/lib/seo/faq'
import { jsonLdString } from '@/lib/jsonLd'

const path = '/procurement'
const heading = 'Procurement for schools and research teams'
const description = 'FIT is GeBIZ registered and supports Ariba procurement for NTU and NUS. Enquire about custom parts, 3D printing and workshops in Singapore.'
export const metadata = buildPageMetadata({ title: 'GeBIZ & Ariba Procurement Singapore | FIT', description, path, imageAlt: 'Fix It Today' })

const enquiryHref = `mailto:fixittoday.contact@gmail.com?subject=${encodeURIComponent('Organisation procurement enquiry')}&body=${encodeURIComponent('Hello FIT,\n\nOrganisation / research group:\nProject brief:\nService needed:\nQuantity:\nRequired date and delivery contact:\nQuotation / purchase-order / Ariba requirements:\nFiles available (please attach):\n')}`

export default function ProcurementPage() {
    const schema = {
        '@context': 'https://schema.org',
        '@graph': [
            { '@type': 'WebPage', '@id': absoluteUrl(path), url: absoluteUrl(path), name: heading,
                description, inLanguage: 'en-SG', about: { '@id': ORGANIZATION_ID }, isPartOf: { '@id': WEBSITE_ID } },
            { '@type': 'BreadcrumbList', itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: absoluteUrl('/') },
                { '@type': 'ListItem', position: 2, name: 'Procurement', item: absoluteUrl(path) },
            ] },
            faqJsonLd(procurementQuestions),
        ],
    }
    return <main className="w-full border-b border-borderColor px-6 py-12 md:px-16 md:py-20">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(schema) }} />
        <nav aria-label="Breadcrumb" className="mb-8 flex flex-wrap gap-3 text-sm">
            <Link href="/" className="underline underline-offset-4">Home</Link><span aria-hidden="true">/</span><span aria-current="page">Procurement</span>
        </nav>
        <header className="max-w-3xl">
            <p className="mb-4 text-xs uppercase tracking-wider">Organisation enquiries in Singapore</p>
            <h1 className="text-3xl leading-tight md:text-5xl">{heading}</h1>
            <p className="mt-6 leading-8">{PROCUREMENT_SUMMARY}</p>
            <p className="mt-4 text-sm leading-7">Discuss your project scope and purchasing requirements with FIT before placing an order. Send a short brief so we can check the work, quotation and documents your team needs.</p>
            <a href={enquiryHref} className="mt-6 inline-block rounded-lg bg-black px-6 py-3 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">Enquire about procurement</a>
        </header>
        <section className="mt-14 border-t border-borderColor pt-10" aria-labelledby="procurement-services">
            <h2 id="procurement-services" className="text-2xl">What we can quote for</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{procurementServices.map(service => <Link key={service.href} href={service.href} className="rounded-xl border border-borderColor p-5 transition-colors hover:bg-black/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
                <h3 className="text-lg">{service.title}</h3><p className="mt-3 text-sm leading-7">{service.text}</p>
            </Link>)}</div>
        </section>
        <section className="mt-12 border-t border-borderColor pt-10" aria-labelledby="procurement-brief">
            <h2 id="procurement-brief" className="text-2xl">Send a project brief</h2>
            <ul className="mt-5 max-w-3xl list-disc space-y-3 pl-5 text-sm leading-7">
                <li>Your organisation, school or research group and a contact person.</li>
                <li>The intended use, quantity, drawings or files, and any critical dimensions.</li>
                <li>The required date and delivery location, or workshop group size and venue.</li>
                <li>Quotation, purchase-order, Ariba or supporting-document requirements.</li>
            </ul>
            <p className="mt-6 text-sm leading-7">Email <a href={enquiryHref} className="underline underline-offset-4">fixittoday.contact@gmail.com</a>. Attach files to the email and let us know if you need supplier details for your purchasing process.</p>
        </section>
        <section className="mt-12 border-t border-borderColor pt-10" aria-labelledby="procurement-questions">
            <h2 id="procurement-questions" className="text-2xl">Procurement questions</h2>
            <div className="mt-5 max-w-3xl divide-y divide-borderColor">{procurementQuestions.map(({ question, answer }) => <details key={question} className="py-5">
                <summary className="cursor-pointer text-base font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">{question}</summary>
                <p className="mt-4 text-sm leading-7">{answer}</p>
            </details>)}</div>
        </section>
    </main>
}
