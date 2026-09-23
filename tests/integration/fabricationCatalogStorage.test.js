// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ rows: [], metadata: {} }))
const mocks = vi.hoisted(() => ({ find: vi.fn(), bulkWrite: vi.fn(), deleteMany: vi.fn(), metadataFind: vi.fn(), metadataUpdate: vi.fn() }))
const matches = (row, query) => Object.entries(query).every(([key, value]) => {
  if (value && typeof value === 'object') {
    if ('$exists' in value) return (row[key] !== undefined) === value.$exists
    if ('$gt' in value) return row[key] > value.$gt
    if ('$in' in value) return value.$in.includes(row[key])
  }
  return row[key] === value
})
vi.mock('@/models/CreatorFabricationOffer', () => ({ default: {
  createIndexes: vi.fn(async () => {}), find: mocks.find, bulkWrite: mocks.bulkWrite, deleteMany: mocks.deleteMany,
  exists: vi.fn(async query => state.rows.some(row => Object.entries(query).every(([key, value]) => row[key] === value))),
  countDocuments: vi.fn(async query => state.rows.filter(row => Object.entries(query).every(([key, value]) => row[key] === value)).length),
} }))
vi.mock('@/models/CreatorFabricationService', () => ({ default: { createIndexes: vi.fn(async () => {}), findOne: mocks.metadataFind, findOneAndUpdate: mocks.metadataUpdate } }))
import { catalogPageOptions, fabricationCatalogPage, saveFabricationCatalogBatch, validateCatalogBatch } from '@/lib/fabrication/serverCatalog'
import { createFabricationOffer } from '@/lib/fabrication/catalog'

const chain = value => ({ lean: async () => value })
const offer = (index, enabled = true) => ({ ...createFabricationOffer('custom'), id: `service-${String(index).padStart(3, '0')}`, name: `Service ${index}`, enabled })
async function save(creatorUserId, offers, removedOfferIds = [], enabled = true) {
  const validated = validateCatalogBatch({ catalog: { enabled, offers }, removedOfferIds })
  return saveFabricationCatalogBatch(creatorUserId, validated.catalog, validated.removedOfferIds)
}
beforeEach(() => {
  vi.clearAllMocks()
  state.rows = []; state.metadata = {}
  mocks.metadataFind.mockImplementation(query => chain(structuredClone(state.metadata[query.creatorUserId] || null)))
  mocks.metadataUpdate.mockImplementation((query, update, options) => {
    const existing = state.metadata[query.creatorUserId]
    if ((!existing && !options?.upsert) || (existing && !matches(existing, query))) return chain(null)
    const metadata = state.metadata[query.creatorUserId] ||= { creatorUserId: query.creatorUserId, revision: 0 }
    Object.assign(metadata, update.$set)
    if (update.$inc?.revision) metadata.revision++
    for (const key of Object.keys(update.$unset || {})) delete metadata[key]
    return chain(structuredClone(metadata))
  })
  mocks.find.mockImplementation(query => ({ sort: () => ({ limit: count => chain(state.rows.filter(row => matches(row, query))
    .sort((a, b) => a.offerId.localeCompare(b.offerId)).slice(0, count)) }) }))
  mocks.bulkWrite.mockImplementation(async operations => {
    for (const { updateOne: op } of operations) {
      let row = state.rows.find(candidate => matches(candidate, op.filter))
      if (!row) { row = { ...op.filter, ...structuredClone(op.update.$setOnInsert || {}) }; state.rows.push(row) }
      Object.assign(row, structuredClone(op.update.$set || {}))
    }
    return {}
  })
  mocks.deleteMany.mockImplementation(async query => { state.rows = state.rows.filter(row => !matches(row, query)); return {} })
})

describe('fabrication service storage pages', () => {
  it('stores more than 24 total varieties and lists every service exactly once', async () => {
    for (let offset = 0; offset < 60; offset += 12) await save('provider', Array.from({ length: 12 }, (_, index) => offer(offset + index)))
    const seen = []
    let cursor
    do {
      const page = await fabricationCatalogPage('provider', { limit: 12, cursor })
      expect(page.total).toBe(60)
      expect(page.catalog.offers).toHaveLength(12)
      seen.push(...page.catalog.offers.map(row => row.id)); cursor = page.nextCursor
    } while (cursor)
    expect(new Set(seen).size).toBe(60)
    expect(state.metadata.provider.catalog).toBeUndefined()
  })
  it('changes only saved rows and explicitly removed owner rows, preserving unseen pages', async () => {
    await save('provider', Array.from({ length: 24 }, (_, index) => offer(index)))
    await save('provider', [offer(24), offer(25)])
    await save('other', [offer(1)])
    const changed = { ...offer(0), name: 'Changed service' }
    const response = await save('provider', [changed], ['service-001'])
    expect(response.offers).toEqual([expect.objectContaining({ name: 'Changed service' })])
    expect(state.rows.filter(row => row.creatorUserId === 'provider')).toHaveLength(25)
    expect(state.rows.find(row => row.creatorUserId === 'provider' && row.offerId === 'service-025')).toBeTruthy()
    expect(state.rows.find(row => row.creatorUserId === 'other' && row.offerId === 'service-001')).toBeTruthy()
    expect(mocks.deleteMany).toHaveBeenLastCalledWith({ creatorUserId: 'provider', offerId: { $in: ['service-001'] } })
  })
  it('allows a draft-only page while globally enabled, and filters drafts on public pages', async () => {
    await save('provider', [offer(0)])
    await save('provider', [offer(1, false)])
    const owner = await fabricationCatalogPage('provider')
    expect(owner.catalog).toMatchObject({ enabled: true, offers: [expect.any(Object), expect.objectContaining({ enabled: false })] })
    const publicPage = await fabricationCatalogPage('provider', { publicOnly: true })
    expect(publicPage.catalog.offers.map(row => row.id)).toEqual(['service-000'])
    expect(publicPage.total).toBe(1)
  })
  it('reads selected offers with an owner and enabled filter, without scanning the catalogue', async () => {
    await save('provider', [offer(0), offer(1, false)])
    await save('other', [offer(2)])
    const page = await fabricationCatalogPage('provider', { publicOnly: true, offerId: 'service-000' })
    expect(page.catalog.offers).toHaveLength(1)
    expect(mocks.find).toHaveBeenLastCalledWith({ creatorUserId: 'provider', enabled: true, offerId: 'service-000' })
    expect((await fabricationCatalogPage('provider', { publicOnly: true, offerId: 'service-001' })).catalog.offers).toEqual([])
    expect((await fabricationCatalogPage('provider', { publicOnly: true, offerId: 'service-002' })).catalog.offers).toEqual([])
    expect((await fabricationCatalogPage('provider', { cursor: 'service-001' })).catalog.offers).toEqual([])
  })
  it('retains legacy rows when the first new paged write migrates the old catalogue', async () => {
    state.metadata.provider = { creatorUserId: 'provider', catalog: { enabled: true, offers: [offer(0), offer(1)] }, revision: 0 }
    expect((await fabricationCatalogPage('provider')).catalog.offers).toHaveLength(2)
    await save('provider', [offer(2)], ['service-001'])
    expect((await fabricationCatalogPage('provider')).catalog.offers.map(row => row.id)).toEqual(['service-000', 'service-002'])
    expect(state.metadata.provider.catalog).toBeUndefined()
  })
  it('uses the same binary ordering for legacy sorting and cursor boundaries', async () => {
    state.metadata.provider = { creatorUserId: 'provider', catalog: { enabled: true,
      offers: [{ ...offer(0), id: 'a_a' }, { ...offer(1), id: 'a-a' }, { ...offer(2), id: 'A-a' }] }, revision: 0 }
    const seen = []
    let cursor
    do {
      const page = await fabricationCatalogPage('provider', { limit: 1, cursor })
      seen.push(...page.catalog.offers.map(row => row.id)); cursor = page.nextCursor
    } while (cursor)
    expect(seen).toEqual(['A-a', 'a-a', 'a_a'])
  })
  it('serializes first-write migration so a concurrent save cannot restore a removed legacy offer', async () => {
    state.metadata.provider = { creatorUserId: 'provider', catalog: { enabled: true, offers: [offer(0), offer(1)] }, revision: 0 }
    const results = await Promise.allSettled([save('provider', [offer(2)], ['service-001']), save('provider', [offer(3)])])
    expect(results[0].status).toBe('fulfilled')
    expect(results[1].status).toBe('rejected')
    expect(results[1].reason).toMatchObject({ status: 409, code: 'catalog_migrating' })
    await save('provider', [offer(3)])
    expect(state.rows.map(row => row.offerId).sort()).toEqual(['service-000', 'service-002', 'service-003'])
    expect(state.metadata.provider.migrationToken).toBeUndefined()
  })
  it('retains an uncertain migration claim and rejects new edits before touching offers', async () => {
    state.metadata.provider = { creatorUserId: 'provider', catalog: { enabled: true, offers: [offer(0)] }, revision: 0 }
    mocks.bulkWrite.mockRejectedValueOnce(new Error('network interrupted'))
    await expect(save('provider', [offer(2)])).rejects.toThrow('network interrupted')
    expect(state.metadata.provider.migrationToken).toBeTruthy()
    mocks.bulkWrite.mockClear(); mocks.deleteMany.mockClear()
    await expect(save('provider', [offer(3)], ['service-000'])).rejects.toMatchObject({ status: 409, code: 'catalog_migrating' })
    expect(mocks.bulkWrite).not.toHaveBeenCalled()
    expect(mocks.deleteMany).not.toHaveBeenCalled()
  })
  it('bounds each batch and page and rejects ambiguous removal instructions', () => {
    expect(() => validateCatalogBatch({ catalog: { enabled: true, offers: Array.from({ length: 25 }, (_, index) => offer(index)) } })).toThrow()
    expect(() => validateCatalogBatch({ catalog: { enabled: false, offers: [offer(0)] }, removedOfferIds: ['service-000'] })).toThrow()
    expect(() => validateCatalogBatch({ catalog: { enabled: false, offers: [] }, removedOfferIds: ['same', 'same'] })).toThrow()
    expect(() => catalogPageOptions('https://fit.example.org?limit=25')).toThrow()
    expect(() => catalogPageOptions('https://fit.example.org?cursor=%7B%22%24gt%22%3A%22%22%7D')).toThrow()
    expect(catalogPageOptions('https://fit.example.org?offerId=service-002')).toEqual({ offerId: 'service-002', cursor: null, limit: 12 })
  })
})
