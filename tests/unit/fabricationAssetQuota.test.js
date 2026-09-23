// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ counters: new Map(), assets: [], duplicateInitialisation: false, failedInitialisation: false, failedRelease: false }))
vi.mock('@/models/FabricationAsset', () => ({ default: { countDocuments: vi.fn(async query => state.assets.filter(asset =>
  asset.ownerUserId === query.ownerUserId && asset.createdAt >= query.createdAt.$gte && asset.createdAt < query.createdAt.$lt).length) } }))
vi.mock('@/models/CreatorQuota', () => ({ default: {
  findById: vi.fn(id => ({ lean: async () => state.counters.has(id) ? { used: state.counters.get(id) } : null })),
  updateOne: vi.fn(async (query, update) => {
    if (update.$setOnInsert) {
      if (state.failedInitialisation) throw new Error('Database unavailable')
      if (state.duplicateInitialisation) {
        state.counters.set(query._id, update.$setOnInsert.used)
        throw Object.assign(new Error('Concurrent initialization won'), { code: 11000 })
      }
      if (!state.counters.has(query._id)) state.counters.set(query._id, update.$setOnInsert.used)
    } else {
      if (state.failedRelease) throw new Error('Uncertain decrement')
      const used = state.counters.get(query._id)
      if (used > query.used.$gt) state.counters.set(query._id, used + update.$inc.used)
    }
  }),
  findOneAndUpdate: vi.fn(async (query, update) => {
    const used = state.counters.get(query._id)
    if (!(used < query.used.$lt)) return null
    state.counters.set(query._id, used + update.$inc.used)
    return { used: used + update.$inc.used }
  }),
} }))

import CreatorQuota from '@/models/CreatorQuota'
import { reserveDailyFabricationAsset } from '@/lib/fabrication/serverAssetQuota'
const now = new Date('2026-09-23T10:00:00Z')
const key = 'fabrication-assets:user_1:2026-09-23'
beforeEach(() => {
  vi.clearAllMocks()
  state.counters.clear(); state.assets = []; state.duplicateInitialisation = false
  state.failedInitialisation = false; state.failedRelease = false
})

describe('daily fabrication attachment reservations', () => {
  it('allows only the last remaining slot when ten uploads arrive concurrently', async () => {
    state.assets = Array.from({ length: 49 }, () => ({ ownerUserId: 'user_1', createdAt: now }))
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => reserveDailyFabricationAsset('user_1', now)))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const failures = results.filter(result => result.status === 'rejected')
    expect(failures).toHaveLength(9)
    expect(failures.every(result => result.reason.status === 429)).toBe(true)
    expect(state.counters.get(key)).toBe(50)
  })

  it('counts only this account and this UTC calendar day, including the exact day start', async () => {
    state.assets = [
      { ownerUserId: 'user_1', createdAt: new Date('2026-09-23T00:00:00Z') },
      { ownerUserId: 'user_1', createdAt: new Date('2026-09-22T23:59:59.999Z') },
      { ownerUserId: 'other', createdAt: now },
    ]
    await reserveDailyFabricationAsset('user_1', now)
    expect(state.counters.get(key)).toBe(2)
    await reserveDailyFabricationAsset('user_1', new Date('2026-09-24T00:00:00Z'))
    expect(state.counters.get('fabrication-assets:user_1:2026-09-24')).toBe(1)
  })

  it('releases a cancelled upload once even when cleanup runs concurrently', async () => {
    const reservation = await reserveDailyFabricationAsset('user_1', now)
    await Promise.all([reservation.release(), reservation.release(), reservation.release()])
    expect(state.counters.get(key)).toBe(0)
    expect(CreatorQuota.updateOne.mock.calls.filter(([, update]) => update.$inc)).toHaveLength(1)
    await reserveDailyFabricationAsset('user_1', now)
    expect(state.counters.get(key)).toBe(1)
  })

  it('uses the winning shared counter after duplicate initialization', async () => {
    state.duplicateInitialisation = true
    await reserveDailyFabricationAsset('user_1', now)
    expect(state.counters.get(key)).toBe(1)
  })

  it('fails closed on a database initialization error', async () => {
    state.failedInitialisation = true
    await expect(reserveDailyFabricationAsset('user_1', now)).rejects.toThrow('Database unavailable')
    expect(CreatorQuota.findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('does not retry an uncertain decrement and accidentally release another upload', async () => {
    const reservation = await reserveDailyFabricationAsset('user_1', now)
    state.failedRelease = true
    await expect(reservation.release()).rejects.toThrow('Uncertain decrement')
    await expect(reservation.release()).rejects.toThrow('Uncertain decrement')
    expect(CreatorQuota.updateOne.mock.calls.filter(([, update]) => update.$inc)).toHaveLength(1)
  })
})
