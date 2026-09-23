import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/authenticate', () => ({ authenticate: vi.fn(async () => ({ userId: 'buyer-1' })),
  unauthorizedResponse: vi.fn(), UnauthorizedError: class extends Error {} }))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ clerkClient: vi.fn() }))
vi.mock('@/models/Product', () => ({ default: { findOne: vi.fn() } }))
vi.mock('@/models/CreatorPrintService', () => ({ default: {} }))
vi.mock('@/lib/notifications/creatorPrint', () => ({ notifyCreatorNewRequest: vi.fn() }))
vi.mock('@/lib/creatorQuota', () => ({ reserveCreatorQuota: vi.fn(), CreatorQuotaError: class extends Error {} }))
import CustomPrintRequest from '@/models/CustomPrintRequest'
import { PUT } from '@/app/api/custom-print/route'
import { mapPurposeToConfiguration } from '@/lib/quoting/genericPresets'

let update
let saved
const updatedAt = new Date('2026-09-22T00:00:00Z')
beforeEach(() => {
  saved = CustomPrintRequest.hydrate({
    _id: '507f191e810c19729de860ea', requestId: 'request-1', userId: 'buyer-1',
    userName: 'Buyer', userEmail: 'buyer@example.test', status: 'configured', basePrice: 0,
    modelFile: { s3Key: 'models/buyer-1/old.stl', originalName: 'old.stl' }, updatedAt,
    printConfiguration: { ...mapPurposeToConfiguration({ purpose: 'Normal' }), isConfigured: true },
  })
  vi.spyOn(CustomPrintRequest, 'findOne').mockResolvedValue(saved)
  vi.spyOn(CustomPrintRequest, 'deleteMany').mockResolvedValue({ deletedCount: 0 })
  // Exercise actual Mongoose document.save(), replacing only the database edge.
  update = vi.spyOn(CustomPrintRequest.collection, 'updateOne').mockResolvedValue({ matchedCount: 1, modifiedCount: 1 })
})
afterEach(() => vi.restoreAllMocks())
const put = overrides => PUT(new Request('https://fit.test/api/custom-print', {
  method: 'PUT', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ requestId: 'request-1',
    modelFile: { s3Key: 'models/buyer-1/new.stl', originalName: 'new.stl', fileSize: 84 },
    printConfiguration: mapPurposeToConfiguration({ purpose: 'Strong' }), ...overrides }),
}))

describe('initial request save concurrency', () => {
  it('puts the original status and revision in the real Mongoose database update filter', async () => {
    expect((await put()).status).toBe(200)
    expect(update).toHaveBeenCalledTimes(1)
    const [filter, mutation] = update.mock.calls[0]
    expect(filter).toMatchObject({ status: 'configured', updatedAt })
    expect(mutation.$set['printConfiguration'].printSettings.wallLoops).toBe(4)
  })
  it('returns a conflict when the model changes while another caller quotes or pays', async () => {
    update.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 })
    const response = await put()
    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatch(/request changed/)
    expect(CustomPrintRequest.deleteMany).not.toHaveBeenCalled()
  })
  it('rejects quote/settings inconsistency before writing and keeps server metadata authoritative', async () => {
    expect((await put({ printConfiguration: { ...mapPurposeToConfiguration({ purpose: 'Strong' }),
      printSettings: mapPurposeToConfiguration({ purpose: 'Normal' }).printSettings } })).status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })
})
