import React from 'react'
import { readFileSync, readdirSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import matter from 'gray-matter'
import { matchesBlogFilter } from '../helpers/blogFilter'

const state = vi.hoisted(() => ({ posts: [], connect: vi.fn(), draftImport: vi.fn() }))
vi.mock('@/lib/db', () => ({ connectToDatabase: state.connect }))
vi.mock('@/lib/blog/drafts', () => { state.draftImport(); throw new Error('Public consumers must not import drafts') })
vi.mock('@/lib/blog/sortIndex', () => ({ BLOG_SORT_INDEX: {}, ensureBlogSortIndex: vi.fn() }))
vi.mock('@/models/BlogPost', () => ({ default: {
    countDocuments: async filter => state.posts.filter(post => matchesBlogFilter(post, filter)).length,
    find: filter => {
        const chain = { select: () => chain, sort: () => chain, skip: () => chain, limit: () => chain, hint: () => chain,
            lean: async () => state.posts.filter(post => matchesBlogFilter(post, filter)) }
        return chain
    },
    findOne: filter => ({ lean: async () => state.posts.find(post => matchesBlogFilter(post, filter)) || null }),
} }))
vi.mock('@/models/Product', () => ({ default: { find: () => ({ select: () => ({ lean: async () => [] }) }) } }))
vi.mock('@/models/User', () => ({ default: { find: () => ({ select: () => ({ lean: async () => [] }) }) } }))
vi.mock('@/models/Event', () => ({ default: { find: () => ({ select: () => ({ lean: async () => [] }) }) } }))
vi.mock('@/app/blog/Blog', () => ({ default: ({ initialPosts }) => <main>{initialPosts.map(post => <a key={post.slug} href={`/blog/${post.slug}`}>{post.title}</a>)}</main> }))

const drafts = readdirSync('content/blog-drafts').map(file => matter(readFileSync(`content/blog-drafts/${file}`, 'utf8')).data)
const clean = value => {
    expect(value).not.toMatch(/\/blog\/drafts|adminNote|ChatGPT|Cedrick/)
    for (const draft of drafts) expect(value).not.toContain(draft.slug)
    expect(state.draftImport).not.toHaveBeenCalled()
}
beforeEach(() => {
    vi.clearAllMocks()
    // Synthetic records exercise published-only filtering as well as file isolation.
    state.posts = [{ title: 'Public guide', slug: 'public-guide', status: 'published', tags: [] }, ...drafts]
})
describe('public discovery excludes file drafts', () => {
    it('keeps the blog listing free of every draft', async () => {
        const { default: Blog } = await import('@/app/blog/page')
        const html = renderToStaticMarkup(await Blog())
        expect(html).toContain('/blog/public-guide')
        clean(html)
    })
    it('keeps both public blog API endpoints free of every draft', async () => {
        const { GET } = await import('@/app/api/blog/route')
        clean(await (await GET()).text())
        const { GET: single } = await import('@/app/api/blog/[slug]/route')
        for (const draft of drafts) {
            const response = await single(new Request('http://localhost/api/blog'), { params: Promise.resolve({ slug: draft.slug }) })
            expect(response.status).toBe(404)
            clean(await response.text())
        }
    })
    it('excludes every draft from the sitemap', async () => {
        const { default: sitemap } = await import('@/app/sitemap')
        const result = JSON.stringify(await sitemap())
        expect(result).toContain('/blog/public-guide')
        clean(result)
    })
    it('excludes every draft from RSS', async () => {
        const { GET } = await import('@/app/blog/feed.xml/route')
        const response = await GET()
        expect(response.status).toBe(200)
        const result = await response.text()
        expect(result).toContain('/blog/public-guide')
        clean(result)
    })
    it('keeps the Google merchant feed independent of the drafts loader', async () => {
        const { GET } = await import('@/app/google-shopping.xml/route')
        const response = await GET()
        expect(response.status).toBe(200)
        clean(await response.text())
    })
})
