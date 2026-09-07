import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ ready: false, hints: [], sorts: [] }))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn(async () => {}) }))
vi.mock('@/lib/blog/sortIndex', () => ({
    BLOG_SORT_INDEX: { publishDate: -1, createdAt: -1 },
    ensureBlogSortIndex: vi.fn(async () => { state.ready = true }),
}))
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: vi.fn() }))
vi.mock('@/lib/blog/renderTiptap', () => ({ renderTiptapHtml: () => '<p>Guide</p>' }))
vi.mock('@/app/blog/[blogSlug]/BlogPageClient', () => ({ default: () => null }))
vi.mock('@/models/BlogPost', () => ({
    default: {
        findOne: () => ({ lean: async () => ({
            slug: 'guide', title: 'Guide', status: 'published', published: true,
            contentFormat: 'tiptap', contentJson: {}, categories: [],
        }) }),
        find: () => {
            if (!state.ready) throw new Error('Query started before index was ready')
            const chain = {
                select: () => chain,
                sort: value => { state.sorts.push(value); return chain },
                hint: value => { state.hints.push(value); return chain },
                limit: () => chain,
                lean: async () => [],
            }
            return chain
        },
    },
}))

beforeEach(() => {
    state.ready = false
    state.hints = []
    state.sorts = []
})

describe('public blog sort consumers', () => {
    it('renders an article only after its related-post query can use the date index', async () => {
        const { default: BlogPage } = await import('@/app/blog/[blogSlug]/page')
        expect(await BlogPage({ params: Promise.resolve({ blogSlug: 'guide' }) })).toBeTruthy()
        expect(state.hints).toEqual([{ publishDate: -1, createdAt: -1 }])
        expect(state.sorts).toEqual([{ publishDate: -1 }])
    })

    it('uses the same index for the RSS feed', async () => {
        const { GET } = await import('@/app/blog/feed.xml/route')
        const response = await GET()
        expect(response.status).toBe(200)
        expect(await response.text()).toContain('<rss')
        expect(state.hints).toEqual([{ publishDate: -1, createdAt: -1 }])
    })
})
