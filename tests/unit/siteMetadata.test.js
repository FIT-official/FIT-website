import { describe, expect, it } from 'vitest'
import { buildPageMetadata, PRIVATE_PAGE_ROBOTS } from '@/lib/seo/metadata'

describe('page search metadata', () => {
    it('uses the public www URL consistently for canonical and share previews', () => {
        const metadata = buildPageMetadata({
            title: 'Metal fabrication in Singapore',
            description: 'Custom parts made from CAD drawings.',
            path: '/metal-fabrication',
            image: '/work/fixture.jpg',
            imageAlt: 'A metal fixture',
        })
        expect(metadata.alternates.canonical).toBe('https://www.fixitoday.com/metal-fabrication')
        expect(metadata.openGraph.url).toBe(metadata.alternates.canonical)
        expect(metadata.openGraph.images).toEqual([{ url: 'https://www.fixitoday.com/work/fixture.jpg', alt: 'A metal fixture' }])
        expect(metadata.twitter.images).toEqual(['https://www.fixitoday.com/work/fixture.jpg'])
        expect(metadata.openGraph.description).toBe(metadata.description)
        expect(metadata.twitter.description).toBe(metadata.description)
        expect(metadata).not.toHaveProperty('keywords')
    })

    it('provides a real fallback share image when no page image is supplied', () => {
        const metadata = buildPageMetadata({ title: 'FIT', description: 'FIT services.', path: '/', image: '' })
        expect(metadata.openGraph.images).toEqual(['https://www.fixitoday.com/fitogimage.png'])
    })

    it('overrides general and Google robots for private pages', () => {
        const metadata = buildPageMetadata({ title: 'Account', path: '/account', robots: PRIVATE_PAGE_ROBOTS })
        expect(metadata.robots).toMatchObject({ index: false, follow: false, googleBot: { index: false, follow: false } })
    })
})
