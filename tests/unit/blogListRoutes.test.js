// Lean blog list payloads: GET /api/admin/blog (paginated cards, ?all=1,
// ?slug= full post) and GET /api/blog (public, effectiveStatus semantics).
// Neither list may ever ship content/contentJson — imported posts carry up to
// 700KB of raw HTML each.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { statusQuery } from '@/lib/blog/status'

vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn(async () => { }) }))
vi.mock('@/lib/authenticate', () => ({ authenticate: vi.fn(async () => ({ userId: 'admin' })) }))
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: vi.fn(async () => true) }))
vi.mock('@/lib/posthog-server', () => ({ getPostHogClient: () => ({ capture: vi.fn() }) }))

const state = vi.hoisted(() => ({
    listDocs: [],
    statusDocs: [],
    single: null,
    total: 0,
    finds: [],
    findOneFilter: null,
}))

vi.mock('@/models/BlogPost', () => {
    const makeChain = () => {
        const rec = {}
        const c = {}
        for (const m of ['sort', 'skip', 'limit', 'select', 'hint']) {
            c[m] = (arg) => { rec[m] = arg; return c }
        }
        // The counts query selects exactly 'status published'; everything else
        // resolves the list docs.
        c.lean = async () => (rec.select === 'status published' ? state.statusDocs : state.listDocs)
        c.rec = rec
        return c
    }
    return {
        default: {
            collection: { createIndex: vi.fn(async () => 'blog_public_date_order') },
            find: (filter) => {
                const c = makeChain()
                state.finds.push({ filter, rec: c.rec })
                return c
            },
            findOne: (filter) => {
                state.findOneFilter = filter
                return { lean: async () => state.single }
            },
            countDocuments: async () => state.total,
        },
    }
})

const listFind = () => state.finds.find((f) => f.rec.select !== 'status published')

beforeEach(() => {
    state.listDocs = []
    state.statusDocs = []
    state.single = null
    state.total = 0
    state.finds = []
    state.findOneFilter = null
    vi.clearAllMocks()
})

describe('GET /api/admin/blog (paginated lean list)', () => {
    it('defaults to page 1 / limit 8, selects lean card fields only, returns counts', async () => {
        state.listDocs = [
            { _id: 'a', title: 'A', slug: 'a', status: 'published', published: true },
            { _id: 'b', title: 'B', slug: 'b', published: true }, // legacy: no status
        ]
        state.statusDocs = [
            { status: 'published', published: true },
            { published: true }, // legacy published
            { status: 'draft', published: false },
            { status: 'hidden', published: false },
        ]
        state.total = 10

        const { GET } = await import('@/app/api/admin/blog/route')
        const res = await GET(new Request('http://t/api/admin/blog'))
        const body = await res.json()

        const lf = listFind()
        expect(lf.filter).toEqual({})
        expect(lf.rec.skip).toBe(0)
        expect(lf.rec.limit).toBe(8)
        expect(lf.rec.select).not.toMatch(/\bcontent\b/)
        expect(lf.rec.select).not.toMatch(/contentJson/)
        expect(lf.rec.select).toMatch(/\btitle\b/)
        expect(lf.rec.select).toMatch(/\breadingTimeMinutes\b/)

        expect(body).toMatchObject({ ok: true, page: 1, totalPages: 2, total: 10 })
        expect(body.counts).toEqual({ all: 4, published: 2, draft: 1, hidden: 1 })
        // effectiveStatus mapping incl. legacy docs
        expect(body.posts.map((p) => p.status)).toEqual(['published', 'published'])
    })

    it('honours page and clamps limit to 50', async () => {
        state.total = 200
        const { GET } = await import('@/app/api/admin/blog/route')
        const body = await (await GET(new Request('http://t/api/admin/blog?page=3&limit=500'))).json()
        const lf = listFind()
        expect(lf.rec.limit).toBe(50)
        expect(lf.rec.skip).toBe(100)
        expect(body).toMatchObject({ page: 3, totalPages: 4, total: 200 })
    })

    it('treats bad page values as page 1', async () => {
        const { GET } = await import('@/app/api/admin/blog/route')
        await GET(new Request('http://t/api/admin/blog?page=0&limit=-2'))
        const lf = listFind()
        expect(lf.rec.skip).toBe(0)
        expect(lf.rec.limit).toBe(1)
    })

    it('passes a status filter through with effectiveStatus semantics', async () => {
        const { GET } = await import('@/app/api/admin/blog/route')
        await GET(new Request('http://t/api/admin/blog?status=published'))
        expect(listFind().filter).toEqual(statusQuery('published'))
    })

    it('?all=1 returns every post, still lean, without pagination', async () => {
        state.listDocs = [
            { _id: 'a', title: 'A', status: 'published', published: true },
            { _id: 'b', title: 'B', status: 'draft', published: false },
        ]
        const { GET } = await import('@/app/api/admin/blog/route')
        const body = await (await GET(new Request('http://t/api/admin/blog?all=1&status=published'))).json()
        const lf = listFind()
        expect(lf.filter).toEqual(statusQuery('published'))
        expect(lf.rec.select).not.toMatch(/\bcontent\b/)
        expect(lf.rec.skip).toBeUndefined()
        expect(body.ok).toBe(true)
        expect(body.posts).toHaveLength(2)
        expect(body.total).toBe(2)
        expect(body.page).toBeUndefined()
    })

    it('?slug= still returns the FULL single post', async () => {
        state.single = { _id: 'a', slug: 'a', title: 'A', content: 'x'.repeat(50), published: true }
        const { GET } = await import('@/app/api/admin/blog/route')
        const body = await (await GET(new Request('http://t/api/admin/blog?slug=a'))).json()
        expect(state.findOneFilter).toEqual({ slug: 'a' })
        expect(body.ok).toBe(true)
        expect(body.post.content).toBe('x'.repeat(50))
        expect(body.post.status).toBe('published') // effectiveStatus mapped
    })

    it('rejects non-admins', async () => {
        const { checkAdminPrivileges } = await import('@/lib/checkPrivileges')
        checkAdminPrivileges.mockResolvedValueOnce(false)
        const { GET } = await import('@/app/api/admin/blog/route')
        const res = await GET(new Request('http://t/api/admin/blog'))
        expect(res.status).toBe(403)
    })
})

describe('GET /api/blog (public lean list)', () => {
    it('filters by effectiveStatus semantics and never selects body content', async () => {
        state.listDocs = [{ _id: 'a', title: 'A', slug: 'a', featured: true }]
        const { GET } = await import('@/app/api/blog/route')
        const body = await (await GET()).json()
        const lf = listFind()
        expect(lf.filter).toEqual(statusQuery('published'))
        expect(lf.rec.select).not.toMatch(/\bcontent\b/)
        expect(lf.rec.select).not.toMatch(/contentJson/)
        expect(lf.rec.select).toMatch(/\bcreatedAt\b/) // FeaturedArticles sort fallback
        expect(lf.rec.hint).toEqual({ publishDate: -1, createdAt: -1 })
        expect(body).toEqual({ ok: true, posts: state.listDocs })
    })
})
