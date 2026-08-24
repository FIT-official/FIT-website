import { describe, it, expect, vi, beforeEach } from 'vitest'

// Boundary mocks (repo convention: mock Clerk/Mongoose at the edges)
vi.mock('@/lib/authenticate', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, authenticate: vi.fn() }
})
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/models/User', () => ({ default: { findOne: vi.fn() } }))
vi.mock('@/models/CustomPrintRequest', () => ({ default: { findOne: vi.fn() } }))

import { authenticate, UnauthorizedError } from '@/lib/authenticate'
import User from '@/models/User'
import CustomPrintRequest from '@/models/CustomPrintRequest'
import { POST } from '@/app/api/cart/custom-print/route'

const OWNER = 'user_owner'

function makeUser() {
  return { userId: OWNER, cart: [], save: vi.fn().mockResolvedValue(undefined) }
}

function makeRequestDoc(overrides = {}) {
  return {
    requestId: 'b1ffcd1c-0000-4000-8000-000000000001',
    userId: OWNER,
    status: 'quoted',
    basePrice: 5,
    printFee: 0,
    quoteMode: 'instant',
    quote: { total: 42.5 },
    delivery: { deliveryTypes: [{ type: 'pickup', price: 0 }] },
    ...overrides,
  }
}

function post(body) {
  return POST({ json: async () => body })
}

beforeEach(() => {
  vi.clearAllMocks()
  authenticate.mockResolvedValue({ userId: OWNER })
  User.findOne.mockResolvedValue(makeUser())
})

describe('POST /api/cart/custom-print', () => {
  it('rejects unauthenticated callers', async () => {
    authenticate.mockRejectedValue(new UnauthorizedError())
    const res = await post({ requestId: 'anything' })
    expect(res.status).toBe(401)
  })

  it('scopes the request lookup to the authenticated owner', async () => {
    CustomPrintRequest.findOne.mockResolvedValue(makeRequestDoc())
    await post({ requestId: 'some-request-id' })
    expect(CustomPrintRequest.findOne).toHaveBeenCalledWith({
      requestId: 'some-request-id',
      userId: OWNER,
    })
  })

  it("answers a foreign/unknown request with 404 and leaves the cart unchanged", async () => {
    // Ownership-scoped query: a foreign requestId simply finds nothing.
    CustomPrintRequest.findOne.mockResolvedValue(null)
    const user = makeUser()
    User.findOne.mockResolvedValue(user)
    const res = await post({ requestId: 'someone-elses-request' })
    expect(res.status).toBe(404)
    expect(user.cart).toHaveLength(0)
    expect(user.save).not.toHaveBeenCalled()
  })

  it('adds an owned instant-quoted request priced at quote.total', async () => {
    const user = makeUser()
    const doc = makeRequestDoc()
    User.findOne.mockResolvedValue(user)
    CustomPrintRequest.findOne.mockResolvedValue(doc)
    const res = await post({ requestId: doc.requestId })
    expect(res.status).toBe(200)
    expect(user.cart).toHaveLength(1)
    expect(user.cart[0]).toMatchObject({
      productId: `custom-print:${doc.requestId}`,
      requestId: doc.requestId,
      price: 42.5, // quote.total, not basePrice + printFee
    })
    expect(user.save).toHaveBeenCalled()
  })

  it('prices a manual-quoted request at basePrice + printFee', async () => {
    const user = makeUser()
    const doc = makeRequestDoc({ quoteMode: 'manual', quote: null, basePrice: 10, printFee: 25 })
    User.findOne.mockResolvedValue(user)
    CustomPrintRequest.findOne.mockResolvedValue(doc)
    await post({ requestId: doc.requestId })
    expect(user.cart[0].price).toBe(35)
  })

  it('does not leak internal error details on failure', async () => {
    CustomPrintRequest.findOne.mockRejectedValue(
      Object.assign(new Error('boom'), { errors: { secretPath: { message: 'internal' } } }),
    )
    const res = await post({ requestId: 'x' })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.details).toBeUndefined()
  })
})
