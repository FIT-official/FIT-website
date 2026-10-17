/* @vitest-environment node */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'

const mocks = vi.hoisted(() => ({
  cartIdentity: vi.fn(),
  cartOwner: vi.fn(),
  connectToDatabase: vi.fn(),
  findAttempt: vi.fn(),
  resumeAttempt: vi.fn(),
  createAttempt: vi.fn(),
  adoptLegacyAttempt: vi.fn(),
  cancelAttempt: vi.fn(),
  checkoutIntent: vi.fn(),
  checkAcceptance: vi.fn(),
  recordAcceptance: vi.fn(),
  stripeConstructor: vi.fn(),
  verifyCheckoutTransactions: vi.fn(),
  productFindById: vi.fn(),
  calculateCartItemBreakdown: vi.fn(),
  buildCheckoutItem: vi.fn(),
  applyShopShipping: vi.fn(),
}))

vi.mock('stripe', () => ({
  default: class MockStripe {
    constructor(...args) {
      mocks.stripeConstructor(...args)
    }
  },
}))

vi.mock('@/lib/cartOwner', () => ({
  cartIdentity: mocks.cartIdentity,
  cartOwner: mocks.cartOwner,
}))

vi.mock('@/lib/db', () => ({
  connectToDatabase: mocks.connectToDatabase,
}))

vi.mock('@/lib/checkoutAttempt', () => ({
  checkoutIntent: mocks.checkoutIntent,
  findAttempt: mocks.findAttempt,
  resumeAttempt: mocks.resumeAttempt,
  createAttempt: mocks.createAttempt,
  adoptLegacyAttempt: mocks.adoptLegacyAttempt,
  cancelAttempt: mocks.cancelAttempt,
  CheckoutAttemptError: class CheckoutAttemptError extends Error {
    constructor(message, code, status) {
      super(message)
      this.code = code
      this.status = status
    }
  },
}))

vi.mock('@/lib/checkoutTransactionReadiness', () => ({
  verifyCheckoutTransactions:
    mocks.verifyCheckoutTransactions,
  CheckoutTransactionUnavailableError:
    class CheckoutTransactionUnavailableError extends Error {},
}))

vi.mock('@/lib/termsAcceptance', () => ({
  checkAcceptance: mocks.checkAcceptance,
  recordAcceptance: mocks.recordAcceptance,
}))

vi.mock('@/lib/shopBackorders/host', () => ({
  backordersEnabled: () => false,
}))

vi.mock('@/lib/shopBackorders/policy', () => ({
  BackorderError: class BackorderError extends Error {},
  trackedShopLine: () => false,
}))

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(),
}))

vi.mock('@/models/Product', () => ({
  default: {
    findById: mocks.productFindById,
  },
}))

vi.mock('@/models/CustomPrintRequest', () => ({
  default: {},
}))

vi.mock('@/lib/checkoutDiscounts', () => ({
  checkoutDiscountRules: vi.fn(async () => []),
}))

vi.mock('@/lib/shopShipping', () => ({
  applyShopShipping: mocks.applyShopShipping,
}))

vi.mock('@/lib/shipping/weightTiers', () => ({
  DELIVERY_QUOTE_MESSAGE: 'Delivery quote required.',
}))

vi.mock('@/lib/checkoutAddressGate', () => ({
  isAddressComplete: () => true,
  lineNeedsDeliveryAddress: () => false,
  pickDeliveryOptionMessage: () => 'Invalid delivery option.',
}))

vi.mock('@/lib/customPrint/guidedBrief', () => ({
  guidedPaymentIssue: vi.fn(),
}))

vi.mock('@/lib/customPrintDisplayPrice', () => ({
  customPrintChargeBreakdown: vi.fn(),
}))

vi.mock('@/lib/customPrint/productRequest', () => ({
  buildProductPrintRequestInput: vi.fn(),
  colourNameFromVariants: vi.fn(),
}))

vi.mock('@/lib/checkoutSnapshot', () => ({
  checkoutPlain: value => value,
  buildCheckoutItem: mocks.buildCheckoutItem,
}))

vi.mock('@/lib/checkPrivileges', () => ({
  checkAdminPrivileges: vi.fn(),
}))

vi.mock('@/lib/filamentInventory', () => ({
  getFilamentAvailability: vi.fn(),
  rushAvailability: vi.fn(),
}))

vi.mock('@/lib/storeDeadline', () => ({
  storeDeadline: promise => promise,
}))

vi.mock('@/app/api/checkout/calculateBreakdown', () => ({
  calculateCartItemBreakdown:
    mocks.calculateCartItemBreakdown,
}))

import { POST } from '@/app/api/checkout/session/route'

const ATTEMPT_ID =
  '12345678-1234-4123-8123-123456789abc'

const VERSION =
  'Version 1.0, 18 October 2026'

function request({
  termsVersion,
  attemptId,
} = {}) {
  const headers = new Headers()

  if (termsVersion !== undefined) {
    headers.set(
      'X-Terms-Accepted',
      termsVersion
    )
  }

  if (attemptId) {
    headers.set(
      'X-Checkout-Attempt',
      attemptId
    )
  }

  return { headers }
}

function assertNoPaymentOperations() {
  expect(mocks.resumeAttempt).not.toHaveBeenCalled()
  expect(mocks.adoptLegacyAttempt).not.toHaveBeenCalled()
  expect(mocks.createAttempt).not.toHaveBeenCalled()
  expect(mocks.stripeConstructor).not.toHaveBeenCalled()
}

function setUpNewCart() {
  mocks.cartOwner.mockResolvedValue({
    checkoutIntent: null,
    guestContact: {
      name: 'Guest Example',
      email: 'guest@example.com',
      address: {
        street: 'Test Street',
        postalCode: '123456',
        city: 'Singapore',
        country: 'SG',
      },
    },
    cart: [
      {
        productId: 'product-test',
        quantity: 1,
        chosenDeliveryType: 'pickup',
        selectedVariants: {},
      },
    ],
  })

  const product = {
    _id: 'product-test',
    name: 'Test product',
    creatorUserId: 'creator-test',
    listing: 'fit',
    productType: 'shop',
    hidden: false,
    flaggedForModeration: false,
    infiniteStock: true,
    variantTypes: [],
    paidAssets: [],
  }

  mocks.productFindById.mockImplementation(() => ({
    select: () => ({
      lean: async () => product,
    }),
  }))

  mocks.calculateCartItemBreakdown.mockResolvedValue({
    quantity: 1,
    price: 10,
    priceBeforeDiscount: 10,
    basePrice: 10,
    variantInfo: [],
    chosenDeliveryType: 'pickup',
    deliveryFee: 0,
    currency: 'sgd',
  })

  mocks.buildCheckoutItem.mockReturnValue({
    productId: 'product-test',
    productName: 'Test product',
    creatorUserId: 'creator-test',
    quantity: 1,
    unitAmount: 1000,
    deliveryAmount: 0,
    totalAmount: 1000,
    chosenDeliveryType: 'pickup',
    paidAssets: [],
  })

  mocks.adoptLegacyAttempt.mockResolvedValue(null)

  mocks.createAttempt.mockResolvedValue({
    attemptId: ATTEMPT_ID,
    sessionId: 'cs_test_new',
    clientSecret: 'cs_test_secret_mock',
  })
}

beforeEach(() => {
  vi.resetAllMocks()

  vi.stubEnv('TERMS_CHECKBOX_ENABLED', 'true')
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv(
    'STRIPE_SESSION_COMPLETE_SIGNING_SECRET',
    'test-signing-secret'
  )

  mocks.cartIdentity.mockResolvedValue({
    userId: 'guest-test',
    guest: true,
  })

  mocks.cartOwner.mockResolvedValue({
    cart: [],
    checkoutIntent: null,
  })

  mocks.connectToDatabase.mockResolvedValue({})

  mocks.findAttempt.mockResolvedValue(null)

  mocks.checkAcceptance.mockImplementation(input => {
    if (!input?.accepted || !input?.termsVersion) {
      throw Object.assign(
        new Error(
          'Tick the box to agree to the Terms and Conditions.'
        ),
        {
          code: 'terms_required',
          status: 400,
        }
      )
    }

    if (input.termsVersion !== VERSION) {
      throw Object.assign(
        new Error(
          'Our terms were updated. Please review and tick the box again.'
        ),
        {
          code: 'terms_version_changed',
          status: 409,
        }
      )
    }

    return {
      ok: true,
      document: 'customer',
      termsVersion: VERSION,
      sourceSha256: 'a'.repeat(64),
    }
  })

  mocks.recordAcceptance.mockResolvedValue({
    recorded: true,
  })

  mocks.checkoutIntent.mockResolvedValue(ATTEMPT_ID)

  mocks.verifyCheckoutTransactions.mockResolvedValue(
    undefined
  )

  mocks.resumeAttempt.mockResolvedValue({
    attemptId: ATTEMPT_ID,
    sessionId: 'cs_test',
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Checkout session terms enforcement', () => {
  it('rejects missing acceptance before all payment operations', async () => {
    const response = await POST(request())

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      code: 'terms_required',
    })

    expect(mocks.recordAcceptance).not.toHaveBeenCalled()
    assertNoPaymentOperations()
  })

  it('rejects stale acceptance before all payment operations', async () => {
    const response = await POST(
      request({
        termsVersion: 'Version 0.9',
      })
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      code: 'terms_version_changed',
    })

    expect(mocks.recordAcceptance).not.toHaveBeenCalled()
    assertNoPaymentOperations()
  })

  it('blocks explicit attempt resume without acceptance', async () => {
    mocks.findAttempt.mockResolvedValue({
      attemptId: ATTEMPT_ID,
    })

    const response = await POST(
      request({
        attemptId: ATTEMPT_ID,
      })
    )

    expect(response.status).toBe(400)
    expect(mocks.findAttempt).not.toHaveBeenCalled()
    assertNoPaymentOperations()
  })

  it('blocks implicit checkoutIntent resume without acceptance', async () => {
    mocks.cartOwner.mockResolvedValue({
      cart: [],
      checkoutIntent: ATTEMPT_ID,
    })

    const response = await POST(request())

    expect(response.status).toBe(400)
    expect(mocks.findAttempt).not.toHaveBeenCalled()
    assertNoPaymentOperations()
  })

  it('blocks resume when acceptance persistence fails', async () => {
    mocks.findAttempt.mockResolvedValue({
      attemptId: ATTEMPT_ID,
    })

    mocks.recordAcceptance.mockRejectedValue(
      new Error('Mongo unavailable')
    )

    const response = await POST(
      request({
        termsVersion: VERSION,
        attemptId: ATTEMPT_ID,
      })
    )

    expect(response.status).toBe(503)
    expect(mocks.recordAcceptance).toHaveBeenCalledOnce()
    assertNoPaymentOperations()
  })

  it('records acceptance before explicit resume', async () => {
    const order = []

    mocks.findAttempt.mockResolvedValue({
      attemptId: ATTEMPT_ID,
    })

    mocks.recordAcceptance.mockImplementation(
      async () => {
        order.push('acceptance')
      }
    )

    mocks.resumeAttempt.mockImplementation(
      async () => {
        order.push('resume')
        return {
          attemptId: ATTEMPT_ID,
          sessionId: 'cs_test',
        }
      }
    )

    const response = await POST(
      request({
        termsVersion: VERSION,
        attemptId: ATTEMPT_ID,
      })
    )

    expect(response.status).toBe(200)

    expect(mocks.recordAcceptance).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'guest-test',
        context: 'checkout',
        document: 'customer',
        termsVersion: VERSION,
        referenceId: ATTEMPT_ID,
      })
    )

    expect(order).toEqual([
      'acceptance',
      'resume',
    ])

    expect(mocks.createAttempt).not.toHaveBeenCalled()
    expect(mocks.adoptLegacyAttempt).not.toHaveBeenCalled()
  })

  it('records acceptance before implicit checkoutIntent resume', async () => {
    mocks.cartOwner.mockResolvedValue({
      cart: [],
      checkoutIntent: ATTEMPT_ID,
    })

    mocks.findAttempt.mockResolvedValue({
      attemptId: ATTEMPT_ID,
    })

    const response = await POST(
      request({
        termsVersion: VERSION,
      })
    )

    expect(response.status).toBe(200)

    expect(mocks.recordAcceptance).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'checkout',
        document: 'customer',
        referenceId: ATTEMPT_ID,
      })
    )

    expect(mocks.resumeAttempt).toHaveBeenCalledOnce()
  })

  it('preserves flag-OFF resume behaviour', async () => {
    vi.stubEnv('TERMS_CHECKBOX_ENABLED', '')

    mocks.findAttempt.mockResolvedValue({
      attemptId: ATTEMPT_ID,
    })

    const response = await POST(
      request({
        attemptId: ATTEMPT_ID,
      })
    )

    expect(response.status).toBe(200)
    expect(mocks.checkAcceptance).not.toHaveBeenCalled()
    expect(mocks.recordAcceptance).not.toHaveBeenCalled()
    expect(mocks.resumeAttempt).toHaveBeenCalledOnce()
  })

  it('does not instantiate Stripe before valid acceptance', async () => {
    await POST(request())

    assertNoPaymentOperations()
  })

  it('records acceptance before new-cart payment operations when flag ON', async () => {
    setUpNewCart()

    const response = await POST(
      request({
        termsVersion: VERSION,
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      attemptId: ATTEMPT_ID,
      sessionId: 'cs_test_new',
    })

    expect(mocks.checkAcceptance).toHaveBeenCalledOnce()
    expect(mocks.recordAcceptance).toHaveBeenCalledOnce()

    expect(mocks.recordAcceptance).toHaveBeenCalledWith({
      userId: 'guest-test',
      context: 'checkout',
      document: 'customer',
      termsVersion: VERSION,
      referenceId: ATTEMPT_ID,
    })

    expect(mocks.stripeConstructor).toHaveBeenCalledOnce()
    expect(mocks.adoptLegacyAttempt).toHaveBeenCalledOnce()
    expect(mocks.createAttempt).toHaveBeenCalledOnce()

    const acceptanceOrder =
      mocks.recordAcceptance.mock.invocationCallOrder[0]

    expect(acceptanceOrder).toBeLessThan(
      mocks.stripeConstructor.mock.invocationCallOrder[0]
    )

    expect(acceptanceOrder).toBeLessThan(
      mocks.adoptLegacyAttempt.mock.invocationCallOrder[0]
    )

    expect(acceptanceOrder).toBeLessThan(
      mocks.createAttempt.mock.invocationCallOrder[0]
    )

    expect(
      mocks.checkoutIntent
    ).toHaveBeenCalledOnce()

    expect(
      mocks.resumeAttempt
    ).not.toHaveBeenCalled()
  })

  it('creates a new-cart checkout without acceptance when flag OFF', async () => {
    vi.stubEnv('TERMS_CHECKBOX_ENABLED', '')
    setUpNewCart()

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      attemptId: ATTEMPT_ID,
      sessionId: 'cs_test_new',
    })

    expect(mocks.checkAcceptance).not.toHaveBeenCalled()
    expect(mocks.recordAcceptance).not.toHaveBeenCalled()

    expect(mocks.checkoutIntent).toHaveBeenCalledOnce()
    expect(mocks.adoptLegacyAttempt).toHaveBeenCalledOnce()
    expect(mocks.createAttempt).toHaveBeenCalledOnce()
  })
})
