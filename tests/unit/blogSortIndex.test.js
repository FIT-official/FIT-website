import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createIndex } = vi.hoisted(() => ({ createIndex: vi.fn() }))
vi.mock('@/models/BlogPost', () => ({ default: { collection: { createIndex } } }))

beforeEach(() => {
    vi.resetModules()
    createIndex.mockReset()
})

describe('blog date-sort index', () => {
    it('waits for one shared index build before simultaneous queries proceed', async () => {
        let finish
        createIndex.mockReturnValue(new Promise(resolve => { finish = resolve }))
        const { ensureBlogSortIndex, BLOG_SORT_INDEX } = await import('@/lib/blog/sortIndex')
        let ready = false
        const first = ensureBlogSortIndex().then(() => { ready = true })
        const second = ensureBlogSortIndex()
        await Promise.resolve()
        expect(ready).toBe(false)
        expect(createIndex).toHaveBeenCalledExactlyOnceWith(BLOG_SORT_INDEX, {
            name: 'blog_public_date_order',
        })
        finish('blog_public_date_order')
        await Promise.all([first, second])
        await ensureBlogSortIndex()
        expect(createIndex).toHaveBeenCalledTimes(1)
        expect(ready).toBe(true)
    })

    it('retries a failed index build on the next request', async () => {
        createIndex.mockRejectedValueOnce(new Error('connection interrupted'))
            .mockResolvedValueOnce('blog_public_date_order')
        const { ensureBlogSortIndex } = await import('@/lib/blog/sortIndex')
        await expect(ensureBlogSortIndex()).rejects.toThrow('connection interrupted')
        await expect(ensureBlogSortIndex()).resolves.toBeUndefined()
        expect(createIndex).toHaveBeenCalledTimes(2)
    })
})
