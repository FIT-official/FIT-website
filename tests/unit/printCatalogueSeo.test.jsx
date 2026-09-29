import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { cleanup, render, screen } from '@testing-library/react'

const state = vi.hoisted(() => ({ products: [], filter: null, fields: '', search: '' }))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn(async () => {}) }))
vi.mock('@/models/Product', () => ({ default: {
    find: filter => {
        state.filter = filter
        return { select: fields => {
            state.fields = fields
            return { lean: async () => state.products }
        } }
    },
} }))
vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ user: null, isSignedIn: false, isLoaded: true }) }))
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
    useSearchParams: () => new URLSearchParams(state.search),
}))
vi.mock('next/image', () => ({ default: ({ src, alt, width, height, className }) =>
    // eslint-disable-next-line @next/next/no-img-element -- Test double for Next image.
    <img src={src} alt={alt} width={width} height={height} className={className} />,
}))
vi.mock('next/link', () => ({ default: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a> }))
vi.mock('@/utils/useContent', () => ({ useContent: (_path, fallback) => ({ content: fallback }) }))
vi.mock('@/components/LinkToolTip', () => ({ default: () => null }))

import PrintLayout, { metadata, dynamic } from '@/app/prints/page'
import PrintPage from '@/app/prints/PrintPage'
import { getPrintProducts } from '@/lib/seo/shop'

const product = (name, slug, price = 20) => ({
    _id: slug, name, slug, productType: 'print', listing: 'fit',
    description: `${name} model`, images: [], variantTypes: [], reviews: [],
    basePrice: { presentmentAmount: price, presentmentCurrency: 'SGD' },
    salesCount: 0, likeCount: 0,
})

beforeEach(() => {
    state.products = []
    state.filter = null
    state.fields = ''
    state.search = ''
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected catalogue fetch')))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('print catalogue before browser effects', () => {
    it('renders real product anchors and the request entry without a client fetch or a price cutoff', async () => {
        state.products = [product('Sample holder', 'sample-holder'), product('Large enclosure', 'large-enclosure', 140)]
        const html = renderToStaticMarkup(await PrintLayout({ searchParams: Promise.resolve({}) }))
        expect(dynamic).toBe('force-dynamic')
        expect(html).toContain('3D Printing in Singapore')
        expect(html).toContain('href="/products/sample-holder"')
        expect(html).toContain('href="/products/large-enclosure"')
        expect(html).toContain('href="/prints/request"')
        expect(html).toContain('href="/3d-design-printing"')
        expect(html).not.toContain('animate-pulse')
        expect(html).not.toContain('"offers"')
        expect(global.fetch).not.toHaveBeenCalled()
    })

    it('uses the www collection URL consistently and does not turn query facets into canonical pages', async () => {
        const html = renderToStaticMarkup(await PrintLayout({ searchParams: Promise.resolve({ productCategory: 'Fixtures' }) }))
        expect(metadata.alternates.canonical).toBe('https://www.fixitoday.com/prints')
        expect(metadata.openGraph.url).toBe(metadata.alternates.canonical)
        expect(metadata.twitter.card).toBe('summary_large_image')
        expect(html).toContain('"url":"https://www.fixitoday.com/prints"')
        expect(html).not.toContain('https://fixitoday.com')
    })

    it('updates search after URL navigation without a second public catalogue fetch', () => {
        const products = [product('Sample holder', 'sample-holder'), product('Enclosure', 'enclosure')]
        state.search = 'search=holder'
        const view = render(<PrintPage initialProducts={products} />)
        expect(screen.getByRole('link', { name: 'Sample holder' })).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: 'Enclosure' })).not.toBeInTheDocument()
        state.search = 'search=Enclosure'
        view.rerender(<PrintPage initialProducts={products} />)
        expect(screen.getByRole('link', { name: 'Enclosure' })).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: 'Sample holder' })).not.toBeInTheDocument()
        expect(global.fetch).not.toHaveBeenCalled()
    })

    it('keeps the custom print entry available when the catalogue is empty', async () => {
        const html = renderToStaticMarkup(await PrintLayout())
        expect(html).toContain('Get a 3D print made')
        expect(html).toContain('href="/prints/request"')
        expect(html).toContain('No matching designs found.')
    })
})

describe('server print catalogue', () => {
    it('keeps creator, hidden and moderated entries out and treats category names literally', async () => {
        await getPrintProducts({ productCategory: ' Fixtures ', productSubCategory: 'PLA+' })
        expect(state.filter).toEqual({
            productType: 'print', listing: 'fit', hidden: false, flaggedForModeration: { $ne: true },
            slug: { $nin: expect.arrayContaining(['custom-print-request', 'creator-product', 'print-product-test-2']) },
            categoryId: { $regex: '^Fixtures$', $options: 'i' },
            subcategoryId: { $regex: '^PLA\\+$', $options: 'i' },
        })
        await getPrintProducts({ productCategory: '0', productSubCategory: '2' })
        expect(state.filter).toMatchObject({ productType: 'print', listing: 'fit', category: 0, subcategory: 2 })
    })

    it('passes counts to browser cards without buyer, liker or paid-download fields', async () => {
        state.products = [{
            ...product('Sample holder', 'sample-holder'),
            createdAt: new Date('2026-09-29T00:00:00Z'),
            sales: [{ _id: 'sale1' }], likes: ['private-liker'],
        }]
        const cards = await getPrintProducts()
        expect(cards[0]).toMatchObject({ salesCount: 1, likeCount: 1, createdAt: '2026-09-29T00:00:00.000Z' })
        expect(cards[0]).not.toHaveProperty('sales')
        expect(cards[0]).not.toHaveProperty('likes')
        expect(state.fields).not.toMatch(/paidAssets|creatorUserId|sales\.userId|reviews\.userId/)
        expect(JSON.stringify(cards)).not.toContain('private-liker')
    })
})
