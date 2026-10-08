import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { blogDescription, blogJsonLd, blogMetadata } from '@/lib/seo/blog'
import { creatorMetadata, getPublicCreators } from '@/lib/seo/creators'
import { renderPublicMarkdown } from '@/lib/seo/publicContent'
import { statusQuery } from '@/lib/blog/status'
import { matchesBlogFilter, visibilityPosts } from '../helpers/blogFilter'

const state = vi.hoisted(() => ({ posts: [], post: null, total: 0, users: [], creator: null, products: [], viewer: null, admin: false, blogFilter: null, blogFields: '', skip: 0, userFilter: null, userProjection: null, countsFilter: null }))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn(async () => {}) }))
vi.mock('@/lib/blog/sortIndex', () => ({ BLOG_SORT_INDEX: { publishDate: -1, createdAt: -1 }, ensureBlogSortIndex: vi.fn(async () => {}) }))
vi.mock('@/models/BlogPost', () => ({ default: {
    findOne: filter => ({ lean: async () => state.post && matchesBlogFilter(state.post, filter) ? state.post : null }),
    countDocuments: async filter => { state.countFilter = filter; return state.total },
    find: filter => {
        state.blogFilter = filter
        const chain = { select: fields => { state.blogFields = fields; return chain }, sort: () => chain, skip: n => { state.skip = n; return chain }, limit: () => chain, hint: () => chain, lean: async () => state.posts.filter(post => matchesBlogFilter(post, filter)) }
        return chain
    },
} }))
vi.mock('@/models/User', () => ({ default: { find: (filter, projection) => { state.userFilter = filter; state.userProjection = projection; return { lean: async () => state.users } } } }))
vi.mock('@/models/Product', () => ({ default: {
    aggregate: async pipeline => { state.countsFilter = pipeline[0].$match; return [] },
    find: () => ({ sort: () => ({ lean: async () => state.products }) }),
} }))
vi.mock('@/lib/creatorPage/resolveCreator', async importOriginal => ({ ...await importOriginal(), resolveCreatorByIdOrName: async () => state.creator }))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: state.viewer }), clerkClient: async () => ({ users: { getUser: async () => null } }) }))
vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ user: null, isLoaded: true }) }))
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: async () => state.admin }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))
vi.mock('next/link', () => ({ default: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a> }))
vi.mock('next/image', () => ({ default: ({ src, alt }) =>
    // eslint-disable-next-line @next/next/no-img-element -- Next.js image test double.
    <img src={src} alt={alt} />,
}))
vi.mock('@/components/General/SubscribeForm', () => ({ default: () => null }))
vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }))
vi.mock('@/components/General/MarkdownRenderer', () => ({ default: () => null }))
vi.mock('@/components/Fabrication/FabricationServiceBlock', () => ({ default: () => null }))
vi.mock('@/components/CreatorPage/blocks/PrintServiceBlock', () => ({ default: () => null }))
vi.mock('@/components/ProductCard', () => ({ default: ({ product }) => <a href={`/products/${product.slug}`}>{product.name}</a> }))

beforeEach(() => {
    state.posts = []; state.post = null; state.total = 0; state.users = []; state.creator = null; state.products = []
    state.viewer = null; state.admin = false; state.blogFilter = null; state.blogFields = ''; state.skip = 0
    state.userFilter = null; state.userProjection = null; state.countsFilter = null
})

describe('public blog search content', () => {
    it('keeps unlisted, hidden and draft records out of blog HTML, schema and RSC props', async () => {
        state.posts = visibilityPosts
        const { default: Blog } = await import('@/app/blog/page')
        const page = await Blog({ searchParams: Promise.resolve({ q: 'confidential', tag: 'sensor', category: 'electronics', featured: 'true', sort: 'asc' }) })
        for (const output of [renderToStaticMarkup(page), JSON.stringify(page)]) {
            expect(output).toContain('public-guide')
            expect(output).toContain('legacy-guide')
            expect(output).not.toContain('confidential')
            for (const post of visibilityPosts.slice(2)) expect(output).not.toContain(post.slug)
        }
        expect(state.countFilter).toEqual(statusQuery('published'))
        expect(state.blogFilter).toEqual(statusQuery('published'))
    })
    it('serves an exact unlisted link signed out, with normal metadata but no preview or schema and a published-only related pool', async () => {
        state.post = { slug: 'link-guide', title: 'Link guide', status: 'unlisted', published: false, content: 'Link only body', categories: ['electronics'] }
        state.posts = visibilityPosts
        const { default: BlogPage, generateMetadata } = await import('@/app/blog/[blogSlug]/page')
        const params = Promise.resolve({ blogSlug: 'link-guide' })
        const page = await BlogPage({ params })
        const html = renderToStaticMarkup(page)
        expect(html).toContain('Link only body')
        expect(html).not.toContain('application/ld+json')
        expect(JSON.stringify(page)).toContain('"preview":false')
        expect(JSON.stringify(page)).not.toContain('confidential')
        const metadata = await generateMetadata({ params })
        expect(metadata.title).toBe('Link guide | Fix It Today')
        expect(metadata.description).toBe('Link only body')
        expect(metadata.robots).toEqual({ index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } })
        await expect(BlogPage({ params: Promise.resolve({ blogSlug: 'other-guide' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    }, 15000)
    it.each(['draft', 'hidden'])('rejects %s signed out even with a stale published flag', async status => {
        state.post = { slug: 'confidential', title: 'Confidential', status, published: true, content: 'Secret body' }
        const { default: BlogPage, generateMetadata } = await import('@/app/blog/[blogSlug]/page')
        const params = Promise.resolve({ blogSlug: 'confidential' })
        await expect(BlogPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
        expect((await generateMetadata({ params })).title).toContain('unavailable')
        state.viewer = 'admin'; state.admin = true
        expect(renderToStaticMarkup(await BlogPage({ params }))).toContain('Secret body')
    })

    it('renders article links before effects and provides crawlable pagination after 200 posts', async () => {
        state.posts = [{ _id: 'a', slug: 'printer-care', title: 'Printer care', published: true, excerpt: 'Keep your printer working.', tags: [], publishDate: '2026-09-01' }]
        state.total = 201
        const { default: Blog, generateMetadata } = await import('@/app/blog/page')
        const html = renderToStaticMarkup(await Blog())
        expect(html).toContain('href="/blog/printer-care"')
        expect(html).toContain('href="/blog?page=2"')
        expect(html).not.toContain('No blog posts yet.')
        expect(state.blogFilter).toEqual(statusQuery('published'))
        expect(state.blogFields).not.toMatch(/contentJson|\bcontent\b|authorId/)
        await Blog({ searchParams: Promise.resolve({ page: '2' }) })
        expect(state.skip).toBe(200)
        expect((await generateMetadata({ searchParams: Promise.resolve({ page: '2' }) })).alternates.canonical).toBe('https://www.fixitoday.com/blog?page=2')
    })

    it('derives future article metadata from the current edited body, with safe image and date fallbacks', () => {
        const post = { slug: 'future guide', title: 'Future guide', status: 'published', contentFormat: 'tiptap', content: 'REMOVED CONFIDENTIAL TIMELINE', contentJson: { type: 'doc', content: [{ type: 'text', text: 'Connect a sensor and record measurements.' }] }, publishDate: 'invalid', updatedAt: 'invalid' }
        const metadata = blogMetadata(post)
        expect(metadata.description).toBe('Connect a sensor and record measurements.')
        expect(metadata.twitter.images).toEqual(['https://www.fixitoday.com/fitogimage.png'])
        expect(metadata.alternates.canonical).toBe('https://www.fixitoday.com/blog/future%20guide')
        expect(JSON.stringify(metadata)).not.toContain('REMOVED')
        expect(blogJsonLd(post).datePublished).toBeUndefined()
        expect(blogDescription({ ...post, contentJson: null })).not.toContain('REMOVED')
        expect(blogMetadata({ ...post, status: 'hidden', published: true }).robots.index).toBe(false)
    })

    it('normalizes malformed pages and rejects huge or out-of-range pages instead of returning empty indexed archives', async () => {
        const { default: Blog, generateMetadata } = await import('@/app/blog/page')
        // The approved static workshop article remains listed even when Mongo has no posts.
        const html = renderToStaticMarkup(await Blog({ searchParams: Promise.resolve({ page: 'bad' }) }))
        expect(html).toContain('href="/blog/design-thinking-workshop"')
        expect(html).not.toContain('No blog posts yet.')
        expect((await generateMetadata({ searchParams: Promise.resolve({ page: 'Infinity' }) })).alternates.canonical).toBe('https://www.fixitoday.com/blog')
        for (const page of ['2', '999', String(Number.MAX_SAFE_INTEGER)]) {
            await expect(Blog({ searchParams: Promise.resolve({ page }) })).rejects.toThrow('NEXT_NOT_FOUND')
        }
    })

    it('preserves GitHub-style Markdown tables, strikethrough and links', () => {
        const html = renderPublicMarkdown('| Part | Qty |\n| --- | --- |\n| Sensor | 2 |\n\n~~Old~~ Updated\n\nhttps://www.fixitoday.com')
        expect(html).toContain('<table>')
        expect(html).toContain('<td>Sensor</td>')
        expect(html).toContain('<del>Old</del>')
        expect(html).toContain('href="https://www.fixitoday.com"')
    })

    it('renders legacy markdown and article links on the server without executable markup', async () => {
        state.post = { slug: 'guide', title: 'Guide', published: true, content: '## Sensor guide\n\nRead the [parts guide](/blog/parts).\n\n[bad](javascript:alert%281%29)\n\n<script>alert(1)</script>', categories: [] }
        const { default: BlogPage } = await import('@/app/blog/[blogSlug]/page')
        const html = renderToStaticMarkup(await BlogPage({ params: Promise.resolve({ blogSlug: 'guide' }) }))
        expect(html).toContain('<h2>Sensor guide</h2>')
        expect(html).toContain('href="/blog/parts"')
        expect(html).not.toContain('href="javascript:')
        expect(html).not.toContain('<script>alert')
        expect(state.blogFilter).toEqual(statusQuery('published'))
        expect(renderPublicMarkdown('[bad](jav&#x61;script:alert%281%29)')).not.toContain('href=')
    })

    it('rejects unpublished posts publicly while keeping admin previews noindex and without public schema', async () => {
        state.post = { slug: 'draft', title: 'Draft', status: 'draft', content: 'Preview body', categories: [] }
        const { default: BlogPage, generateMetadata } = await import('@/app/blog/[blogSlug]/page')
        await expect(BlogPage({ params: Promise.resolve({ blogSlug: 'draft' }) })).rejects.toThrow('NEXT_NOT_FOUND')
        state.viewer = 'admin'; state.admin = true
        const html = renderToStaticMarkup(await BlogPage({ params: Promise.resolve({ blogSlug: 'draft' }) }))
        expect(html).toContain('Preview body')
        expect(html).not.toContain('application/ld+json')
        expect((await generateMetadata({ params: Promise.resolve({ blogSlug: 'draft' }) })).robots.index).toBe(false)
    })
})

describe('public creator search content', () => {
    it('renders only public-safe directory cards on the server and links to following pages', async () => {
        state.users = Array.from({ length: 21 }, (_, i) => ({ userId: `user_${i}`, metadata: { displayName: `Maker ${String(i).padStart(2, '0')}` }, shop: { description: 'Custom parts' }, contact: 'PRIVATE CONTACT' }))
        const { default: CreatorsPage, generateMetadata } = await import('@/app/creators/page')
        const html = renderToStaticMarkup(await CreatorsPage())
        expect(html).toContain('href="/creators/Maker%2000"')
        expect(html).toContain('href="/creators?page=2"')
        expect(html).not.toContain('PRIVATE CONTACT')
        expect(state.userFilter['shop.published']).toEqual({ $ne: false })
        expect(JSON.stringify(state.userProjection)).not.toMatch(/contact|cart|orderHistory/)
        expect(state.countsFilter.slug.$nin.length).toBeGreaterThan(0)
        expect((await generateMetadata({ searchParams: Promise.resolve({ page: 2 }) })).alternates.canonical).toBe('https://www.fixitoday.com/creators?page=2')
        expect((await generateMetadata({ searchParams: Promise.resolve({ q: 'maker' }) })).robots.index).toBe(false)
        const secondPage = await getPublicCreators({ page: 2 })
        expect(secondPage.creators).toHaveLength(1)
    })

    it('derives a creator canonical from the public name even when reached through a user ID', () => {
        const metadata = creatorMetadata({ displayName: 'Ada Prints', userId: 'user_private', shop: { description: 'Custom **enclosures**.', logoImage: 'shops/ada/logo.png' } })
        expect(metadata.title).toBe('Ada Prints | Fix It Today')
        expect(metadata.description).toBe('Custom enclosures.')
        expect(metadata.alternates.canonical).toBe('https://www.fixitoday.com/creators/Ada%20Prints')
        expect(metadata.twitter.images[0]).toContain('shops%2Fada%2Flogo.png')
        expect(creatorMetadata({ displayName: 'Ada Prints', shop: { published: false } }).robots.index).toBe(false)
        expect(creatorMetadata(null).robots.index).toBe(false)
    })

    it('uses a clear FIT shop title in search and social previews without repeating the brand', () => {
        const metadata = creatorMetadata({ displayName: 'Fix It Today', shop: { published: true } })
        expect(metadata.title).toBe('Fix It Today Shop')
        expect(metadata.openGraph.title).toBe('Fix It Today Shop')
        expect(metadata.twitter.title).toBe('Fix It Today Shop')
        expect(metadata.alternates.canonical).toBe('https://www.fixitoday.com/creators/Fix%20It%20Today')
        expect(creatorMetadata({ displayName: 'Fix It Today', shop: { published: false } }).robots.index).toBe(false)
    })

    it('keeps the empty directory valid but rejects unavailable pagination', async () => {
        const { default: CreatorsPage, generateMetadata } = await import('@/app/creators/page')
        expect(renderToStaticMarkup(await CreatorsPage({ searchParams: Promise.resolve({ page: 'bad' }) }))).toContain('No creator pages yet.')
        expect((await generateMetadata({ searchParams: Promise.resolve({ page: 'Infinity' }) })).alternates.canonical).toBe('https://www.fixitoday.com/creators')
        for (const page of ['2', '999', String(Number.MAX_SAFE_INTEGER)]) {
            await expect(CreatorsPage({ searchParams: Promise.resolve({ page }) })).rejects.toThrow('NEXT_NOT_FOUND')
        }
    })

    it('returns not-found for missing and unpublished shops while keeping owner and admin previews without public schema', async () => {
        const { default: CreatorPage, generateMetadata } = await import('@/app/creators/[id]/page')
        await expect(CreatorPage({ params: Promise.resolve({ id: 'missing' }) })).rejects.toThrow('NEXT_NOT_FOUND')
        state.creator = { userId: 'user_ada', displayName: 'Ada Prints', shop: { published: false } }
        await expect(CreatorPage({ params: Promise.resolve({ id: 'Ada Prints' }) })).rejects.toThrow('NEXT_NOT_FOUND')
        expect((await generateMetadata({ params: Promise.resolve({ id: 'Ada Prints' }) })).robots.index).toBe(false)
        state.viewer = 'user_ada'
        expect(renderToStaticMarkup(await CreatorPage({ params: Promise.resolve({ id: 'Ada Prints' }) }))).not.toContain('application/ld+json')
        state.viewer = 'admin'; state.admin = true
        expect(renderToStaticMarkup(await CreatorPage({ params: Promise.resolve({ id: 'Ada Prints' }) }))).not.toContain('application/ld+json')
    })

    it('renders saved creator Markdown text and links before client effects', async () => {
        state.creator = { userId: 'user_ada', displayName: 'Ada Prints', shop: { blocks: [{ id: 'textblock1', type: 'text', settings: { heading: 'Our parts', body: 'We make **enclosures**. [View designs](/prints)' } }] } }
        const { default: CreatorPage } = await import('@/app/creators/[id]/page')
        const html = renderToStaticMarkup(await CreatorPage({ params: Promise.resolve({ id: 'Ada Prints' }) }))
        expect(html).toContain('<strong>enclosures</strong>')
        expect(html).toContain('href="/prints"')
        const schema = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1])
        expect(schema).toEqual({
            '@context': 'https://schema.org', '@type': 'CollectionPage',
            name: 'Ada Prints', description: "Browse Ada Prints's products and creator page on Fix It Today.",
            url: 'https://www.fixitoday.com/creators/Ada%20Prints',
        })
    })
})
