import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }), SignInButton: ({ children }) => children }))
vi.mock('next/link', () => ({ default: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a> }))
import PrinterRepairPage, { generateMetadata } from '@/app/printer-repair/page'
import robots from '@/app/robots'
import { buildPublicSitemap } from '@/lib/seo/sitemap'

const url = 'https://www.fixitoday.com/printer-repair'
describe('printer repair public SEO', () => {
  it('uses subject-specific metadata with an absolute canonical and consistent social URLs', async () => {
    const meta = await generateMetadata({ searchParams: Promise.resolve({}) })
    expect(meta.title).toBe('3D Printer Repair Assessment Singapore | FIT')
    expect(meta.description).toContain('assessment in Singapore')
    expect(meta.alternates.canonical).toBe(url)
    expect(meta.openGraph).toMatchObject({ title: meta.title, description: meta.description, url })
    expect(meta.twitter).toMatchObject({ title: meta.title, description: meta.description })
    expect(meta.robots).toMatchObject({ index: true, follow: true })
  })
  it('keeps private recovery URLs out of search while canonicalizing to the public page', async () => {
    const meta = await generateMetadata({ searchParams: Promise.resolve({ request: 'private-fixture-reference' }) })
    expect(meta.robots).toMatchObject({ index: false, follow: false, googleBot: { index: false, follow: false } })
    expect(meta.alternates.canonical).toBe(url)
    expect(JSON.stringify(meta)).not.toContain('private-fixture-reference')
  })
  it('renders a single heading, visible assessment content and internal links before effects', () => {
    const html = renderToStaticMarkup(<PrinterRepairPage />)
    expect(html.match(/<h1>/g)).toHaveLength(1)
    expect(html).toContain('Need help with your 3D printer?')
    expect(html).toContain('About your printer assessment')
    expect(html).toContain('not a reserved slot')
    expect(html).toContain('FIT will confirm whether we can help')
    expect(html).toContain('href="/blog/3d-printer-repair"')
    expect(html).toContain('aria-label="Breadcrumb"')
  })
  it('describes the visible assessment service without price, availability or review claims', () => {
    const html = renderToStaticMarkup(<PrinterRepairPage />)
    const schema = JSON.parse(html.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1])
    const service = schema['@graph'].find(node => node['@type'] === 'Service')
    expect(service).toMatchObject({ url, serviceType: '3D printer assessment', provider: { '@id': 'https://www.fixitoday.com/#organization' } })
    const breadcrumb = schema['@graph'].find(node => node['@type'] === 'BreadcrumbList')
    expect(breadcrumb.itemListElement.map(item => item.item)).toEqual(['https://www.fixitoday.com/', url])
    expect(JSON.stringify(schema)).not.toMatch(/aggregateRating|offers|price|review|openingHours|availability|potentialAction/)
  })
  it('remains in the public sitemap and outside robots disallow rules', () => {
    expect(buildPublicSitemap().some(item => item.url === url)).toBe(true)
    expect(robots().rules.disallow.some(path => '/printer-repair'.startsWith(path))).toBe(false)
  })
})
