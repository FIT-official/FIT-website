// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/models/Product', () => ({ default: { find: vi.fn() } }))
vi.mock('@/models/BlogPost', () => ({ default: { find: vi.fn() } }))
import Product from '@/models/Product'
import BlogPost from '@/models/BlogPost'
import { connectToDatabase } from '@/lib/db'
import { getHomeShopPicks, getHomeGuides } from '@/lib/home/data'
import { statusQuery } from '@/lib/blog/status'

const chain = rows => ({ select: vi.fn().mockReturnThis(), sort: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), maxTimeMS: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(rows) })
beforeEach(() => { vi.resetAllMocks(); connectToDatabase.mockResolvedValue({}) })
it('reads public FIT shop products with a bounded lean query', async () => {
    const query = chain([{ name: 'Test spool', slug: 'test-spool', productType: 'shop', images: ['/images/spool.jpg'] }])
    Product.find.mockReturnValue(query)
    expect(await getHomeShopPicks()).toHaveLength(1)
    expect(Product.find).toHaveBeenCalledWith({ productType: 'shop', listing: 'fit', hidden: false, flaggedForModeration: { $ne: true } })
    expect(query.limit).toHaveBeenCalledWith(200)
    expect(query.maxTimeMS).toHaveBeenCalledWith(1500)
})
it('reads only the three newest published posts without creating indexes', async () => {
    const query = chain([])
    BlogPost.find.mockReturnValue(query)
    expect(await getHomeGuides()).toEqual([])
    expect(BlogPost.find).toHaveBeenCalledWith(statusQuery('published'))
    expect(query.sort).toHaveBeenCalledWith({ publishDate: -1, createdAt: -1 })
    expect(query.limit).toHaveBeenCalledWith(3)
})
it('hides dynamic sections after a database outage', async () => {
    connectToDatabase.mockRejectedValue(Error('offline'))
    expect(await getHomeShopPicks()).toEqual([])
    expect(await getHomeGuides()).toEqual([])
})
