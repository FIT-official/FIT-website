import { beforeEach, describe, expect, it, vi } from 'vitest'
import { statusQuery } from '@/lib/blog/status'
import { buildPublicSitemap } from '@/lib/seo/sitemap'
import robots from '@/app/robots'
import { GET as legacySitemap } from '@/app/sitemap-0.xml/route'

const db = vi.hoisted(() => ({
    connect: vi.fn(), products: [], posts: [], creators: [], productFilter: null,
    postFilter: null, creatorFilter: null, productFields: '', postFields: '', creatorFields: '',
}))

vi.mock('@/lib/db', () => ({ connectToDatabase: db.connect }))
vi.mock('@/models/Product', () => ({ default: {
    find: vi.fn(filter => {
        db.productFilter = filter
        return { select: fields => {
            db.productFields = fields
            return { lean: async () => db.products }
        } }
    }),
} }))
vi.mock('@/models/BlogPost', () => ({ default: {
    find: vi.fn(filter => {
        db.postFilter = filter
        return { select: fields => {
            db.postFields = fields
            return { lean: async () => db.posts }
        } }
    }),
} }))
vi.mock('@/models/User', () => ({ default: {
    find: vi.fn(filter => {
        db.creatorFilter = filter
        return { select: fields => {
            db.creatorFields = fields
            return { lean: async () => db.creators }
        } }
    }),
} }))

beforeEach(() => {
    vi.clearAllMocks()
    db.connect.mockResolvedValue(undefined)
    db.products = []
    db.posts = []
    db.creators = []
    db.productFilter = db.postFilter = db.creatorFilter = null
    db.productFields = db.postFields = db.creatorFields = ''
})

describe('public sitemap URLs', () => {
    it('lists only public landing pages under the canonical www origin', () => {
        const entries = buildPublicSitemap()
        expect(entries.map(entry => entry.url)).toEqual([
            'https://www.fixitoday.com', 'https://www.fixitoday.com/about',
            'https://www.fixitoday.com/shop', 'https://www.fixitoday.com/prints',
            'https://www.fixitoday.com/creators', 'https://www.fixitoday.com/creators/join',
            'https://www.fixitoday.com/blog',
            'https://www.fixitoday.com/privacy', 'https://www.fixitoday.com/terms',
        ])
        expect(entries.every(entry => !('lastModified' in entry))).toBe(true)
    })

    it('lists published creator pages by display name and skips unpublished, nameless or id-named ones', () => {
        const entries = buildPublicSitemap({ creators: [
            { metadata: { displayName: 'Ada Prints' }, shop: { published: true } },
            { metadata: { displayName: 'Legacy Shop' }, shop: {} },
            { metadata: { displayName: 'Hidden' }, shop: { published: false } },
            { metadata: { displayName: '' }, shop: {} },
            { metadata: { displayName: 'user_abc123' }, shop: {} },
            { metadata: { displayName: 'No Shop' } },
        ] })
        expect(entries.filter(entry => /\/creators\/(?!join$)./.test(entry.url)).map(entry => entry.url)).toEqual([
            'https://www.fixitoday.com/creators/Ada%20Prints',
            'https://www.fixitoday.com/creators/Legacy%20Shop',
        ])
    })

    it('includes visible products even when out of stock, excluding hidden and moderated products', () => {
        const entries = buildPublicSitemap({ products: [
            { slug: 'pla', hidden: false, stock: 0 },
            { slug: 'hidden-filament', hidden: true },
            { slug: 'moderated', hidden: false, flaggedForModeration: true },
            { slug: 'visibility-unknown' },
        ] })
        expect(entries.filter(entry => entry.url.includes('/products/'))).toEqual([
            { url: 'https://www.fixitoday.com/products/pla' },
        ])
    })

    it('honours authoritative blog status and legacy published records without exposing drafts', () => {
        const entries = buildPublicSitemap({ posts: [
            { slug: '3d-printer-repair', status: 'published', published: false },
            { slug: 'legacy', published: true },
            { slug: 'hidden', status: 'hidden', published: true },
            { slug: 'draft', status: 'draft', published: true },
            { slug: 'scheduled', status: 'draft', scheduledFor: '2026-01-01' },
            { slug: 'unknown' },
        ] })
        expect(entries.filter(entry => entry.url.includes('/blog/')).map(entry => entry.url)).toEqual([
            'https://www.fixitoday.com/blog/3d-printer-repair',
            'https://www.fixitoday.com/blog/legacy',
        ])
    })

    it('uses real valid document timestamps and does not invent modification dates', () => {
        const entries = buildPublicSitemap({ posts: [
            { slug: 'updated', status: 'published', updatedAt: '2026-09-01T03:00:00Z', publishDate: '2026-08-01' },
            { slug: 'fallback', status: 'published', updatedAt: 'invalid', publishDate: '2026-08-01' },
            { slug: 'undated', status: 'published', updatedAt: 'invalid' },
        ] })
        expect(entries.find(entry => entry.url.endsWith('/updated')).lastModified.toISOString()).toBe('2026-09-01T03:00:00.000Z')
        expect(entries.find(entry => entry.url.endsWith('/fallback')).lastModified.toISOString()).toBe('2026-08-01T00:00:00.000Z')
        expect(entries.find(entry => entry.url.endsWith('/undated'))).not.toHaveProperty('lastModified')
    })

    it('omits invalid route slugs, safely encodes unicode, and deduplicates URLs', () => {
        const entries = buildPublicSitemap({ products: [
            ...['', '.', '..', '../admin', 'bad?preview=1', 'bad#hash', 'bad\\path', ' padded ', null]
                .map(slug => ({ slug, hidden: false })),
            { slug: '材料', hidden: false },
            { slug: 'pla', hidden: false },
            { slug: 'pla', hidden: false },
        ] })
        expect(entries.filter(entry => entry.url.includes('/products/')).map(entry => entry.url)).toEqual([
            'https://www.fixitoday.com/products/%E6%9D%90%E6%96%99',
            'https://www.fixitoday.com/products/pla',
        ])
    })
})

describe('sitemap database route', () => {
    it('queries current public records with minimal fields and the existing publication semantics', async () => {
        db.products = [{ slug: 'pla', hidden: false }]
        db.posts = [{ slug: '3d-printer-repair', status: 'published' }]
        db.creators = [{ metadata: { displayName: 'Ada Prints' }, shop: { published: true } }]
        const { default: sitemap, dynamic } = await import('@/app/sitemap')
        const entries = await sitemap()
        expect(dynamic).toBe('force-dynamic')
        expect(db.connect).toHaveBeenCalledOnce()
        expect(db.productFilter).toEqual({ hidden: false, flaggedForModeration: { $ne: true } })
        expect(db.postFilter).toEqual(statusQuery('published'))
        expect(db.creatorFilter).toEqual({
            shop: { $exists: true, $ne: null },
            'shop.published': { $ne: false },
            'metadata.displayName': { $exists: true, $type: 'string', $ne: '' },
        })
        expect(db.productFields).not.toMatch(/description|paidAssets|creatorUserId/)
        expect(db.postFields).not.toMatch(/content|authorId/)
        expect(db.creatorFields).not.toMatch(/orderHistory|cart|contact/)
        expect(entries.some(entry => entry.url.endsWith('/products/pla'))).toBe(true)
        expect(entries.some(entry => entry.url.endsWith('/blog/3d-printer-repair'))).toBe(true)
        expect(entries.some(entry => entry.url.endsWith('/creators/Ada%20Prints'))).toBe(true)
    })

    it('does not publish a successful empty sitemap when the database is unavailable', async () => {
        db.connect.mockRejectedValueOnce(new Error('database unavailable'))
        const { default: sitemap } = await import('@/app/sitemap')
        await expect(sitemap()).rejects.toThrow('database unavailable')
    })
})

describe('crawler routes', () => {
    it('excludes private flows while leaving public pages and product images crawlable', () => {
        const result = robots()
        expect(result.sitemap).toBe('https://www.fixitoday.com/sitemap.xml')
        expect(result.rules.allow).toContain('/api/proxy')
        for (const path of ['/admin', '/account', '/dashboard', '/editor', '/checkout', '/cart', '/api/']) {
            expect(result.rules.disallow).toContain(path)
        }
        expect(result.rules.disallow).not.toContain('/shop')
        expect(result.rules.disallow).not.toContain('/products')
        expect(result.rules.disallow).not.toContain('/blog')
    })

    it('permanently redirects the old generated child sitemap to the dynamic sitemap', () => {
        const response = legacySitemap()
        expect(response.status).toBe(308)
        expect(response.headers.get('location')).toBe('https://www.fixitoday.com/sitemap.xml')
    })
})
