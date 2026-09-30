// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ actor: 'customer', rows: [], admin: false }))
const mocks = vi.hoisted(() => ({ auth: vi.fn(), connect: vi.fn(), rate: vi.fn(), find: vi.fn(), create: vi.fn(), update: vi.fn(), ownedAsset: vi.fn(), shapeAsset: vi.fn(), admin: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }))
vi.mock('@/lib/db', () => ({ connectToDatabase: mocks.connect }))
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: mocks.admin }))
vi.mock('@/lib/fabrication/serverRateLimit', () => ({ enforceFabricationRate: mocks.rate }))
vi.mock('@/lib/fabrication/serverAssets', () => ({ findOwnedAsset: mocks.ownedAsset, shapeFabricationAsset: mocks.shapeAsset }))
vi.mock('@/models/PrinterRepairRequest', () => ({ default: { createIndexes: vi.fn(async () => {}), findOne: mocks.find, create: mocks.create, findOneAndUpdate: mocks.update } }))
import { POST, GET } from '@/app/api/printer-repair/route'
import { GET as detail, PATCH as withdraw } from '@/app/api/printer-repair/[requestId]/route'
import { GET as triage } from '@/app/api/admin/printer-repair/[requestId]/route'
import { GET as config } from '@/app/api/printer-repair/config/route'
import { fail } from '@/lib/fabrication/serverHttp'
import { repairFixture } from '../fixtures/printerRepair'

const origin = 'https://fit.example.invalid'
const req = (body, options = {}) => new Request(`${origin}${options.path || '/api/printer-repair'}`, { method: options.method || 'POST', headers: { origin, 'content-type': 'application/json', ...options.headers }, body: options.method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body) })
const params = requestId => ({ params: Promise.resolve({ requestId }) })
const match = (row, query) => Object.entries(query).every(([key, value]) => row[key] === value)
beforeEach(() => {
  vi.clearAllMocks(); state.actor = 'customer'; state.rows = []; state.admin = false
  mocks.auth.mockImplementation(async () => ({ userId: state.actor })); mocks.admin.mockImplementation(async () => state.admin)
  mocks.find.mockImplementation(query => ({ lean: async () => state.rows.find(row => match(row, query)) || null }))
  mocks.create.mockImplementation(async data => {
    if (state.rows.some(row => row.customerUserId === data.customerUserId && row.clientRequestId === data.clientRequestId)) throw Object.assign(new Error('duplicate'), { code: 11000 })
    const row = { ...data, createdAt: new Date(), updatedAt: new Date() }; state.rows.push(row); return row
  })
  mocks.update.mockImplementation((query, update) => ({ lean: async () => { const row = state.rows.find(row => match(row, query)); if (row) Object.assign(row, update.$set); return row || null } }))
  mocks.ownedAsset.mockImplementation(async (id, owner, kind) => {
    if (id !== 'c4cda36f-cfd0-45e0-8518-03b9b9321ba5' || owner !== 'customer' || kind !== 'image') fail('That attachment is not available to this account.', 400)
    return { assetId: id, ownerUserId: owner, kind, bucket: 'private-test', key: 'private-test-key' }
  })
  mocks.shapeAsset.mockImplementation(async asset => ({ assetId: asset.assetId, kind: 'image', imageUrl: 'https://signed.example.invalid/photo?expires=300' }))
})
describe('private repair request API with fixture persistence', () => {
  it('requires authentication before any connection or write', async () => {
    state.actor = null; expect((await POST(req(repairFixture))).status).toBe(401)
    expect(mocks.connect).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled()
  })
  it.each(['https://foreign.invalid', 'null', ''])('rejects unsafe origin %s before any database access', async unsafe => {
    expect((await POST(req(repairFixture, { headers: { origin: unsafe } }))).status).toBe(403); expect(mocks.connect).not.toHaveBeenCalled()
  })
  it('honours strict rate-limit failures without writing', async () => {
    mocks.rate.mockImplementationOnce(async () => fail('Wait a minute.', 429)); expect((await POST(req(repairFixture))).status).toBe(429)
    expect(mocks.create).not.toHaveBeenCalled()
    mocks.rate.mockImplementationOnce(async () => fail('Rate limit unavailable.', 503)); expect((await POST(req(repairFixture))).status).toBe(503)
  })
  it('rejects malformed and oversized bodies before persistence', async () => {
    expect((await POST(req('{'))).status).toBe(400)
    expect((await POST(req('x'.repeat(18000)))).status).toBe(413)
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('creates only an assessment request with no price, slot, order or public user identity', async () => {
    const response = await POST(req(repairFixture)); const body = await response.json()
    expect(response.status).toBe(201); expect(body.request.status).toBe('assessment_requested')
    expect(body.request).not.toHaveProperty('customerUserId'); expect(body.request).not.toHaveProperty('submissionFingerprint')
    expect(body.request).not.toHaveProperty('price'); expect(body.request).not.toHaveProperty('appointment')
    expect(response.headers.get('cache-control')).toBe('no-store'); expect(state.rows[0].customerUserId).toBe('customer')
  })
  it('creates one request for concurrent duplicate attempts and exact retries', async () => {
    const responses = await Promise.all([POST(req(repairFixture)), POST(req(repairFixture))])
    expect(responses.map(response => response.status).sort()).toEqual([200, 201]); expect(state.rows).toHaveLength(1)
    expect((await POST(req(repairFixture))).status).toBe(200)
    expect((await POST(req({ ...repairFixture, brief: { ...repairFixture.brief, model: 'X1' } }))).status).toBe(409)
  })
  it('recovers a committed write whose database response was lost', async () => {
    const create = mocks.create.getMockImplementation()
    mocks.create.mockImplementationOnce(async data => { await create(data); throw new Error('response lost') })
    expect((await POST(req(repairFixture))).status).toBe(200); expect(state.rows).toHaveLength(1)
  })
  it('validates image ownership and kind; never accepts external attachment URLs', async () => {
    const photo = 'c4cda36f-cfd0-45e0-8518-03b9b9321ba5'
    expect((await POST(req({ ...repairFixture, photoAssetIds: [photo] }))).status).toBe(201)
    expect(mocks.ownedAsset).toHaveBeenCalledWith(photo, 'customer', 'image')
    expect((await POST(req({ ...repairFixture, clientRequestId: '81d30a93-4b39-4a2d-8b25-dc8b33652043', photoAssetIds: ['9a55539b-4b20-4842-b0d0-53a4bf3b364c'] }))).status).toBe(400)
  })
  it('allows a late exact replay after its preferred date passed', async () => {
    const fixture = { ...repairFixture, brief: { ...repairFixture.brief, preferredDate: '' } }
    await POST(req(fixture)); state.rows[0].brief.preferredDate = '2020-01-01'
    // Rebuild the same stored fingerprint, as a request created before that date.
    const { createHash } = await import('node:crypto')
    const late = { ...fixture, brief: { ...fixture.brief, preferredDate: '2020-01-01' } }
    state.rows[0].submissionFingerprint = createHash('sha256').update(JSON.stringify({ brief: late.brief, photoAssetIds: [] })).digest('hex')
    expect((await POST(req(late))).status).toBe(200)
  })
  it('accepts an unchanged delayed first arrival after its preference elapsed, without booking it', async () => {
    const delayed = { ...repairFixture, brief: { ...repairFixture.brief, preferredDate: '2020-01-01' } }
    const { request } = await (await POST(req(delayed))).json()
    expect(request.preferredDateNeedsDiscussion).toBe(true); expect(request.status).toBe('assessment_requested')
    expect(request).not.toHaveProperty('appointment'); expect((await POST(req(delayed))).status).toBe(200); expect(state.rows).toHaveLength(1)
  })
  it('keeps detail, recovery and withdrawal private to the submitting account', async () => {
    const body = await (await POST(req(repairFixture))).json(), id = body.request.requestId
    const recover = () => GET(req(null, { method: 'GET', path: `/api/printer-repair?clientRequestId=${repairFixture.clientRequestId}` }))
    expect((await recover()).status).toBe(200); state.actor = 'other'
    expect((await recover()).status).toBe(404); expect((await detail(req(null, { method: 'GET' }), params(id))).status).toBe(404)
    expect((await withdraw(req({ action: 'withdraw' }, { method: 'PATCH' }), params(id))).status).toBe(404)
    state.actor = 'customer'
    for (let i = 0; i < 2; i++) expect((await (await withdraw(req({ action: 'withdraw' }, { method: 'PATCH' }), params(id))).json()).request.status).toBe('withdrawn')
    expect((await (await POST(req(repairFixture))).json()).request.status).toBe('withdrawn')
  })
  it('restricts triage to existing admins and prepares a private unpriced quote draft', async () => {
    const { request } = await (await POST(req({ ...repairFixture, photoAssetIds: ['c4cda36f-cfd0-45e0-8518-03b9b9321ba5'] }))).json()
    expect((await triage(req(null, { method: 'GET' }), params(request.requestId))).status).toBe(403)
    state.admin = true
    const result = await (await triage(req(null, { method: 'GET' }), params(request.requestId))).json()
    expect(result.triage.quoteDraft).toMatchObject({ status: 'needs_assessment', price: null, appointment: null, customerApproval: 'required_before_work' })
    expect(result.triage.photos[0].imageUrl).toContain('signed.example.invalid')
    expect(JSON.stringify(result)).not.toContain('private-test-key'); expect(state.rows).toHaveLength(1)
  })
  it('exposes only a storage availability boolean, never bucket names or secrets', async () => {
    vi.stubEnv('FABRICATION_S3_BUCKET_NAME', 'secret-private-bucket')
    expect(await (await config()).json()).toEqual({ uploadsAvailable: true }); vi.unstubAllEnvs()
  })
})
