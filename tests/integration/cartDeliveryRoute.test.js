import { describe, it, expect, vi, beforeEach } from 'vitest'

// Boundary mocks (repo convention: mock Clerk/Mongoose at the edges)
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/models/User', () => ({ default: { findOne: vi.fn() } }))
vi.mock('@/models/Product', () => ({ default: { findById: vi.fn() } }))
vi.mock('@/models/CustomPrintRequest', () => ({ default: { findOne: vi.fn() } }))

import { auth } from '@clerk/nextjs/server'
import User from '@/models/User'
import Product from '@/models/Product'
import CustomPrintRequest from '@/models/CustomPrintRequest'
import { PUT } from '@/app/api/user/cart/delivery/route'

const USER_ID = 'user_1'

function makeUser(cart) {
  return { userId: USER_ID, cart, save: vi.fn().mockResolvedValue(undefined) }
}

function put(body) {
  return PUT({ json: async () => body })
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.mockResolvedValue({ userId: USER_ID })
})

// Mongoose query builder: `Model.findOne(...)`/`findById(...)` returns a
// chainable query object; `.lean()` resolves it. Mock that shape.
function leanQuery(result) {
  return { lean: vi.fn().mockResolvedValue(result) }
}

describe('PUT /api/user/cart/delivery', () => {
  it('rejects an unknown chosenDeliveryType and leaves the cart item unchanged', async () => {
    const cartItem = { productId: 'p1', variantId: null, selectedVariants: {}, chosenDeliveryType: 'standard' }
    const user = makeUser([cartItem])
    User.findOne.mockResolvedValue(user)
    Product.findById.mockReturnValue(leanQuery({
      _id: 'p1',
      delivery: { deliveryTypes: [{ type: 'standard', price: 5 }, { type: 'express', price: 12 }] },
    }))

    const res = await put({ productId: 'p1', variantId: null, chosenDeliveryType: 'free-shipping' })

    expect(res.status).toBe(400)
    expect(cartItem.chosenDeliveryType).toBe('standard')
    expect(user.save).not.toHaveBeenCalled()
  })

  it('accepts a known chosenDeliveryType and persists it', async () => {
    const cartItem = { productId: 'p1', variantId: null, selectedVariants: {}, chosenDeliveryType: 'standard' }
    const user = makeUser([cartItem])
    User.findOne.mockResolvedValue(user)
    Product.findById.mockReturnValue(leanQuery({
      _id: 'p1',
      delivery: { deliveryTypes: [{ type: 'standard', price: 5 }, { type: 'express', price: 12 }] },
    }))

    const res = await put({ productId: 'p1', variantId: null, chosenDeliveryType: 'express' })

    expect(res.status).toBe(200)
    expect(cartItem.chosenDeliveryType).toBe('express')
    expect(user.save).toHaveBeenCalled()
  })

  it('validates a custom-print cart item against the CustomPrintRequest delivery types, not Product', async () => {
    const cartItem = {
      productId: 'custom-print:req-1',
      variantId: null,
      selectedVariants: {},
      chosenDeliveryType: 'pickup',
    }
    const user = makeUser([cartItem])
    User.findOne.mockResolvedValue(user)
    CustomPrintRequest.findOne.mockReturnValue(leanQuery({
      requestId: 'req-1',
      delivery: { deliveryTypes: [{ type: 'pickup', price: 0 }] },
    }))

    const res = await put({ productId: 'custom-print:req-1', chosenDeliveryType: 'courier' })

    expect(res.status).toBe(400)
    expect(cartItem.chosenDeliveryType).toBe('pickup')
    expect(user.save).not.toHaveBeenCalled()
  })
})
