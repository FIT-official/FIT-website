import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import SchoolProgrammes, { metadata as schoolMetadata } from '@/app/school-programmes/page'
import CompanyWorkshops, { metadata as companyMetadata } from '@/app/company-workshops/page'
import { buildPublicSitemap } from '@/lib/seo/sitemap'
import { ORGANIZATION_ID } from '@/lib/seo/organization'
import { PROCUREMENT_SUMMARY } from '@/lib/content/procurement'

vi.mock('next/link', () => ({ default: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a> }))
vi.mock('next/image', () => ({ default: ({ src, alt }) =>
    // eslint-disable-next-line @next/next/no-img-element -- Server-rendering test double.
    <img src={src} alt={alt} />,
}))

describe('public programme pages', () => {
    it.each([
        ['/school-programmes', SchoolProgrammes, schoolMetadata, 'School programme enquiry'],
        ['/company-workshops', CompanyWorkshops, companyMetadata, 'Team or community programme enquiry'],
    ])('renders %s with crawlable content, a working enquiry and consistent search metadata', (path, Page, metadata, subject) => {
        const html = renderToStaticMarkup(<Page />)
        const document = new DOMParser().parseFromString(html, 'text/html')
        const url = `https://www.fixitoday.com${path}`
        const schema = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)
        expect(document.querySelectorAll('h1')).toHaveLength(1)
        expect(schema).toMatchObject({ '@type': 'Service', url, name: document.querySelector('h1').textContent })
        expect(schema.provider['@id']).toBe(ORGANIZATION_ID)
        expect(document.body.textContent).toContain(PROCUREMENT_SUMMARY)
        expect(document.querySelector('a[href="/procurement"]')).not.toBeNull()
        const faq = [...document.querySelectorAll('script[type="application/ld+json"]')]
            .map(script => JSON.parse(script.textContent)).find(item => item['@type'] === 'FAQPage')
        expect(faq.mainEntity).toEqual([...document.querySelectorAll('details')].map(details => {
            const summary = details.querySelector('summary').cloneNode(true)
            summary.querySelectorAll('[aria-hidden="true"]').forEach(node => node.remove())
            return { '@type': 'Question', name: summary.textContent,
                acceptedAnswer: { '@type': 'Answer', text: details.querySelector('p').textContent } }
        }))
        expect(metadata.alternates.canonical).toBe(url)
        expect(metadata.openGraph.url).toBe(url)
        expect(buildPublicSitemap().some(entry => entry.url === url)).toBe(true)
        const enquiry = new URL(document.querySelector('a[href^="mailto:"]').getAttribute('href'))
        expect(enquiry.pathname).toBe('fixittoday.contact@gmail.com')
        expect(enquiry.searchParams.get('subject')).toBe(subject)
        expect(enquiry.searchParams.get('body')).toContain('Budget:')
        for (const anchor of document.querySelectorAll('a[href^="#"]')) {
            expect(document.querySelector(anchor.getAttribute('href'))).not.toBeNull()
        }
        expect(document.querySelectorAll('a[href^="/blog/"]').length).toBeGreaterThan(3)
    })
})
