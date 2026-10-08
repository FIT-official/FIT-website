import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn() }))
import { scopedWorkshopDatabase, workshopCollectionPrefix } from '@/lib/workshopDatabase'
describe('server-controlled preview collection isolation', () => {
    it('keeps production and local collection names unchanged even with an supplied preview URL', () => {
        for (const env of [{}, { VERCEL_ENV: 'production', VERCEL_URL: 'example.vercel.app' }]) {
            const collection = vi.fn(); scopedWorkshopDatabase({ collection }, env).collection('workshopLessons')
            expect(collection).toHaveBeenCalledWith('workshopLessons', undefined); expect(workshopCollectionPrefix(env)).toBe('')
        }
    })
    it('isolates every supported collection consistently for each preview deployment', () => {
        const a = { VERCEL_ENV: 'preview', VERCEL_URL: 'fit-one.vercel.app' }, b = { ...a, VERCEL_URL: 'fit-two.vercel.app' }, collection = vi.fn()
        const prefix = workshopCollectionPrefix(a); expect(prefix).toMatch(/^workshopPreview_[a-f0-9]{16}_$/); expect(workshopCollectionPrefix(b)).not.toBe(prefix)
        for (const name of ['workshopAccounts', 'workshopSessions', 'workshopLessons', 'workshopRateLimits', 'workshopClassDetails', 'workshopDrafts', 'workshopTinkercadPools']) {
            scopedWorkshopDatabase({ collection }, a).collection(name); expect(collection).toHaveBeenLastCalledWith(prefix + name, undefined)
        }
        expect(() => scopedWorkshopDatabase({ collection }, a).collection('users')).toThrow('Unknown workshop collection')
    })
    it('fails closed for missing or invalid preview identity instead of touching the real lesson', () => {
        for (const url of ['', 'https://example.vercel.app', '../workshopLessons', 'example.com']) expect(() => workshopCollectionPrefix({ VERCEL_ENV: 'preview', VERCEL_URL: url })).toThrow('Preview deployment identity')
    })
})
