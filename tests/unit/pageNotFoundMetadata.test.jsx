import { expect, it, vi } from 'vitest'
import nextConfig from '../../next.config.mjs'
vi.mock('next/navigation', () => ({ notFound: () => { throw Error('NEXT_NOT_FOUND') } }))
vi.mock('@/lib/workshopPages', () => ({ workshopGroupPage: id => id === 'g1' ? { id, number: 1 } : null, assertWorkshopImagesReady: vi.fn() }))
vi.mock('@/components/Workshop/ReviewedGroupPage', () => ({ default: () => null }))
vi.mock('@/components/Workshop/GuestClassroom', () => ({ default: () => null }))
vi.mock('@/components/Workshop/Classroom', () => ({ default: () => null }))

it('blocks metadata streaming for browsers as well as crawlers before choosing a status', () => {
    for (const userAgent of ['', 'Mozilla/5.0', 'Googlebot', 'facebookexternalhit']) expect(nextConfig.htmlLimitedBots.test(userAgent)).toBe(true)
})
it.each([
    () => import('@/app/workshop/[group]/page'),
    () => import('@/app/workshop/[group]/classroom/page'),
    () => import('@/app/workshop/legacy/[group]/classroom/page'),
])('rejects a missing workshop group in metadata and page, and keeps a valid group', async load => {
    const { default: Page, generateMetadata } = await load()
    const missing = { params: Promise.resolve({ group: 'missing' }) }
    await expect(generateMetadata(missing)).rejects.toThrow('NEXT_NOT_FOUND')
    await expect(Page(missing)).rejects.toThrow('NEXT_NOT_FOUND')
    expect((await generateMetadata({ params: Promise.resolve({ group: 'g1' }) })).robots.index).toBe(false)
    expect(await Page({ params: Promise.resolve({ group: 'g1' }) })).toBeTruthy()
})
