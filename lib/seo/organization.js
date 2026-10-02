import { absoluteUrl, SITE_URL } from './site'
import { PROCUREMENT_SUMMARY } from '@/lib/content/procurement'

export const ORGANIZATION_ID = absoluteUrl('/#organization')
export const WEBSITE_ID = absoluteUrl('/#website')
export const organizationJsonLd = {
    '@type': 'Organization', '@id': ORGANIZATION_ID,
    name: 'Fix It Today', alternateName: 'FIT', url: SITE_URL,
    logo: absoluteUrl('/fitogimage.png'),
    description: `3D printing, custom metal parts, CAD design, electronics, printer assessments and STEM workshops in Singapore. ${PROCUREMENT_SUMMARY}`,
    email: 'fixittoday.contact@gmail.com',
    sameAs: ['https://www.linkedin.com/company/fix-it-today-sg'],
    areaServed: { '@type': 'Country', name: 'Singapore' },
}

export const siteJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [organizationJsonLd, {
        '@type': 'WebSite', '@id': WEBSITE_ID,
        url: SITE_URL, name: 'Fix It Today', publisher: { '@id': ORGANIZATION_ID },
        potentialAction: {
            '@type': 'SearchAction',
            target: `${absoluteUrl('/shop')}?search={search_term_string}`,
            'query-input': 'required name=search_term_string',
        },
    }],
}
