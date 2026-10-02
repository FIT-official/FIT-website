import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import ProcurementPage, { metadata } from '@/app/procurement/page'
import ServicePage from '@/components/Services/ServicePage'
import { Questions } from '@/components/Programmes/ProgrammeLayout'
import { PROCUREMENT_SUMMARY, procurementQuestions, procurementServices } from '@/lib/content/procurement'
import { researchServices } from '@/lib/content/researchServices'
import { ORGANIZATION_ID, WEBSITE_ID, organizationJsonLd, siteJsonLd } from '@/lib/seo/organization'
import { buildPublicSitemap } from '@/lib/seo/sitemap'
import { jsonLdString } from '@/lib/jsonLd'

vi.mock('next/link', () => ({ default: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a> }))

function renderDocument(page) {
    return new DOMParser().parseFromString(renderToStaticMarkup(page), 'text/html')
}

function visibleQuestions(document) {
    return [...document.querySelectorAll('details')].map(details => {
        const summary = details.querySelector('summary').cloneNode(true)
        summary.querySelectorAll('[aria-hidden="true"]').forEach(node => node.remove())
        return { '@type': 'Question', name: summary.textContent,
            acceptedAnswer: { '@type': 'Answer', text: details.querySelector('p').textContent } }
    })
}

describe('procurement information for public search', () => {
    it('renders the supplied procurement facts, public service links and a usable enquiry before client effects', () => {
        const document = renderDocument(<ProcurementPage />)
        expect(document.querySelectorAll('h1')).toHaveLength(1)
        expect(document.body.textContent).toContain(PROCUREMENT_SUMMARY)
        expect(document.body.textContent).toContain('Nanyang Technological University (NTU)')
        expect(document.body.textContent).toContain('National University of Singapore (NUS)')
        for (const service of procurementServices) {
            expect(document.querySelector(`a[href="${service.href}"]`)).not.toBeNull()
            expect(buildPublicSitemap().some(entry => entry.url === `https://www.fixitoday.com${service.href}`)).toBe(true)
        }
        const enquiry = new URL(document.querySelector('a[href^="mailto:"]').getAttribute('href'))
        expect(enquiry.pathname).toBe('fixittoday.contact@gmail.com')
        expect(enquiry.searchParams.get('subject')).toBe('Organisation procurement enquiry')
        expect(enquiry.searchParams.get('body')).toContain('Quotation / purchase-order / Ariba requirements:')
        expect(enquiry.searchParams.get('body')).toContain('Quantity:')
    })

    it('uses a canonical public page with matching visible FAQ and breadcrumb data', () => {
        const document = renderDocument(<ProcurementPage />)
        const graph = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@graph']
        const canonical = 'https://www.fixitoday.com/procurement'
        expect(metadata.alternates.canonical).toBe(canonical)
        expect(metadata.openGraph.url).toBe(canonical)
        expect(metadata.description).toContain('GeBIZ registered')
        expect(metadata.description).toContain('Ariba procurement for NTU and NUS')
        expect(metadata.robots?.index).not.toBe(false)
        expect(buildPublicSitemap().some(entry => entry.url === canonical)).toBe(true)
        expect(graph.find(item => item['@type'] === 'WebPage')).toMatchObject({
            '@id': canonical, url: canonical, name: document.querySelector('h1').textContent,
            about: { '@id': ORGANIZATION_ID }, isPartOf: { '@id': WEBSITE_ID }, inLanguage: 'en-SG',
        })
        expect(graph.find(item => item['@type'] === 'BreadcrumbList').itemListElement).toEqual([
            { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.fixitoday.com/' },
            { '@type': 'ListItem', position: 2, name: 'Procurement', item: canonical },
        ])
        const faq = graph.find(item => item['@type'] === 'FAQPage')
        expect(faq.mainEntity).toEqual(visibleQuestions(document))
        expect(faq.mainEntity).toHaveLength(procurementQuestions.length)
    })

    it('describes one Singapore organisation without inventing procurement credentials or reviews', () => {
        expect(organizationJsonLd).toMatchObject({
            '@type': 'Organization', '@id': ORGANIZATION_ID, name: 'Fix It Today', alternateName: 'FIT',
            areaServed: { '@type': 'Country', name: 'Singapore' },
        })
        expect(organizationJsonLd.description).toContain(PROCUREMENT_SUMMARY)
        expect(organizationJsonLd.sameAs).toEqual(['https://www.linkedin.com/company/fix-it-today-sg'])
        for (const inventedField of ['address', 'taxID', 'hasCredential', 'award', 'aggregateRating', 'review', 'sponsor', 'memberOf']) {
            expect(organizationJsonLd).not.toHaveProperty(inventedField)
        }
        expect(siteJsonLd['@graph'][1]).toMatchObject({ '@type': 'WebSite', '@id': WEBSITE_ID, publisher: { '@id': ORGANIZATION_ID } })
        expect(JSON.parse(jsonLdString(siteJsonLd))).toEqual(siteJsonLd)
    })

    it.each(Object.values(researchServices))('keeps FAQ data and provider identity aligned with $path', page => {
        const document = renderDocument(<ServicePage page={page} />)
        const graph = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@graph']
        expect(graph.find(item => item['@type'] === 'Service').provider['@id']).toBe(ORGANIZATION_ID)
        expect(graph.find(item => item['@type'] === 'FAQPage').mainEntity).toEqual(visibleQuestions(document))
        expect(document.querySelector('a[href="/procurement"]')).not.toBeNull()
        expect(document.body.textContent).toContain(PROCUREMENT_SUMMARY)
    })

    it('escapes FAQ script boundaries while preserving the exact visible answer', () => {
        const items = [{ question: 'Can a file contain <markup>?', answer: '</script><script>alert("unsafe")</script> & quotation details' }]
        const document = renderDocument(<Questions items={items} />)
        expect(document.querySelectorAll('script')).toHaveLength(1)
        const faq = JSON.parse(document.querySelector('script').textContent)
        expect(faq.mainEntity).toEqual(visibleQuestions(document))
        expect(faq.mainEntity[0].acceptedAnswer.text).toBe(items[0].answer)
    })
})
