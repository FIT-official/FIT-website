// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HeadObjectCommand } from '@aws-sdk/client-s3'

const mocks = vi.hoisted(() => ({ send: vi.fn(), block: vi.fn(), seed: vi.fn() }))
vi.mock('@/lib/s3', () => ({ s3: { send: mocks.send } }))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/models/ContentBlock', () => ({ default: { findOne: () => ({ lean: mocks.block }) } }))
vi.mock('@/models/BlogPost', () => ({ default: {} }))
vi.mock('@/lib/mdx', () => ({ getContentByPath: mocks.seed }))

let filterShopBanner, GET
beforeEach(async () => {
    vi.resetModules()
    vi.resetAllMocks()
    vi.stubEnv('NEXT_PUBLIC_S3_BUCKET_NAME', 'banner-test-bucket')
    vi.useFakeTimers()
    ;({ filterShopBanner } = await import('@/lib/shopBanner'))
    ;({ GET } = await import('@/app/api/content/route'))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
const data = image => ({ frontmatter: { bannerImage: image, title: 'Shop' }, content: 'Text' })
const missing = () => Object.assign(new Error('Missing'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } })

describe('shop banner availability', () => {
    it.each(['override', 'seed'])('omits a missing S3 image from the public content response (%s)', async source => {
        const original = data('admin/uploads/shop/banner/missing.jpg')
        mocks.block.mockResolvedValue(source === 'override' ? original : null)
        mocks.seed.mockReturnValue(original)
        mocks.send.mockRejectedValue(missing())
        const response = await GET(new Request('https://local.invalid/api/content?path=shop/banner'))
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual(data(''))
        expect(original.frontmatter.bannerImage).toBe('admin/uploads/shop/banner/missing.jpg')
        const [command, options] = mocks.send.mock.calls[0]
        expect(command).toBeInstanceOf(HeadObjectCommand)
        expect(command.input).toEqual({ Bucket: 'banner-test-bucket', Key: original.frontmatter.bannerImage })
        expect(options.abortSignal).toBeInstanceOf(AbortSignal)
    })
    it.each([true, false])('caches concurrent and repeated checks for ten minutes (exists=%s)', async exists => {
        mocks.send.mockImplementation(async () => { if (!exists) throw missing(); return {} })
        const original = data('admin/uploads/shop/banner/a.jpg')
        const expected = exists ? original : data('')
        expect(await Promise.all([filterShopBanner('shop/banner', original), filterShopBanner('shop/banner', original)]))
            .toEqual([expected, expected])
        vi.advanceTimersByTime(599999)
        expect(await filterShopBanner('shop/banner', original)).toEqual(expected)
        expect(mocks.send).toHaveBeenCalledTimes(1)
        vi.advanceTimersByTime(1)
        await filterShopBanner('shop/banner', original)
        expect(mocks.send).toHaveBeenCalledTimes(2)
    })
    it.each([
        { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } },
        { name: 'ServiceUnavailable', $metadata: { httpStatusCode: 503 } },
        { name: 'NoSuchBucket', $metadata: { httpStatusCode: 404 } },
        { name: 'TimeoutError' },
    ])('keeps the banner when checking fails with $name', async error => {
        mocks.send.mockRejectedValue(error)
        const original = data('admin/uploads/shop/banner/a.jpg')
        expect(await filterShopBanner('shop/banner', original)).toBe(original)
    })
    it('checks proxy keys and rechecks a changed key without waiting for the old cache', async () => {
        mocks.send.mockRejectedValueOnce(missing()).mockResolvedValue({})
        expect(await filterShopBanner('shop/banner', data('/api/proxy?key=admin%2Fa.jpg'))).toEqual(data(''))
        const replacement = data('admin/b.jpg')
        expect(await filterShopBanner('shop/banner', replacement)).toBe(replacement)
        expect(mocks.send.mock.calls.map(([command]) => command.input.Key)).toEqual(['admin/a.jpg', 'admin/b.jpg'])
    })
    it('leaves other content, remote URLs and local assets alone', async () => {
        for (const image of ['', '/banner.jpg', 'https://cdn.example/banner.jpg']) {
            const original = data(image)
            expect(await filterShopBanner('shop/banner', original)).toBe(original)
        }
        const other = data('admin/banner.jpg')
        expect(await filterShopBanner('home/hero-banner', other)).toBe(other)
        expect(mocks.send).not.toHaveBeenCalled()
    })
})
