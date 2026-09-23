// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ actor: 'customer', plan: 'pro', jobs: [], assets: [], catalog: null, used: 0, conflict: false }))
const mocks = vi.hoisted(() => ({ auth: vi.fn(), entitlements: vi.fn(), reserve: vi.fn(), jobFind: vi.fn(), jobCreate: vi.fn(), jobUpdate: vi.fn(), jobList: vi.fn(), catalogFind: vi.fn(), catalogUpdate: vi.fn(), assetFind: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/lib/creatorEntitlements', () => ({ getCreatorEntitlements: mocks.entitlements }))
vi.mock('@/lib/creatorPage/resolveCreator', () => ({ resolveCreatorByIdOrName: vi.fn(async id => ['provider', 'shop'].includes(id) ? { userId: 'provider', displayName: 'Maker shop' } : null) }))
vi.mock('@/lib/creatorQuota', () => ({ reserveCreatorQuota: mocks.reserve }))
vi.mock('@/lib/fabrication/serverRateLimit', () => ({ enforceFabricationRate: vi.fn() }))
vi.mock('@/models/FabricationRequest', () => ({ default: { createIndexes: vi.fn(async () => {}), findOne: mocks.jobFind, create: mocks.jobCreate, findOneAndUpdate: mocks.jobUpdate, find: mocks.jobList, exists: vi.fn() } }))
vi.mock('@/models/CreatorFabricationService', () => ({ default: { createIndexes: vi.fn(async () => {}), findOne: mocks.catalogFind, findOneAndUpdate: mocks.catalogUpdate } }))
vi.mock('@/models/CreatorFabricationOffer', () => ({ default: { createIndexes: vi.fn(async () => {}), exists: vi.fn(async () => false), bulkWrite: vi.fn(async () => {}), deleteMany: vi.fn(async () => {}) } }))
vi.mock('@/models/FabricationAsset', () => ({ default: { findOne: mocks.assetFind } }))
vi.mock('@/lib/s3', () => ({ s3: { send: vi.fn(async () => ({ PublicAccessBlockConfiguration: { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true } })) } }))
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn(async (_client, command) => `https://private.example.org/${command.input.Key}?signed=true`) }))

import { POST as estimate } from '@/app/api/fabrication/estimate/route'
import { POST as submit, GET as list } from '@/app/api/fabrication/requests/route'
import { PATCH as update, GET as detail } from '@/app/api/fabrication/requests/[requestId]/route'
import { PUT as publish, GET as ownerCatalog } from '@/app/api/user/fabrication-service/route'
import { GET as publicCatalog } from '@/app/api/creators/[id]/fabrication-service/route'
import { parseFabricationSubmission } from '@/lib/fabrication/serverRequests'
import { createFabricationOffer } from '@/lib/fabrication/catalog'

const clientRequestId = 'd947767b-e075-4c4e-b382-9568cc2b734f'
const input = { creatorId: 'provider', offerId: 'cut', materialId: 'plywood', widthMm: 100, heightMm: 50, quantity: 2 }
const personalization = { text: 'Ada', region: { x: 0.2, y: 0.2, width: 0.2, height: 0.2 }, fontFamily: 'sans', textColor: '#000000' }
const req = (body, method = 'POST', path = '/api/fabrication/requests') => new Request(`https://fit.example.org${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const props = requestId => ({ params: Promise.resolve({ requestId }) })
const matches = (row, query) => Object.entries(query).every(([key, value]) => {
  if (key === '$or') return value.some(part => matches(row, part))
  if (value instanceof Date) return new Date(row[key]).getTime() === value.getTime()
  if (value && typeof value === 'object' && '$lt' in value) return row[key] < value.$lt
  return row[key] === value
})
const chain = value => ({ lean: async () => value })
const makeCatalog = () => ({ enabled: true, offers: [{ id: 'cut', kind: 'laser_cut', name: 'Laser cut', description: '', enabled: true, leadTimeDays: 4,
  materials: [{ id: 'plywood', name: 'Plywood', thicknessMm: 3, pricePerCm2: 0.02, pricePerCm3: 0, setupFee: 5, perItemFee: 1, minimumCharge: 10, maxWidthMm: 300, maxHeightMm: 300, maxDepthMm: 3 }] }] })

beforeEach(() => {
  vi.clearAllMocks()
  process.env.FABRICATION_S3_BUCKET_NAME = 'private-test'
  Object.assign(state, { actor: 'customer', plan: 'pro', jobs: [], assets: [], catalog: makeCatalog(), used: 0, conflict: false })
  mocks.auth.mockImplementation(async () => ({ userId: state.actor }))
  mocks.entitlements.mockImplementation(async () => ({ planId: state.plan, status: 'active' }))
  mocks.catalogFind.mockImplementation(query => chain(query.creatorUserId === 'provider' ? { creatorUserId: 'provider', catalog: state.catalog } : null))
  mocks.catalogUpdate.mockImplementation((_query, update) => {
    if (update.$set.enabled !== undefined) state.catalog.enabled = update.$set.enabled
    return chain({ creatorUserId: 'provider', catalog: state.catalog, ...update.$set })
  })
  mocks.assetFind.mockImplementation(query => chain(state.assets.find(row => matches(row, query)) || null))
  mocks.jobFind.mockImplementation(query => chain(state.jobs.find(row => matches(row, query)) || null))
  mocks.jobCreate.mockImplementation(async data => {
    if (state.jobs.some(row => row.customerUserId === data.customerUserId && row.clientRequestId === data.clientRequestId)) throw Object.assign(new Error('duplicate'), { code: 11000 })
    const row = { ...structuredClone(data), createdAt: new Date('2026-09-23T01:00:00Z'), updatedAt: new Date('2026-09-23T01:00:00Z'), revision: 0, confirmedPrice: null, providerNote: '' }
    state.jobs.push(row)
    return row
  })
  mocks.jobList.mockImplementation(query => ({ sort: () => ({ limit: count => chain(state.jobs.filter(row => matches(row, query))
    .sort((a, b) => b.createdAt - a.createdAt || b.requestId.localeCompare(a.requestId)).slice(0, count)) }) }))
  mocks.jobUpdate.mockImplementation((query, update) => {
    const row = state.jobs.find(row => row.requestId === query.requestId && row.creatorUserId === query.creatorUserId && row.revision === query.revision && row.status === query.status && row.updatedAt.getTime() === query.updatedAt.getTime())
    if (!row || state.conflict) return chain(null)
    Object.assign(row, update.$set); row.revision++
    return chain(row)
  })
  mocks.reserve.mockImplementation(async () => { state.used++; let released = false; return { release: async () => { if (!released) { state.used--; released = true } } } })
})

describe('fabrication catalog and authoritative estimates', () => {
  it.each(['', '   ', 'private-test'])('exposes only upload availability for bucket configuration %j', async bucket => {
    process.env.FABRICATION_S3_BUCKET_NAME = bucket
    state.actor = 'provider'
    const responses = [
      await ownerCatalog(),
      await publicCatalog(new Request('https://fit.example.org/api'), { params: Promise.resolve({ id: 'provider' }) }),
      await publish(req({ catalog: state.catalog }, 'PUT')),
    ]
    for (const response of responses) {
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.uploadsAvailable).toBe(Boolean(bucket.trim()))
      expect(JSON.stringify(body)).not.toContain('private-test')
      expect(JSON.stringify(body)).not.toContain('FABRICATION_S3_BUCKET_NAME')
    }
    expect((await estimate(req(input))).status).toBe(200)
  })
  it('allows anonymous server-priced estimates without creating a job or charge', async () => {
    state.actor = null
    const response = await estimate(req(input))
    const result = await response.json()
    expect(response.status).toBe(200)
    expect(result.estimate.estimate.total).toBe(10)
    expect(result.estimate.material.thicknessMm).toBe(3)
    expect(result.estimate.estimate.providerConfirmationRequired).toBe(true)
    expect(mocks.reserve).not.toHaveBeenCalled()
    expect(mocks.jobCreate).not.toHaveBeenCalled()
  })
  it('records custom manual pricing without inventing a zero price', async () => {
    const offer = createFabricationOffer('custom')
    offer.enabled = true
    state.catalog.offers = [offer]
    const response = await submit(req({ creatorId: 'provider', offerId: offer.id, materialId: offer.materials[0].id, quantity: 1, clientRequestId }))
    expect(response.status).toBe(201)
    const { request } = await response.json()
    expect(request.snapshot.estimate).toMatchObject({ basis: 'manual', total: null, manualReviewRequired: true, providerConfirmationRequired: true })
    expect(request.confirmedPrice).toBeNull()
  })
  it('requires verified Pro for public availability, estimation and catalog writes', async () => {
    state.plan = 'standard'
    expect(await (await publicCatalog(new Request('https://fit.example.org/api'), { params: Promise.resolve({ id: 'provider' }) })).json()).toEqual({ enabled: false })
    expect((await estimate(req(input))).status).toBe(404)
    state.actor = 'provider'
    expect((await publish(req({ catalog: state.catalog }, 'PUT'))).status).toBe(403)
    expect(mocks.catalogUpdate).not.toHaveBeenCalled()
    expect((await ownerCatalog()).status).toBe(200)
  })
  it('rejects injected prices, geometry overrides, currencies and ownership fields', async () => {
    for (const extra of [{ total: 0 }, { thicknessMm: 0.1 }, { currency: 'usd' }, { creatorUserId: 'victim' }, { imageUrl: 'https://untrusted.example.org/a.png' }]) {
      expect((await estimate(req({ ...input, ...extra }))).status).toBe(400)
    }
  })
  it('publishes only the authenticated provider catalog and rejects foreign templates', async () => {
    state.actor = 'provider'
    expect((await publish(req({ catalog: state.catalog }, 'PUT'))).status).toBe(200)
    expect(mocks.catalogUpdate.mock.calls.every(([filter]) => filter.creatorUserId === 'provider')).toBe(true)
    state.catalog.offers[0].template = { assetId: 'foreign', region: personalization.region, fontFamily: 'sans', textColor: '#000000' }
    state.assets = [{ assetId: 'foreign', ownerUserId: 'other', kind: 'image' }]
    expect((await publish(req({ catalog: state.catalog }, 'PUT'))).status).toBe(400)
  })
})

describe('fabrication submission ownership and retry handling', () => {
  it('requires authentication and binds jobs to the authenticated customer', async () => {
    state.actor = null
    expect((await submit(req({ ...input, clientRequestId }))).status).toBe(401)
    state.actor = 'customer'
    const response = await submit(req({ ...input, clientRequestId }))
    expect(response.status).toBe(201)
    expect(state.jobs[0]).toMatchObject({ customerUserId: 'customer', creatorUserId: 'provider', status: 'submitted', snapshot: { currency: 'sgd' } })
    expect(state.used).toBe(1)
  })
  it('returns one job and one net quota reservation for simultaneous duplicate posts', async () => {
    const responses = await Promise.all([submit(req({ ...input, clientRequestId })), submit(req({ ...input, clientRequestId }))])
    expect(responses.map(response => response.status).sort()).toEqual([200, 201])
    const bodies = await Promise.all(responses.map(response => response.json()))
    expect(bodies[0].request.requestId).toBe(bodies[1].request.requestId)
    expect(state.jobs).toHaveLength(1)
    expect(state.used).toBe(1)
  })
  it('replays an unchanged job after downgrade and rejects reused keys for different submissions', async () => {
    await submit(req({ ...input, clientRequestId }))
    state.plan = 'free'
    mocks.entitlements.mockClear()
    expect((await submit(req({ ...input, clientRequestId }))).status).toBe(200)
    expect(mocks.entitlements).not.toHaveBeenCalled()
    expect((await submit(req({ ...input, quantity: 3, clientRequestId }))).status).toBe(409)
    expect((await submit(req({ ...input, clientRequestId: '704a4900-99dd-46e5-8001-e7bc5ffcbef1' }))).status).toBe(404)
    expect(state.used).toBe(1)
  })
  it('releases the quota reservation when an insertion definitely fails', async () => {
    mocks.jobCreate.mockRejectedValueOnce(Object.assign(new Error('write failed'), { name: 'ValidationError' }))
    expect((await submit(req({ ...input, clientRequestId }))).status).toBe(503)
    expect(state.used).toBe(0)
  })
  it('retains an allowance on an ambiguous insert failure to avoid undercounting a delayed commit', async () => {
    mocks.jobCreate.mockRejectedValueOnce(Object.assign(new Error('network interrupted'), { name: 'MongoNetworkError' }))
    expect((await submit(req({ ...input, clientRequestId }))).status).toBe(503)
    expect(state.used).toBe(1)
  })
  it('accepts owned images and reference files, rejects foreign images and text without an image', async () => {
    state.assets = [{ assetId: 'mine', ownerUserId: 'customer', kind: 'image', bucket: 'private-test', key: 'fabrication/customer/a.webp', originalName: 'a.png', width: 30, height: 20 },
      { assetId: 'drawing', ownerUserId: 'customer', kind: 'reference', bucket: 'private-test', key: 'fabrication/customer/a.pdf', originalName: 'a.pdf' },
      { assetId: 'foreign', ownerUserId: 'other', kind: 'image' }]
    expect((await estimate(req({ ...input, personalization }))).status).toBe(400)
    expect((await estimate(req({ ...input, imageAssetId: 'foreign', personalization }))).status).toBe(400)
    const response = await submit(req({ ...input, clientRequestId, imageAssetId: 'mine', referenceAssetId: 'drawing', personalization }))
    expect(response.status).toBe(201)
    const { request } = await response.json()
    expect(request.image.imageUrl).toContain('signed=true')
    expect(request.reference.fileUrl).toContain('signed=true')
    expect(request.customerPersonalization.text).toBe('Ada')
    expect(request.image.key).toBeUndefined()
  })
  it('allows an exact published template anonymously and constrains customer placement', async () => {
    state.actor = null
    state.catalog.offers[0].template = { assetId: 'template', region: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }, fontFamily: 'sans', textColor: '#000000' }
    state.assets = [{ assetId: 'template', ownerUserId: 'provider', kind: 'image' }]
    expect((await estimate(req({ ...input, imageAssetId: 'template', personalization }))).status).toBe(200)
    expect((await estimate(req({ ...input, imageAssetId: 'template', personalization: { ...personalization, region: { x: 0, y: 0, width: 1, height: 1 } } }))).status).toBe(400)
  })
})

describe('existing fabrication job access and updates', () => {
  it('isolates customer/provider lists and detail records', async () => {
    await submit(req({ ...input, clientRequestId }))
    const job = state.jobs[0]
    state.actor = 'other'
    expect((await detail(null, props(job.requestId))).status).toBe(404)
    expect((await update(req({ status: 'quoted', confirmedPrice: 20, expectedUpdatedAt: job.updatedAt.toISOString() }, 'PATCH'), props(job.requestId))).status).toBe(404)
    expect(await (await list(new Request('https://fit.example.org/api/fabrication/requests?role=provider'))).json()).toEqual({ requests: [], nextCursor: null })
    state.actor = 'customer'
    expect((await detail(null, props(job.requestId))).status).toBe(200)
    expect((await update(req({ status: 'cancelled', expectedUpdatedAt: job.updatedAt.toISOString() }, 'PATCH'), props(job.requestId))).status).toBe(404)
  })
  it('paginates beyond 100 jobs without leaking another customer or repeating tied timestamps', async () => {
    state.jobs = Array.from({ length: 115 }, (_, index) => ({ requestId: `job-${String(index).padStart(3, '0')}`, creatorUserId: 'provider',
      customerUserId: 'customer', createdAt: new Date('2026-09-23T01:00:00Z'), updatedAt: new Date(), status: 'submitted', snapshot: {} }))
    state.jobs.push({ ...state.jobs[0], requestId: 'job-999', customerUserId: 'other' })
    const first = await (await list(new Request('https://fit.example.org/api/fabrication/requests?limit=100'))).json()
    expect(first.requests).toHaveLength(100)
    const second = await (await list(new Request(`https://fit.example.org/api/fabrication/requests?limit=100&cursor=${first.nextCursor}`))).json()
    expect(second.requests).toHaveLength(15)
    expect(second.nextCursor).toBeNull()
    expect(new Set([...first.requests, ...second.requests].map(row => row.requestId)).size).toBe(115)
    expect([...first.requests, ...second.requests].some(row => row.customerUserId === 'other')).toBe(false)
    expect((await list(new Request('https://fit.example.org/api/fabrication/requests?limit=101'))).status).toBe(400)
    expect((await list(new Request('https://fit.example.org/api/fabrication/requests?cursor=bad'))).status).toBe(400)
  })
  it('keeps the customer image and original text unchanged when the provider adjusts placement', async () => {
    state.assets = [{ assetId: 'mine', ownerUserId: 'customer', kind: 'image', bucket: 'private-test', key: 'fabrication/customer/a.webp', width: 30, height: 20 }]
    await submit(req({ ...input, clientRequestId, imageAssetId: 'mine', personalization }))
    const job = state.jobs[0]; state.actor = 'provider'
    const changed = { ...personalization, text: 'Adjusted text', region: { x: 0, y: 0, width: 1, height: 1 } }
    const response = await update(req({ personalization: changed, expectedUpdatedAt: job.updatedAt.toISOString() }, 'PATCH'), props(job.requestId))
    expect(response.status).toBe(200)
    expect(job.imageAssetId).toBe('mine')
    expect(job.customerPersonalization).toEqual(personalization)
    expect(job.snapshot.personalization).toEqual(personalization)
    expect(job.personalization).toEqual(changed)
  })
  it('allows the provider to fulfil an existing job after downgrade with an atomic version check', async () => {
    await submit(req({ ...input, clientRequestId }))
    const job = state.jobs[0]
    const initialVersion = job.updatedAt.toISOString()
    state.actor = 'provider'; state.plan = 'free'; mocks.entitlements.mockClear()
    const response = await update(req({ status: 'quoted', confirmedPrice: 25.50, providerNote: 'Confirm finish', expectedUpdatedAt: initialVersion }, 'PATCH'), props(job.requestId))
    expect(response.status).toBe(200)
    expect((await response.json()).request).toMatchObject({ status: 'quoted', confirmedPrice: 25.5, confirmedCurrency: 'sgd' })
    expect(mocks.entitlements).not.toHaveBeenCalled()
    expect((await update(req({ status: 'in_progress', expectedUpdatedAt: initialVersion }, 'PATCH'), props(job.requestId))).status).toBe(409)
    state.conflict = true
    expect((await update(req({ status: 'in_progress', expectedUpdatedAt: job.updatedAt.toISOString() }, 'PATCH'), props(job.requestId))).status).toBe(409)
  })
  it('rejects skipping to completed, arbitrary fields and unconfirmed pricing', async () => {
    await submit(req({ ...input, clientRequestId }))
    const job = state.jobs[0]; state.actor = 'provider'
    for (const patch of [{ status: 'completed' }, { customerUserId: 'victim' }, { status: 'quoted' }, { confirmedPrice: 0.001 }]) {
      expect((await update(req({ ...patch, expectedUpdatedAt: job.updatedAt.toISOString() }, 'PATCH'), props(job.requestId))).status).not.toBe(200)
    }
    expect(mocks.jobUpdate).not.toHaveBeenCalled()
  })
  it('makes fingerprints independent of harmless JSON field ordering', () => {
    expect(parseFabricationSubmission({ ...input, clientRequestId }, true).fingerprint).toBe(parseFabricationSubmission({ quantity: 2, ...input, clientRequestId }, true).fingerprint)
  })
})
