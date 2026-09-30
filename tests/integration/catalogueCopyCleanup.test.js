import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), connect: vi.fn(), find: vi.fn(), bulk: vi.fn(), backup: vi.fn(), finish: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: m.auth }))
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: m.admin }))
vi.mock('@/lib/db', () => ({ connectToDatabase: m.connect }))
vi.mock('@/models/Product', () => ({ default: { find: m.find, bulkWrite: m.bulk } }))
import { GET, POST } from '@/app/api/admin/catalogue-copy/route'
import { productCopyChange } from '@/lib/catalogueCopyCleanup'

const original = { _id: 'product-id', name: 'Board', slug: 'board', description: 'Board. Escendo Quotation 2512031 (3 Dec 2025) unit price SGD 3.00. 2.54 mm pitch.', delivery: { deliveryTypes: [{ type: 'express-courier', customPrice: 30, customDescription: 'Premium tracked courier; tests higher bounds. 1–2 business days, fully tracked.' }] } }
const request = (method = 'GET', body = { action: 'clean-catalogue-copy' }, origin = 'https://fit.test') => new Request('https://fit.test/api/admin/catalogue-copy', { method, headers: { origin }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) })
beforeEach(() => {
    vi.clearAllMocks()
    m.auth.mockResolvedValue({ userId: 'admin' }); m.admin.mockResolvedValue(true)
    m.connect.mockResolvedValue({ connection: { db: { collection: () => ({ insertOne: m.backup, updateOne: m.finish }) } } })
    m.find.mockReturnValue({ select: () => ({ limit: () => ({ lean: async () => [original] }) }) })
    m.backup.mockResolvedValue({ insertedId: 'backup-id' }); m.bulk.mockResolvedValue({ modifiedCount: 1 }); m.finish.mockResolvedValue({})
})
describe('catalogue copy cleanup', () => {
    it.each(['GET', 'POST'])('rejects anonymous %s before reading products', async method => {
        m.auth.mockResolvedValue({ userId: null })
        expect((await (method === 'GET' ? GET : POST)(request(method))).status).toBe(401)
        expect(m.find).not.toHaveBeenCalled()
    })
    it('rejects non-admins and cross-origin changes', async () => {
        m.admin.mockResolvedValueOnce(false)
        expect((await GET(request())).status).toBe(403)
        expect((await POST(request('POST', undefined, 'https://other.test'))).status).toBe(403)
        expect(m.find).not.toHaveBeenCalled()
    })
    it('requires an explicit cleanup action', async () => {
        expect((await POST(request('POST', {}))).status).toBe(400)
        expect(m.find).not.toHaveBeenCalled()
    })
    it('previews the exact changes without writing', async () => {
        const response = await GET(request())
        expect(response.headers.get('Cache-Control')).toBe('private, no-store')
        expect(await response.json()).toMatchObject({ scanned: 1, affected: 1, productDescriptions: 1, deliveryDescriptions: 1 })
        expect(m.find).toHaveBeenCalledWith({ productType: 'shop' })
        expect(m.bulk).not.toHaveBeenCalled(); expect(m.backup).not.toHaveBeenCalled()
    })
    it('backs up first, compares previous values, and changes only text fields', async () => {
        const body = await (await POST(request('POST'))).json()
        expect(body).toMatchObject({ updated: 1, skipped: 0, backupId: 'backup-id' })
        expect(m.backup.mock.invocationCallOrder[0]).toBeLessThan(m.bulk.mock.invocationCallOrder[0])
        const change = productCopyChange(original)
        expect(m.bulk).toHaveBeenCalledWith([{ updateOne: { filter: { _id: 'product-id', ...change.before }, update: { $set: { description: 'Board. 2.54 mm pitch.', 'delivery.deliveryTypes.0.customDescription': 'Premium tracked courier. 1–2 business days, fully tracked.' } } } }])
        expect(m.backup).toHaveBeenCalledWith(expect.objectContaining({ userId: 'admin', changes: [change] }))
        expect(original.description).toContain('Escendo')
    })
    it('does not write when the backup fails', async () => {
        m.backup.mockRejectedValueOnce(new Error('private database detail'))
        const response = await POST(request('POST'))
        expect(response.status).toBe(503); expect(m.bulk).not.toHaveBeenCalled()
        expect(JSON.stringify(await response.json())).not.toContain('private database detail')
    })
    it('reports concurrent edits as skipped', async () => {
        m.bulk.mockResolvedValue({ modifiedCount: 0 })
        expect(await (await POST(request('POST'))).json()).toMatchObject({ updated: 0, skipped: 1 })
    })
    it('does nothing on an already clean catalogue', async () => {
        m.find.mockReturnValue({ select: () => ({ limit: () => ({ lean: async () => [{ _id: 'clean', name: 'Sensor', description: 'Sensor. 2.54 mm pitch.' }] }) }) })
        expect(await (await POST(request('POST'))).json()).toMatchObject({ affected: 0, updated: 0 })
        expect(m.bulk).not.toHaveBeenCalled(); expect(m.backup).not.toHaveBeenCalled()
    })
})
