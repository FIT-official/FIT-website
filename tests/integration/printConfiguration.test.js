import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/models/CustomPrintRequest', () => ({ default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() } }))
vi.mock('@/models/Product', () => ({ default: { findOne: vi.fn(() => ({ select: () => ({ lean: async () => ({}) }) })) } }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/manualQuoteEmail', () => ({ buildManualQuoteAdminEmail: vi.fn(() => ({})) }))
vi.mock('@/lib/notifications/customPrint', () => ({ notifyCustomPrintEvent: vi.fn() }))
import { auth } from '@clerk/nextjs/server'
import CustomPrintRequest from '@/models/CustomPrintRequest'
import { PUT } from '@/app/api/custom-print/config/route'
import { mapPurposeToConfiguration } from '@/lib/quoting/genericPresets'

const base = () => ({ requestId: 'request-1', mode: 'instant', ...mapPurposeToConfiguration({ purpose: 'Strong' }), meshColors: { Model: '#ffffff' } })
const put = body => PUT(new Request('https://fit.test/api/custom-print/config', { method: 'PUT',
  headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
beforeEach(() => {
  vi.clearAllMocks()
  auth.mockResolvedValue({ userId: 'buyer-1' })
  CustomPrintRequest.findOne.mockResolvedValue({ requestId: 'request-1', status: 'quoted', updatedAt: new Date('2026-09-22T00:00:00Z') })
  CustomPrintRequest.findOneAndUpdate.mockResolvedValue({ requestId: 'request-1', status: 'configured', toObject: () => ({}) })
})

describe('saved print configuration', () => {
  it('requires authentication and request ownership', async () => {
    auth.mockResolvedValueOnce({})
    expect((await put(base())).status).toBe(401)
    expect(CustomPrintRequest.findOne).not.toHaveBeenCalled()
    CustomPrintRequest.findOne.mockResolvedValueOnce(null)
    expect((await put(base())).status).toBe(404)
    expect(CustomPrintRequest.findOne).toHaveBeenCalledWith({ requestId: 'request-1', userId: 'buyer-1' })
  })
  it.each(['payment_pending', 'paid', 'printing', 'printed', 'shipped', 'delivered', 'cancelled'])('locks %s requests', async status => {
    CustomPrintRequest.findOne.mockResolvedValueOnce({ status })
    expect((await put(base())).status).toBe(409)
    expect(CustomPrintRequest.findOneAndUpdate).not.toHaveBeenCalled()
  })
  it.each([{ status: 'configured', paidAt: new Date() }, { status: 'configured', source: 'product' },
    { status: 'configured', stripeSessionId: 'cs_pending' }, { status: 'configured', stripePaymentIntentId: 'pi_pending' },
    { status: 'configured', creatorUserId: 'creator' }])('does not bypass protected request type %j', async request => {
    CustomPrintRequest.findOne.mockResolvedValueOnce(request)
    expect((await put(base())).status).toBe(409)
    expect(CustomPrintRequest.findOneAndUpdate).not.toHaveBeenCalled()
  })
  it('guards the atomic write against concurrent payment and clears the previous instant price', async () => {
    expect((await put(base())).status).toBe(200)
    const [filter, update, options] = CustomPrintRequest.findOneAndUpdate.mock.calls[0]
    expect(filter.status.$in).not.toContain('payment_pending')
    expect(filter.paidAt).toBeNull()
    expect(filter.updatedAt).toEqual(new Date('2026-09-22T00:00:00Z'))
    expect(update.$unset).toEqual({ quote: 1, quotedAt: 1 })
    expect(update.$set.status).toBe('configured')
    expect(update.$set.printConfiguration.printSettings.wallLoops).toBe(4)
    expect(update.$set.printConfiguration.meshColors.Model).toBe('#ffffff')
    expect(options.runValidators).toBe(true)
  })
  it('reports a concurrent edit or payment transition rather than overwriting it', async () => {
    CustomPrintRequest.findOneAndUpdate.mockResolvedValueOnce(null)
    expect((await put(base())).status).toBe(409)
  })
  it('does not mark a reviewed material instantly payable', async () => {
    const body = base()
    body.printSettings.materialType = 'metal'; body.generic.material = 'metal'
    expect((await put(body)).status).toBe(400)
    expect(CustomPrintRequest.findOneAndUpdate).not.toHaveBeenCalled()
  })
  it('validates values before any update', async () => {
    const body = base(); body.printSettings.sparseInfillDensity = -100
    expect((await put(body)).status).toBe(400)
    expect(CustomPrintRequest.findOneAndUpdate).not.toHaveBeenCalled()
  })
})
