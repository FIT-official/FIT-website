// GET /api/creators — public creator directory: published shops only,
// public-safe projection, product counts, escaped name search, 20/page,
// sorted by product count then name.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
    users: [],
    findArgs: null,
    aggregateArgs: null,
    counts: [],
}))

vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn(async () => { }) }))
vi.mock('@/models/User', () => ({
    default: {
        findOne: vi.fn(),
        find: vi.fn((filter, projection) => {
            state.findArgs = { filter, projection }
            return { lean: async () => state.users }
        }),
    },
}))
vi.mock('@/models/Product', () => ({
    default: {
        aggregate: vi.fn(async (pipeline) => {
            state.aggregateArgs = pipeline
            return state.counts
        }),
    },
}))

const get = async (qs = '') => {
    const { GET } = await import('@/app/api/creators/route')
    const res = await GET(new Request(`http://t/api/creators${qs}`))
    return { res, body: await res.json() }
}

const user = (userId, displayName, shop = {}) => ({ userId, metadata: { displayName }, shop })

beforeEach(() => {
    state.users = []
    state.findArgs = null
    state.aggregateArgs = null
    state.counts = []
    vi.clearAllMocks()
})

describe('GET /api/creators', () => {
    it('filters to users with a shop that is not unpublished and a display name, public projection only', async () => {
        await get()
        expect(state.findArgs.filter).toMatchObject({
            shop: { $exists: true, $ne: null },
            'shop.published': { $ne: false },
        })
        expect(state.findArgs.filter['metadata.displayName']).toMatchObject({ $exists: true, $ne: '' })
        expect(Object.keys(state.findArgs.projection).sort()).toEqual([
            '_id', 'metadata.displayName', 'shop.accentColor', 'shop.bannerImage',
            'shop.description', 'shop.logoImage', 'userId',
        ])
    })

    it('escapes the search query before using it as a regex', async () => {
        await get('?q=a.b%2B(c')
        expect(state.findArgs.filter['metadata.displayName']).toMatchObject({
            $regex: 'a\\.b\\+\\(c',
            $options: 'i',
        })
    })

    it('counts visible products per creator and sorts by count then name', async () => {
        state.users = [
            user('user_b', 'Bravo', { logoImage: 'shops/user_b/logo.jpg', description: 'x'.repeat(200), accentColor: '#f59e0b' }),
            user('user_a', 'Alpha'),
            user('user_c', 'Charlie'),
        ]
        state.counts = [{ _id: 'user_a', count: 3 }, { _id: 'user_c', count: 3 }]
        const { res, body } = await get()
        expect(res.status).toBe(200)
        expect(state.aggregateArgs[0].$match).toEqual({
            creatorUserId: { $in: ['user_b', 'user_a', 'user_c'] },
            hidden: { $ne: true },
            flaggedForModeration: { $ne: true },
        })
        expect(body.creators.map((c) => [c.displayName, c.productCount])).toEqual([
            ['Alpha', 3], ['Charlie', 3], ['Bravo', 0],
        ])
        const bravo = body.creators[2]
        expect(bravo).toMatchObject({
            userId: 'user_b', slug: 'Bravo', logoImage: 'shops/user_b/logo.jpg', accentColor: '#f59e0b',
        })
        expect(bravo.description).toHaveLength(160)
        expect(bravo).not.toHaveProperty('orderHistory')
        expect(body).toMatchObject({ page: 1, pageSize: 20, total: 3, hasMore: false })
    })

    it('pages 20 at a time', async () => {
        state.users = Array.from({ length: 45 }, (_, i) => user(`user_${i}`, `Maker ${String(i).padStart(2, '0')}`))
        const first = await get()
        expect(first.body.creators).toHaveLength(20)
        expect(first.body.hasMore).toBe(true)
        const third = await get('?page=3')
        expect(third.body.creators).toHaveLength(5)
        expect(third.body.hasMore).toBe(false)
        expect(third.body.creators[0].displayName).toBe('Maker 40')
        const bad = await get('?page=-4')
        expect(bad.body.page).toBe(1)
    })

    it('uses the userId as slug when the display name is not usable', async () => {
        state.users = [user('user_z', 'user_z')]
        const { body } = await get()
        expect(body.creators[0]).toMatchObject({ displayName: 'Unnamed Store', slug: 'user_z' })
    })
})
