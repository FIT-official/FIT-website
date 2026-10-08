import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { matchesBlogFilter, visibilityPosts } from '../helpers/blogFilter'
import { statusQuery } from '@/lib/blog/status'

const state = vi.hoisted(() => ({ finds: [], docs: [], content: null, saved: [] }))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn(async () => {}) }))
vi.mock('@/lib/blog/sortIndex', () => ({ BLOG_SORT_INDEX: {}, ensureBlogSortIndex: vi.fn(async () => {}) }))
vi.mock('@/models/BlogPost', () => ({ default: {
    find: filter => {
        state.finds.push(filter)
        const chain = { select: () => chain, sort: () => chain, hint: () => chain, limit: () => chain,
            lean: async () => state.docs.filter(doc => matchesBlogFilter(doc, filter)),
            then: (resolve, reject) => Promise.resolve(state.docs.filter(doc => matchesBlogFilter(doc, filter))).then(resolve, reject),
        }
        return chain
    },
} }))
vi.mock('@/models/ContentBlock', () => ({ default: { findOne: () => ({ lean: async () => state.content }) } }))
vi.mock('@/lib/mdx', () => ({ getContentByPath: () => state.content }))
vi.mock('next/image', () => ({ default: ({ src, alt }) =>
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />,
}))
vi.mock('next/link', () => ({ default: ({ href, children }) => <a href={href}>{children}</a> }))

beforeEach(() => {
    cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals()
    state.finds = []; state.docs = visibilityPosts; state.content = null; state.saved = []
})

describe('blog visibility consumers', () => {
    it('RSS excludes unlisted, hidden and draft posts including inconsistent published flags', async () => {
        const { GET } = await import('@/app/blog/feed.xml/route')
        const response = await GET()
        const xml = await response.text()
        expect(response.status).toBe(200)
        expect(xml).toContain('public-guide')
        expect(xml).toContain('legacy-guide')
        expect(xml).not.toContain('confidential')
        for (const post of visibilityPosts.slice(2)) expect(xml).not.toContain(post.slug)
        expect(state.finds).toEqual([statusQuery('published')])
    })
    it.each(['override', 'seed'])('removes stale nonpublic navigation picks from the public content API (%s)', async source => {
        const content = { frontmatter: { featuredPosts: visibilityPosts.map(post => ({ slug: post.slug, title: post.title })) } }
        state.content = content
        if (source === 'seed') {
            const ContentBlock = (await import('@/models/ContentBlock')).default
            vi.spyOn(ContentBlock, 'findOne').mockReturnValueOnce({ lean: async () => null })
        }
        const { GET } = await import('@/app/api/content/route')
        const response = await GET(new Request('http://t/api/content?path=navigation/mega-menu'))
        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.frontmatter.featuredPosts.map(post => post.slug)).toEqual(['public-guide', 'legacy-guide'])
        expect(JSON.stringify(data)).not.toContain('confidential')
        expect(state.finds[0]).toEqual({ slug: { $in: visibilityPosts.map(post => post.slug) }, ...statusQuery('published') })
    })
    it('home widgets receive only the public API result', async () => {
        const { GET } = await import('@/app/api/blog/route')
        vi.stubGlobal('fetch', vi.fn(async url => {
            expect(url).toBe('/api/blog')
            return GET(new Request(`http://t${url}`))
        }))
        const { default: FeaturedArticles } = await import('@/components/Home/FeaturedArticles')
        render(<FeaturedArticles />)
        expect(await screen.findByText('Public guide')).toBeTruthy()
        expect(screen.getByText('Legacy guide')).toBeTruthy()
        expect(document.body.textContent).not.toContain('confidential')
    })
    it('the scheduler publishes only due drafts and never touches unlisted or hidden posts', async () => {
        const now = new Date(Date.now() - 60000)
        state.docs = visibilityPosts.map(post => ({ ...post, scheduledFor: now, save: async function () { state.saved.push(this._id) } }))
        vi.stubEnv('CRON_SECRET', 'test-only-secret')
        const { GET } = await import('@/app/api/cron/blog-scheduled/route')
        const response = await GET(new Request('http://t/api/cron/blog-scheduled', { headers: { authorization: 'Bearer test-only-secret' } }))
        expect(response.status).toBe(200)
        expect(state.saved).toEqual(['draft-false', 'draft-true'])
        expect(state.finds[0].$or).toEqual(statusQuery('draft').$or)
    })
})
