// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ creator: vi.fn(), metadata: vi.fn(), entitlements: vi.fn(), shape: vi.fn() }))
vi.mock('@/lib/creatorPage/resolveCreator', () => ({ resolveCreatorByIdOrName: mocks.creator }))
vi.mock('@/lib/creatorEntitlements', () => ({ getCreatorEntitlements: mocks.entitlements }))
vi.mock('@/models/CreatorFabricationService', () => ({ default: { findOne: () => ({ lean: mocks.metadata }) } }))
vi.mock('@/models/CreatorFabricationOffer', () => ({ default: { exists: vi.fn(async () => false) } }))
vi.mock('@/lib/fabrication/serverAssets', () => ({ shapeFabricationCatalog: mocks.shape }))
import { GET } from '@/app/api/creators/[id]/fabrication-service/route'
import { createFabricationOffer } from '@/lib/fabrication/catalog'

const request = () => GET(new Request('https://fit.example/api/creators/shop/fabrication-service'), { params: Promise.resolve({ id: 'shop' }) })
const configured = () => ({ catalog: { enabled: true, offers: [{ ...createFabricationOffer('custom'), enabled: true }] } })
beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    mocks.creator.mockResolvedValue({ userId: 'provider', displayName: 'Maker' })
    mocks.entitlements.mockResolvedValue({ status: 'active', planId: 'pro' })
    mocks.shape.mockImplementation(async catalog => catalog)
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('public fabrication availability', () => {
    it.each([null, { enabled: false }, { catalog: { enabled: false, offers: [] } }])('returns 200 for an absent or disabled service despite unavailable infrastructure (%j)', async metadata => {
        mocks.metadata.mockResolvedValue(metadata)
        mocks.entitlements.mockRejectedValue(new Error('Subscription provider unavailable'))
        const response = await request()
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ enabled: false })
        expect(mocks.entitlements).not.toHaveBeenCalled()
        expect(mocks.shape).not.toHaveBeenCalled()
    })
    it('keeps a rate-limit infrastructure failure visible for a configured service', async () => {
        mocks.metadata.mockResolvedValue(configured())
        const response = await request()
        expect(response.status).toBe(503)
        expect((await response.json()).code).toBe('rate_limit_unavailable')
        expect(mocks.entitlements).not.toHaveBeenCalled()
    })
    it('keeps database failures visible instead of treating them as absent services', async () => {
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
        mocks.metadata.mockRejectedValue(new Error('Database unavailable'))
        const response = await request()
        expect(response.status).toBe(503)
        expect((await response.json()).code).toBe('service_unavailable')
        expect(errorLog).toHaveBeenCalledOnce()
    })
    it('preserves subscription failures for configured services', async () => {
        vi.stubEnv('NODE_ENV', 'test')
        mocks.metadata.mockResolvedValue(configured())
        mocks.entitlements.mockResolvedValue({ status: 'unavailable' })
        const response = await request()
        expect(response.status).toBe(503)
        expect((await response.json()).code).toBe('subscription_unavailable')
    })
    it('returns a configured service only after paid access is verified', async () => {
        vi.stubEnv('NODE_ENV', 'test')
        mocks.metadata.mockResolvedValue(configured())
        const response = await request()
        expect(response.status).toBe(200)
        expect((await response.json()).enabled).toBe(true)
        expect(mocks.entitlements).toHaveBeenCalledWith('provider')
        mocks.entitlements.mockResolvedValue({ status: 'active', planId: 'free' })
        expect(await (await request()).json()).toEqual({ enabled: false })
    })
})
