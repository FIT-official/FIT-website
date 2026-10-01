// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ bucket: vi.fn(), auth: vi.fn(), admin: vi.fn(), db: vi.fn(), rate: vi.fn(), find: vi.fn(), rows: [] }))
vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }))
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: mocks.admin }))
vi.mock('@/lib/db', () => ({ connectToDatabase: mocks.db }))
vi.mock('@/lib/fabrication/serverRateLimit', () => ({ enforceFabricationRate: mocks.rate }))
vi.mock('@/lib/fabrication/serverAssets', () => ({ privateFabricationBucket: mocks.bucket, findOwnedAsset: vi.fn(), shapeFabricationAsset: vi.fn() }))
vi.mock('@/models/PrinterRepairRequest', () => ({ default: { find: mocks.find } }))
import { GET as config } from '@/app/api/printer-repair/config/route'
import { GET as queue } from '@/app/api/admin/printer-repair/route'
import { GET as detail } from '@/app/api/admin/printer-repair/[requestId]/route'
import { repairFixture } from '../fixtures/printerRepair'
import { fail } from '@/lib/fabrication/serverHttp'
beforeEach(() => {
  vi.clearAllMocks(); mocks.rows.length = 0
  mocks.bucket.mockResolvedValue('fixture-private'); mocks.auth.mockResolvedValue({ userId: 'fixture-admin' }); mocks.admin.mockResolvedValue(true)
  mocks.find.mockImplementation(() => ({ sort: () => ({ limit: () => ({ lean: async () => mocks.rows }) }) }))
})
afterEach(() => vi.unstubAllEnvs())
describe('repair readiness and staff queue', () => {
  it('reports a limiter outage distinctly and reads no queue data', async () => {
    mocks.rate.mockImplementationOnce(async () => fail('This service is temporarily unavailable.', 503, 'rate_limit_unavailable'))
    const response = await queue(new Request('https://fit.invalid/api/admin/printer-repair'))
    expect(response.status).toBe(503)
    expect((await response.json()).code).toBe('rate_limit_unavailable')
    expect(mocks.db).not.toHaveBeenCalled(); expect(mocks.find).not.toHaveBeenCalled()
  })
  it('offers uploads only after existing private storage passes its read-only verification', async () => {
    vi.stubEnv('FABRICATION_S3_BUCKET_NAME', 'fixture-private')
    expect((await (await config()).json()).uploadsAvailable).toBe(true)
    mocks.bucket.mockRejectedValueOnce(new Error('private policy not verified'))
    const body = await (await config()).json()
    expect(body.uploadsAvailable).toBe(false); expect(JSON.stringify(body)).not.toContain('fixture-private')
  })
  it('does not probe absent storage or advertise production submission without its existing configuration', async () => {
    vi.stubEnv('FABRICATION_S3_BUCKET_NAME', ''); vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    expect(await (await config()).json()).toEqual({ uploadsAvailable: false, requestsAvailable: false })
    expect(mocks.bucket).not.toHaveBeenCalled()
  })
  it.each([null, 'shop-provider', 'customer'])('denies nonadmins before any database or private list read: %s', async actor => {
    mocks.auth.mockResolvedValue({ userId: actor }); mocks.admin.mockResolvedValue(false)
    expect((await queue(new Request('https://fit.invalid/api/admin/printer-repair'))).status).toBe(actor ? 403 : 401)
    expect(mocks.db).not.toHaveBeenCalled(); expect(mocks.find).not.toHaveBeenCalled()
  })
  it.each([null, 'shop-provider', 'customer'])('denies nonadmins on private request details before database or rate service access: %s', async actor => {
    mocks.auth.mockResolvedValue({ userId: actor }); mocks.admin.mockResolvedValue(false)
    const response = await detail(new Request('https://fit.invalid/api/admin/printer-repair/private'), { params: Promise.resolve({ requestId: 'private' }) })
    expect(response.status).toBe(actor ? 403 : 401)
    expect(mocks.db).not.toHaveBeenCalled(); expect(mocks.rate).not.toHaveBeenCalled()
  })
  it('bounds the admin queue and removes internal identities from each result', async () => {
    for (let index = 0; index < 21; index++) mocks.rows.push({ requestId: '56e1fe9c-33e5-4ae3-8e70-dbc6b0c97b34', status: 'assessment_requested', customerUserId: 'private-identity', submissionFingerprint: 'private-hash', brief: repairFixture.brief, photoAssetIds: [], createdAt: new Date('2026-10-01T00:00:00.000Z'), updatedAt: new Date('2026-10-01T00:00:00.000Z') })
    const response = await queue(new Request('https://fit.invalid/api/admin/printer-repair')), body = await response.json()
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store')
    expect(body.requests).toHaveLength(20); expect(body.nextCursor).toContain('2026-10-01T00:00:00.000Z|')
    expect(JSON.stringify(body)).not.toMatch(/private-identity|private-hash|photoAssetIds/)
  })
  it.each(['?status=paid', '?cursor=not-a-page', '?cursor=2026-10-01|injected'])('rejects malformed staff filters before database access: %s', async query => {
    expect((await queue(new Request('https://fit.invalid/api/admin/printer-repair' + query))).status).toBe(400)
    expect(mocks.db).not.toHaveBeenCalled()
  })
})
