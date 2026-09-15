import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { statusQuery } from '@/lib/blog/status'

const state = vi.hoisted(() => ({
    products: [], post: null, filters: [], productFields: '', postFilter: null,
    search: '', fetch: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn(async () => {}) }))
vi.mock('@/models/Product', () => ({ default: {
    find: filter => {
        state.filters.push(filter)
        return { select: fields => {
            state.productFields = fields
            return { lean: async () => state.products }
        } }
    },
} }))
vi.mock('@/models/BlogPost', () => ({ default: {
    findOne: filter => {
        state.postFilter = filter
        return { lean: async () => state.post }
    },
    find: () => {
        const chain = { select: () => chain, sort: () => chain, hint: () => chain,
            limit: () => chain, lean: async () => [] }
        return chain
    },
} }))
vi.mock('@clerk/nextjs', () => ({
    useUser: () => ({ user: null, isSignedIn: false, isLoaded: true }),
    useAuth: () => ({ userId: null, isSignedIn: false, isLoaded: true }),
}))
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: null })) }))
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
    useSearchParams: () => new URLSearchParams(state.search),
    notFound: () => { throw new Error('NEXT_NOT_FOUND') },
}))
vi.mock('next/image', () => ({ default: ({ src, alt, width, height, className }) =>
    // eslint-disable-next-line @next/next/no-img-element -- Test double for the Next.js image component.
    <img src={src} alt={alt} width={width} height={height} className={className} />,
}))
vi.mock('next/link', () => ({ default: ({ href, children, ...props }) =>
    <a href={href} {...props}>{children}</a>,
}))
vi.mock('@/utils/useContent', () => ({ useContent: (_path, fallback) => ({ content: fallback }) }))
vi.mock('@/components/Home/Main', () => ({ default: () => null }))
vi.mock('@/components/Home/FeaturedSection', () => ({ default: () => null }))
vi.mock('@/components/Home/Testimonials', () => ({ default: () => null }))
vi.mock('@/components/Home/FeaturedArticles', () => ({ default: () => null }))
vi.mock('@/components/LinkToolTip', () => ({ default: () => null }))
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: vi.fn(async () => false) }))
vi.mock('@/lib/blog/sortIndex', () => ({
    BLOG_SORT_INDEX: { publishDate: -1, createdAt: -1 },
    ensureBlogSortIndex: vi.fn(async () => {}),
}))
vi.mock('@/lib/blog/renderTiptap', () => ({ renderTiptapHtml: () => '<p>Repair guide.</p>' }))
vi.mock('@/app/blog/[blogSlug]/BlogPageClient', () => ({ default: ({ post }) => <article>{post.title}</article> }))

const product = (name, slug, amount = 22) => ({
    _id: slug, name, slug, description: `${name} filament`, images: [],
    basePrice: { presentmentAmount: amount, presentmentCurrency: 'SGD' },
    variantTypes: [], reviews: [], salesCount: 0, likeCount: 0,
})

beforeEach(() => {
    vi.clearAllMocks()
    state.products = []
    state.post = null
    state.filters = []
    state.productFields = ''
    state.postFilter = null
    state.search = ''
    state.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, posts: [] }) })
    vi.stubGlobal('fetch', state.fetch)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('public landing pages before browser effects', () => {
    it('renders the homepage repair heading and crawlable service/shop links with its canonical URL', async () => {
        const { default: Home, metadata } = await import('@/app/page')
        const html = renderToStaticMarkup(<Home />)
        expect(html).toContain('3D Printer Repair and Filament in Singapore')
        expect(html).toContain('href="/blog/3d-printer-repair"')
        expect(html).toContain('href="/shop"')
        expect(metadata.alternates.canonical).toBe('https://www.fixitoday.com/')
        expect(metadata.openGraph.url).toBe(metadata.alternates.canonical)
        expect(state.fetch).not.toHaveBeenCalled()
    })

    it('renders actual shop cards, prices and product anchors before effects, including products above $100', async () => {
        state.products = [product('PLA Filament', 'pla'), product('Filament Bundle', 'bundle', 140)]
        const { default: Shop, metadata } = await import('@/app/shop/page')
        const html = renderToStaticMarkup(await Shop({ searchParams: Promise.resolve({}) }))
        expect(html).toContain('3D Printing Filament in Singapore')
        expect(html).toContain('href="/products/pla"')
        expect(html).toContain('href="/products/bundle"')
        expect(html).toContain('SGD 22.00')
        expect(html).toContain('SGD 140.00')
        expect(html).not.toContain('No products found.')
        expect(metadata.alternates.canonical).toBe('https://www.fixitoday.com/shop')
        expect(state.fetch).not.toHaveBeenCalled()
    })

    it('updates the shop search after URL navigation without fetching a second client catalogue', async () => {
        const { default: ShopPage } = await import('@/app/shop/ShopPage')
        const products = [product('PLA Filament', 'pla'), product('PETG Filament', 'petg')]
        state.search = 'search=PLA'
        const view = render(<ShopPage initialProducts={products} />)
        expect(screen.getByRole('link', { name: 'PLA Filament' })).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: 'PETG Filament' })).not.toBeInTheDocument()
        state.search = 'search=PETG'
        view.rerender(<ShopPage initialProducts={products} />)
        expect(screen.getByRole('link', { name: 'PETG Filament' })).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: 'PLA Filament' })).not.toBeInTheDocument()
        expect(state.fetch).not.toHaveBeenCalled()
    })
})

describe('server shop catalogue', () => {
    it('keeps hidden/moderated products excluded and treats named categories literally while supporting legacy indices', async () => {
        const { getShopProducts } = await import('@/lib/seo/shop')
        await getShopProducts({ productCategory: ' Filament ', productSubCategory: 'PLA+' })
        expect(state.filters[0]).toEqual({
            productType: 'shop', listing: 'fit', hidden: false, flaggedForModeration: { $ne: true },
            categoryId: { $regex: '^Filament$', $options: 'i' },
            subcategoryId: { $regex: '^PLA\\+$', $options: 'i' },
        })
        await getShopProducts({ productCategory: '0', productSubCategory: '2' })
        expect(state.filters[1]).toMatchObject({ category: 0, subcategory: 2, hidden: false })
    })

    it('returns serializable cards and aggregate counts without exposing buyer or liker identities', async () => {
        state.products = [{
            ...product('PLA Filament', 'pla'),
            createdAt: new Date('2026-09-01T00:00:00Z'),
            sales: [{ _id: 'sale1' }, { _id: 'sale2' }],
            likes: ['user_privateA', 'user_privateB'],
        }]
        const { getShopProducts } = await import('@/lib/seo/shop')
        const cards = await getShopProducts()
        expect(cards[0]).toMatchObject({ salesCount: 2, likeCount: 2, createdAt: '2026-09-01T00:00:00.000Z' })
        expect(cards[0]).not.toHaveProperty('sales')
        expect(cards[0]).not.toHaveProperty('likes')
        expect(JSON.stringify(cards)).not.toContain('user_private')
        expect(state.productFields).toContain('reviews.rating')
        expect(state.productFields).not.toMatch(/paidAssets|sales\.userId|reviews\.userId|authorId/)
    })
})

describe('blog search metadata', () => {
    it('uses the published-status filter and a www canonical with an absolute social image', async () => {
        state.post = { slug: '3d-printer-repair', title: 'Printer Repair', status: 'published', heroImage: 'guides/repair.jpg' }
        const { generateMetadata } = await import('@/app/blog/[blogSlug]/page')
        const metadata = await generateMetadata({ params: Promise.resolve({ blogSlug: state.post.slug }) })
        expect(state.postFilter).toEqual({ slug: state.post.slug, ...statusQuery('published') })
        expect(metadata.alternates.canonical).toBe('https://www.fixitoday.com/blog/3d-printer-repair')
        expect(metadata.openGraph.url).toBe(metadata.alternates.canonical)
        expect(metadata.openGraph.images).toEqual(['https://www.fixitoday.com/api/proxy?key=guides%2Frepair.jpg'])
    })

    it('uses the publisher organization as author instead of exposing an internal Clerk user ID', async () => {
        state.post = { slug: '3d-printer-repair', title: 'Printer Repair', status: 'published',
            authorId: 'user_privateInternalId', contentFormat: 'tiptap', contentJson: {}, categories: [] }
        const { default: BlogPage } = await import('@/app/blog/[blogSlug]/page')
        const html = renderToStaticMarkup(await BlogPage({ params: Promise.resolve({ blogSlug: state.post.slug }) }))
        const schema = JSON.parse(html.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1])
        expect(schema.author).toEqual({ '@type': 'Organization', name: 'Fix It Today®', url: 'https://www.fixitoday.com' })
        expect(schema.url).toBe('https://www.fixitoday.com/blog/3d-printer-repair')
        expect(html).not.toContain('user_privateInternalId')
    })

    it('does not advertise missing or unpublished articles through metadata', async () => {
        const { generateMetadata } = await import('@/app/blog/[blogSlug]/page')
        const metadata = await generateMetadata({ params: Promise.resolve({ blogSlug: 'draft-preview' }) })
        expect(state.postFilter).toEqual({ slug: 'draft-preview', ...statusQuery('published') })
        expect(metadata.robots).toEqual({ index: false, follow: false })
        expect(metadata).not.toHaveProperty('alternates.canonical')
    })
})
