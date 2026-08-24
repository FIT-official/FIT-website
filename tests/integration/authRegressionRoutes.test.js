// Regression: an unauthenticated caller must get a clean 401 from routes that
// call authenticate() — never reach the database with userId === undefined.
// Exercises the two call sites flagged by the security audit:
// app/api/asset/storage/route.js and app/api/checkout/breakdown/route.js.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }))

vi.mock('@clerk/nextjs/server', () => ({ auth }))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn(async () => {}) }))

const dptFind = vi.fn()
vi.mock('@/models/DigitalProductTransaction', () => ({
    default: { find: dptFind },
}))

const userFindOne = vi.fn()
vi.mock('@/models/User', () => ({ default: { findOne: userFindOne } }))
vi.mock('@/models/Event', () => ({ default: { find: vi.fn(async () => []) } }))
vi.mock('@/models/CustomPrintRequest', () => ({ default: { findOne: vi.fn() } }))
vi.mock('@/lib/customPrintDisplayPrice', () => ({ customPrintChargeBreakdown: vi.fn() }))
vi.mock('../../app/api/checkout/calculateBreakdown', () => ({ calculateCartItemBreakdown: vi.fn() }))

beforeEach(() => {
    vi.clearAllMocks()
    auth.mockResolvedValue({ userId: null })
})

describe('GET /api/asset/storage — unauthenticated', () => {
    it('returns 401 without querying the database', async () => {
        const { GET } = await import('@/app/api/asset/storage/route')

        const res = await GET(new Request('https://x/api/asset/storage'))

        expect(res.status).toBe(401)
        expect(dptFind).not.toHaveBeenCalled()
    })
})

describe('GET /api/checkout/breakdown — unauthenticated', () => {
    it('returns 401 without querying the database', async () => {
        const { GET } = await import('@/app/api/checkout/breakdown/route')

        const res = await GET(new Request('https://x/api/checkout/breakdown'))

        expect(res.status).toBe(401)
        expect(userFindOne).not.toHaveBeenCalled()
    })
})
