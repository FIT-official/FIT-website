import PrinterRepairFlow from '@/components/Services/PrinterRepairFlow'
import Link from 'next/link'
import { buildPageMetadata, PRIVATE_PAGE_ROBOTS } from '@/lib/seo/metadata'
import { absoluteUrl } from '@/lib/seo/site'
import { jsonLdString } from '@/lib/jsonLd'
import styles from './page.module.css'

const title = '3D Printer Repair Assessment Singapore | FIT'
const description = 'Request a 3D printer assessment in Singapore. Share your printer model, symptoms and checks tried; FIT will discuss support and any proposed repair work.'
const url = absoluteUrl('/printer-repair')
const pageMetadata = buildPageMetadata({ title, description, path: '/printer-repair', robots: { index: true, follow: true }, imageAlt: 'Fix It Today' })

export async function generateMetadata({ searchParams } = {}) {
  const query = await searchParams
  // Recovery URLs belong to the customer; index the public assessment page.
  return query?.request !== undefined ? { ...pageMetadata, robots: PRIVATE_PAGE_ROBOTS } : pageMetadata
}

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebPage', '@id': `${url}#webpage`, url, name: title, description,
      isPartOf: { '@id': absoluteUrl('/#website') }, mainEntity: { '@id': `${url}#service` } },
    { '@type': 'Service', '@id': `${url}#service`, url, name: '3D printer assessment requests',
      serviceType: '3D printer assessment', description,
      provider: { '@id': absoluteUrl('/#organization') },
      areaServed: { '@type': 'Country', name: 'Singapore' } },
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: absoluteUrl('/') },
      { '@type': 'ListItem', position: 2, name: 'Printer repair assessment', item: url },
    ] },
  ],
}

export default function PrinterRepairPage() {
  return <main>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }} />
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">Printer repair assessment</span></nav>
    <PrinterRepairFlow />
    <section className={styles.guidance} aria-labelledby="repair-assessment-guidance">
      <h2 id="repair-assessment-guidance">About your printer assessment</h2>
      <div className={styles.questions}>
        <div><h3>Which printer can I ask about?</h3><p>Share the brand and model of your 3D printer, including Bambu Lab, Prusa or another brand. Choose Other or Not sure where needed. FIT will confirm whether we can help after reviewing the details.</p></div>
        <div><h3>What details should I include?</h3><p>Describe when the fault occurs, the error message and any checks you have tried. Tell us whether an external filament feeder is installed. You do not need to diagnose the failed part.</p></div>
        <div><h3>Can I send a request without photos?</h3><p>Yes. Photos are optional. If photo uploads are unavailable, describe the fault and discuss photos with FIT.</p></div>
        <div><h3>Does sending a request book a repair?</h3><p>Sending creates an assessment request. Your preferred date is a preference, not a reserved slot. Agree support, handover, proposed work and any fee with FIT before proceeding.</p></div>
      </div>
      <p className={styles.links}><Link href="/blog/3d-printer-repair">Read the 3D printer repair and maintenance guide</Link><Link href="/blog/3d-printing-filament-types-guide">Compare filament materials</Link></p>
    </section>
  </main>
}
