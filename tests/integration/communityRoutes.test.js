// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ actor: 'provider', isAdmin: false }))
const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), db: vi.fn(), rate: vi.fn(), public: vi.fn(), create: vi.fn(), eligible: vi.fn(), report: vi.fn(), queue: vi.fn(), moderate: vi.fn(), restrict: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }))
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: mocks.admin }))
vi.mock('@/lib/db', () => ({ connectToDatabase: mocks.db }))
vi.mock('@/lib/fabrication/serverRateLimit', () => ({ enforceFabricationRate: mocks.rate }))
vi.mock('@/lib/community/server', async () => {
  const { fail } = await import('@/lib/fabrication/serverHttp')
  return { publicEntries: mocks.public, createEntry: mocks.create, eligibleRequests: mocks.eligible, reportEntry: mocks.report,
    adminEntries: mocks.queue, moderateEntry: mocks.moderate, restrictAuthor: mocks.restrict,
    requireCommunityOrigin: request => { if (request.headers.get('origin') !== new URL(request.url).origin) fail('Invalid origin.', 403) } }
})
import { POST } from '@/app/api/community/route'
import { GET as queue } from '@/app/api/admin/community/route'
import { PATCH } from '@/app/api/admin/community/[entryId]/route'
import { PATCH as posting } from '@/app/api/admin/community/[entryId]/posting/route'
const id = '56e1fe9c-33e5-4ae3-8e70-dbc6b0c97b34'
const request = (method = 'PATCH', origin = 'https://fit.invalid') => new Request('https://fit.invalid/api/admin/community/' + id, { method, headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ operationId: id, expectedRevision: 0, action: 'hide', reason: 'Security review.' }) })
const context = { params: Promise.resolve({ entryId: id }) }
beforeEach(() => { vi.clearAllMocks(); state.actor = 'provider'; state.isAdmin = false; mocks.auth.mockImplementation(async () => ({ userId: state.actor })); mocks.admin.mockImplementation(async () => state.isAdmin); mocks.moderate.mockResolvedValue({ updated: true }); mocks.restrict.mockResolvedValue({ updated: true }); mocks.queue.mockResolvedValue({ entries: [] }) })
describe('FIT-only moderation route authorization', () => {
  it.each(['own-shop-provider', 'foreign-shop-provider', 'customer'])('denies %s any hide/restore or restriction API before database access', async actor => {
    state.actor = actor
    for (const handler of [PATCH, posting]) expect((await handler(request(), context)).status).toBe(403)
    expect((await queue(new Request('https://fit.invalid/api/admin/community'))).status).toBe(403)
    expect(mocks.db).not.toHaveBeenCalled(); expect(mocks.moderate).not.toHaveBeenCalled(); expect(mocks.restrict).not.toHaveBeenCalled()
  })
  it('denies anonymous requests before private data access', async () => {
    state.actor = null; expect((await PATCH(request(), context)).status).toBe(401)
    expect((await POST(request('POST'))).status).toBe(401); expect(mocks.db).not.toHaveBeenCalled()
  })
  it('requires same-origin writes even for admins', async () => {
    state.isAdmin = true
    expect((await PATCH(request('PATCH', 'https://foreign.invalid'), context)).status).toBe(403)
    expect(mocks.db).not.toHaveBeenCalled()
  })
  it('uses the server-verified FIT admin identity and never forwards a client role', async () => {
    state.actor = 'fit-platform-admin'; state.isAdmin = true
    const response = await PATCH(request(), context)
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store')
    expect(mocks.admin).toHaveBeenCalledWith('fit-platform-admin')
    expect(mocks.moderate).toHaveBeenCalledWith(id, expect.objectContaining({ action: 'hide' }), 'fit-platform-admin')
  })
  it('fails closed on rate-limit failure without a moderation write', async () => {
    state.isAdmin = true; mocks.rate.mockRejectedValueOnce(new Error('fixture unavailable'))
    expect((await PATCH(request(), context)).status).toBe(503); expect(mocks.moderate).not.toHaveBeenCalled()
  })
  it('limits public posting by both the authenticated account and request source before database access', async () => {
    state.actor = 'customer'; mocks.create.mockResolvedValue({ replayed: false, entry: {} })
    expect((await POST(request('POST'))).status).toBe(201)
    expect(mocks.rate).toHaveBeenNthCalledWith(1, expect.any(Request), 'community_post', 'customer')
    expect(mocks.rate).toHaveBeenNthCalledWith(2, expect.any(Request), 'community_post_ip')
    expect(mocks.rate.mock.invocationCallOrder[1]).toBeLessThan(mocks.db.mock.invocationCallOrder[0])
  })
})
