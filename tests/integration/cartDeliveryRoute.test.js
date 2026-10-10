import { describe, it, expect, vi, beforeEach } from 'vitest'

// Boundary mocks (repo convention: mock Clerk/Mongoose at the edges)
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/lib/checkoutDiscounts', () => ({ checkoutDiscountRules: async () => [] }))
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
  it('counts the entire mixed-method order and returns one combined Standard price', async () => {
    const user = makeUser(['standard-shipping', 'pick-up', 'express-courier'].map((type, i) => ({ productId: `p${i}`, quantity: 1, chosenDeliveryType: type })));
    User.findOne.mockResolvedValue(user);
    Product.findById.mockImplementation(id => leanQuery({ _id: id, productType: 'shop', slug: 'hcsr04-ultrasonic-sensor',
      basePrice: { presentmentAmount: 75, presentmentCurrency: 'SGD' },
      delivery: { deliveryTypes: [{ type: 'standard-shipping', price: 999 }, { type: 'express-courier', price: 30 }, { type: 'pick-up', price: 0 }] } }));
    const response = await put({ productId: 'p1', chosenDeliveryType: 'standard-shipping', subtotalCents: 1 });
    expect(response.status).toBe(200);
    const { cartBreakdown } = await response.json();
    expect(cartBreakdown.map(line => line.deliveryFee)).toEqual([0, 0, 30]);
    expect(cartBreakdown.map(line => line.freeDeliveryApplied)).toEqual([true, true, false]);
  });
  it.each([[205, 200, 6.2], [205.01, 200.01, 0]])('reprices the full cart after a S$5 discount on %s and ignores browser amounts', async (base, price, fee) => {
    const cartItem = { productId: 'p1', quantity: 1, chosenDeliveryType: 'pick-up', price: 9999, deliveryFee: 0 };
    const user = makeUser([cartItem]);
    User.findOne.mockResolvedValue(user);
    Product.findById.mockReturnValue(leanQuery({ _id: 'p1', productType: 'shop', slug: 'hcsr04-ultrasonic-sensor',
      basePrice: { presentmentAmount: base, presentmentCurrency: 'SGD' }, discounts: [{ percentage: 5 / base * 100 }],
      delivery: { deliveryTypes: [{ type: 'standard-shipping', price: 999 }, { type: 'pick-up', price: 0 }] } }));
    const response = await put({ productId: 'p1', chosenDeliveryType: 'standard-shipping', price: 9999, subtotalCents: 99999, deliveryFee: 0 });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ cartBreakdown: [{ price, deliveryFee: fee, freeDeliveryApplied: fee === 0 }] });
    expect(user.save).toHaveBeenCalledOnce();
  });
  it('refuses a standard selection when the proposed combined parcel is over 30 kg', async () => {
    const cartItem = { productId: 'p1', quantity: 1, chosenDeliveryType: 'pick-up' };
    const user = makeUser([cartItem, { productId: 'p2', quantity: 1, chosenDeliveryType: 'standard-shipping' }]);
    User.findOne.mockResolvedValue(user);
    Product.findById.mockReturnValue(leanQuery({ _id: 'p1', basePrice: { presentmentAmount: 150, presentmentCurrency: 'SGD' }, productType: 'shop', listing: 'fit', shippingWeightG: 16000,
      shippingDims: { L: 100, W: 100, H: 100 }, delivery: { deliveryTypes: [{ type: 'standard-shipping', price: 6.2 }, { type: 'pick-up', price: 0 }] } }));
    const response = await put({ productId: 'p1', chosenDeliveryType: 'standard-shipping' });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'Contact us for a delivery quote' });
    expect(user.save).not.toHaveBeenCalled();
    expect(cartItem.chosenDeliveryType).toBe('pick-up');
    expect((await put({ productId: 'p1', chosenDeliveryType: 'pick-up' })).status).toBe(200);
  });
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
