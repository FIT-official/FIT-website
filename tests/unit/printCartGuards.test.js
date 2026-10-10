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

describe('guided enquiry internal review',()=>{
  const guided=()=>({requestId:'guided-test',status:'configured',basePrice:10,guidedBrief:{version:1},guidedFingerprint:'fp',statusHistory:[],save:vi.fn(),toObject(){return {...this}}})
  it.each(['quote','status'])('rejects %s before exact-file and permission review',async action=>{
    state.request=guided();const response=await adminPUT(req({requestId:'guided-test',action,status:'paid',quoteAmount:20},'PUT'))
    expect(response.status).toBe(409);expect(state.request.save).not.toHaveBeenCalled()
  })
  it('requires staff privileges even when the client forges an approved review',async()=>{
    state.admin=false;state.request=guided();expect((await adminPUT(req({requestId:'guided-test',action:'quote',quoteAmount:20,guidedReview:{status:'approved'}},'PUT'))).status).toBe(403)
    expect(state.request.save).not.toHaveBeenCalled()
  })
  it('binds the approval to the complete immutable brief and staff identity',async()=>{
    state.request=guided();const response=await adminPUT(req({requestId:'guided-test',action:'quote',quoteAmount:20,guidedReview:{fingerprint:'fp',exactFile:'box-v2.stl sha256:fixture',licenceEvidence:'Written permission for this paid printing job, checked against file',scopeConfirmed:true,reviewedBy:'forged'}},'PUT'))
    expect(response.status).toBe(200);expect(state.request.guidedReview).toMatchObject({status:'approved',fingerprint:'fp',reviewedBy:'user_1'});expect(state.request.quoteMode).toBe('manual')
  })
  it('refuses a stale brief fingerprint and a payment already in progress',async()=>{
    state.request=guided();const input={requestId:'guided-test',action:'quote',quoteAmount:20,guidedReview:{fingerprint:'old',exactFile:'model.stl',licenceEvidence:'Permission confirmed for printing',scopeConfirmed:true}}
    expect((await adminPUT(req(input,'PUT'))).status).toBe(409);state.request.stripeSessionId='session-fixture';input.guidedReview.fingerprint='fp'
    expect((await adminPUT(req(input,'PUT'))).status).toBe(409);expect(state.request.save).not.toHaveBeenCalled()
  })
})
it('rejects an unreviewed guided request at the cart entry point', async () => {
    const { POST } = await import('@/app/api/cart/custom-print/route')
    state.request={requestId:'guided-test',userId:'user_1',status:'quoted',guidedBrief:{version:1},guidedReview:{status:'pending'}}
    expect((await POST(req({requestId:'guided-test'}))).status).toBe(409)
    expect(state.user.save).not.toHaveBeenCalled();expect(state.user.cart).toEqual([])
})
