// Creator print-farm jobs never become payable through Fix It Today:
// the generic cart POST refuses custom-print lines (only
// /api/cart/custom-print may add them, and it refuses creator jobs), and the
// admin quote action refuses creator requests.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ userId: 'user_1', admin: true, user: null, request: null }))

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: state.userId })) }))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn(async () => {}) }))
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: vi.fn(async () => state.admin) }))
vi.mock('@/models/User', () => ({ default: { findOne: vi.fn(async () => state.user) } }))
vi.mock('@/models/Product', () => ({ default: { findOne: vi.fn(() => ({ lean: async () => null })) } }))
vi.mock('@/models/AppSettings', () => ({ default: { findById: vi.fn(() => ({ lean: async () => null })) } }))
vi.mock('@/models/CustomPrintRequest', () => ({ default: { findOne: vi.fn(async () => state.request) } }))
vi.mock('@/lib/notifications/customPrint', () => ({ notifyCustomPrintEvent: vi.fn() }))
vi.mock('@/lib/creatorPrintService/creatorNames', () => ({ withCreatorDisplayNames: vi.fn(async (r) => r) }))

import { POST as cartPOST } from '@/app/api/user/cart/route'
import { PUT as adminPUT } from '@/app/api/admin/custom-print-requests/route'

const req = (body, method = 'POST') => new Request('http://t/api', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

beforeEach(() => {
    vi.clearAllMocks()
    state.userId = 'user_1'
    state.admin = true
    state.user = { userId: 'user_1', cart: [], save: vi.fn() }
    state.request = null
})

describe('POST /api/user/cart', () => {
    it('refuses custom-print lines so only the print request flow can add them', async () => {
        const res = await cartPOST(req({ cartItem: { productId: 'custom-print:req-1', quantity: 1, chosenDeliveryType: 'pickup' } }))
        expect(res.status).toBe(409)
        expect(await res.json()).toEqual({ error: 'Use Add to cart on the print request page.' })
        expect(state.user.save).not.toHaveBeenCalled()
    })
})

describe('admin quote action', () => {
    it('refuses to quote a creator print-farm request', async () => {
        const doc = { requestId: 'req-1', creatorUserId: 'creator-1', status: 'configured', statusHistory: [], save: vi.fn() }
        state.request = doc
        const res = await adminPUT(req({ requestId: 'req-1', action: 'quote', quoteAmount: 20 }, 'PUT'))
        expect(res.status).toBe(409)
        expect(doc.save).not.toHaveBeenCalled()
        expect(doc.status).toBe('configured')
    })
})
