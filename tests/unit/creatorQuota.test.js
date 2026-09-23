import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ counters: new Map(), existingProducts: 0, existingRequests: 0, existingFabrication: 0, isAdmin: false, limit: 3 }))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/lib/creatorEntitlements', () => ({ getCreatorEntitlements: vi.fn(async () => ({
  isAdmin: state.isAdmin, plan: { limits: { products: state.limit, monthlyPrintRequests: 10 } },
})) }))
vi.mock('@/models/Product', () => ({ default: { countDocuments: vi.fn(async () => state.existingProducts) } }))
vi.mock('@/models/CustomPrintRequest', () => ({ default: { countDocuments: vi.fn(async () => state.existingRequests) } }))
vi.mock('@/models/FabricationRequest', () => ({ default: { countDocuments: vi.fn(async () => state.existingFabrication) } }))
vi.mock('@/models/CreatorQuota', () => ({ default: {
  findById: vi.fn((id) => ({ lean: async () => state.counters.has(id) ? { used: state.counters.get(id) } : null })),
  updateOne: vi.fn(async (filter, update) => {
    if (update.$setOnInsert && !state.counters.has(filter._id)) state.counters.set(filter._id, update.$setOnInsert.used)
    if (update.$inc && state.counters.get(filter._id) > 0) state.counters.set(filter._id, state.counters.get(filter._id) + update.$inc.used)
  }),
  findOneAndUpdate: vi.fn(async (filter, update) => {
    const used = state.counters.get(filter._id)
    if (!(used < filter.used.$lt)) return null
    state.counters.set(filter._id, used + update.$inc.used)
    return { used: used + update.$inc.used }
  }),
} }))

import { reserveCreatorQuota, releaseProductQuota, quotaPeriod } from '@/lib/creatorQuota'
import CustomPrintRequest from '@/models/CustomPrintRequest'

beforeEach(() => { state.counters.clear(); state.existingProducts = 0; state.existingRequests = 0; state.existingFabrication = 0; state.isAdmin = false; state.limit = 3; vi.clearAllMocks() })

describe('creator plan allowances', () => {
  it('reserves only the remaining slots when requests arrive concurrently', async () => {
    state.existingProducts = 2
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => reserveCreatorQuota('u1', 'products')))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(state.counters.get('u1:products')).toBe(3)
  })
  it('releases a failed creation only once and frees a slot after deletion', async () => {
    const reservation = await reserveCreatorQuota('u1', 'products')
    await reservation.release(); await reservation.release()
    expect(state.counters.get('u1:products')).toBe(0)
    await reserveCreatorQuota('u1', 'products')
    await releaseProductQuota('u1')
    expect(state.counters.get('u1:products')).toBe(0)
  })
  it('counts existing requests and starts a separate calendar month allowance', async () => {
    state.existingRequests = 10
    await expect(reserveCreatorQuota('u1', 'monthlyPrintRequests', new Date('2026-09-30T23:59:00Z'))).rejects.toThrow(/10 print requests/)
    state.existingRequests = 0
    await reserveCreatorQuota('u1', 'monthlyPrintRequests', new Date('2026-10-01T00:00:00Z'))
    expect(state.counters.get('u1:requests:2026-10')).toBe(1)
    expect(CustomPrintRequest.countDocuments).toHaveBeenLastCalledWith({ creatorUserId: 'u1', createdAt: { $gte: new Date('2026-10-01T00:00:00Z'), $lt: new Date('2026-11-01T00:00:00Z') } })
    expect(quotaPeriod(new Date('2026-12-31T00:00:00Z')).end.toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })
  it('keeps stores separate and grants admins unlimited capacity', async () => {
    await reserveCreatorQuota('u1', 'products')
    await reserveCreatorQuota('u2', 'products')
    expect(state.counters.get('u2:products')).toBe(1)
    state.isAdmin = true
    await reserveCreatorQuota('admin', 'products')
    expect(state.counters.has('admin:products')).toBe(false)
  })
  it('bootstraps one shared allowance from 3D and fabrication requests', async () => {
    state.existingRequests = 6
    state.existingFabrication = 3
    await reserveCreatorQuota('u1', 'monthlyPrintRequests', new Date('2026-09-23T00:00:00Z'))
    expect(state.counters.get('u1:requests:2026-09')).toBe(10)
    await expect(reserveCreatorQuota('u1', 'monthlyPrintRequests', new Date('2026-09-23T00:00:00Z'))).rejects.toThrow(/10 print requests/)
  })
})
