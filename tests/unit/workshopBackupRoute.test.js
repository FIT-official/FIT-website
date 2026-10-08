// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
const h = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), open: vi.fn(), close: vi.fn(), create: vi.fn() }))
vi.mock('@/lib/authenticate', () => ({ authenticate: h.auth, UnauthorizedError: class extends Error {} }))
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: h.admin }))
vi.mock('@/lib/workshopDatabase', () => ({ workshopDatabase: vi.fn() }))
vi.mock('@/lib/workshopBackupSnapshot', () => ({ openWorkshopBackupSnapshot: h.open }))
vi.mock('@/lib/workshopBackupWorkbook', () => ({ createBackupArchive: h.create }))
import { GET } from '@/app/api/admin/workshop/backup/route'
const request = (query = '') => new Request('https://www.fixitoday.com/api/admin/workshop/backup' + query)
beforeEach(() => { vi.clearAllMocks(); h.auth.mockResolvedValue({ userId: 'teacher' }); h.admin.mockResolvedValue(true); h.open.mockResolvedValue({ metadata: { capturedAt: '2026-10-09T01:00:00.000Z' }, close: h.close }); h.create.mockReturnValue({ stream: Readable.from([Buffer.from('synthetic archive')]), done: Promise.resolve() }) })
describe('teacher-only response backup route', () => {
    it('rejects anonymous access before reading any student data', async () => { h.auth.mockRejectedValue(Object.assign(Error('Sign in'), { status: 401 })); const response = await GET(request()); expect(response.status).toBe(401); expect(h.open).not.toHaveBeenCalled() })
    it('rejects a signed-in non-teacher before opening a snapshot', async () => { h.admin.mockResolvedValue(false); expect((await GET(request())).status).toBe(403); expect(h.open).not.toHaveBeenCalled() })
    it('streams a private no-store attachment and releases its snapshot', async () => { const response = await GET(request()); expect(response.headers.get('content-disposition')).toBe('attachment; filename="FIT-workshop-backup-20261009T090000-SGT.zip"'); expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(response.headers.get('vary')).toBe('Cookie'); expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow'); expect(await response.text()).toBe('synthetic archive'); expect(h.close).toHaveBeenCalledOnce() })
    it('does not allow request parameters to select another namespace or hide records', async () => { expect((await GET(request('?collection=users'))).status).toBe(400); expect(h.open).not.toHaveBeenCalled() })
    it('returns a generic failure and no student content if the snapshot cannot start', async () => { h.open.mockRejectedValue(Error('PRIVATE STUDENT DATA')); const response = await GET(request()); expect(response.status).toBe(503); expect(await response.text()).not.toContain('PRIVATE') })
})
