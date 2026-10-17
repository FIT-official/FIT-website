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
  auth: vi.fn(),
  clerkClient: vi.fn(),
  connectToDatabase: vi.fn(),
  hasCurrentAcceptance: vi.fn(),
  productCreate: vi.fn(),
  productFindOne: vi.fn(),
  productFindById: vi.fn(),
  reserveCreatorQuota: vi.fn(),
  userFindOneAndUpdate: vi.fn(),
  editableProduct: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: mocks.auth,
  clerkClient: mocks.clerkClient,
}))

vi.mock('@/lib/db', () => ({
  connectToDatabase: mocks.connectToDatabase,
}))

vi.mock('@/lib/termsAcceptance', () => ({
  hasCurrentAcceptance: mocks.hasCurrentAcceptance,
}))

vi.mock('@/models/Product', () => ({
  default: {
    create: mocks.productCreate,
    findOne: mocks.productFindOne,
    findById: mocks.productFindById,
  },
}))

vi.mock('@/models/User', () => ({
  default: {
    findOneAndUpdate: mocks.userFindOneAndUpdate,
  },
}))

vi.mock('@/lib/productAccess', () => ({
  editableProduct: mocks.editableProduct,
  productForViewer: vi.fn(),
}))

vi.mock('@/app/api/product/slugify', () => ({
  slugify: value =>
    value.toLowerCase().replace(/\s+/g, '-'),
}))

vi.mock('@/utils/validate', () => ({
  sanitizeString: value => String(value),
}))

vi.mock('@/lib/categoriesHelper', () => ({
  getAllCategoriesServer: vi.fn(),
  getAllSubcategoriesServer: vi.fn(),
}))

vi.mock('@/lib/productCatalogue', () => ({
  literalCategoryFilter: vi.fn(),
}))

vi.mock('@aws-sdk/client-s3', () => ({
  DeleteObjectCommand: class DeleteObjectCommand {},
}))

vi.mock('@/lib/s3', () => ({
  s3: {
    send: vi.fn(),
  },
}))

vi.mock('@/lib/creatorQuota', () => ({
  reserveCreatorQuota: mocks.reserveCreatorQuota,
  releaseProductQuota: vi.fn(),
  CreatorQuotaError: class CreatorQuotaError extends Error {},
}))

vi.mock('@/lib/shopShipping', () => ({
  shippingCostsInput: vi.fn(),
}))

import { POST } from '@/app/api/product/route'

const productInput = {
  name: 'Example printer model',
  description: 'Test description',
  images: ['images/user-creator/example.png'],
  paidAssets: [],
  basePrice: {
    presentmentAmount: 10,
    presentmentCurrency: 'SGD',
  },
  priceCredits: 0,
  productType: 'print',
}

function request() {
  return new Request(
    'https://fixitoday.com/api/product',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(productInput),
    }
  )
}

function assertNoProductWrite() {
  expect(mocks.productCreate).not.toHaveBeenCalled()
  expect(
    mocks.reserveCreatorQuota
  ).not.toHaveBeenCalled()
  expect(
    mocks.userFindOneAndUpdate
  ).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.resetAllMocks()

  vi.stubEnv(
    'CREATOR_TERMS_ACCEPTANCE_ENABLED',
    'true'
  )

  mocks.auth.mockResolvedValue({
    userId: 'user-creator',
  })

  mocks.connectToDatabase.mockResolvedValue({})

  mocks.hasCurrentAcceptance.mockResolvedValue(false)

  mocks.editableProduct.mockImplementation(
    input => ({
      ...input,
    })
  )

  mocks.productFindOne.mockResolvedValue(null)

  mocks.clerkClient.mockResolvedValue({
    users: {
      getUser: vi.fn().mockResolvedValue({
        publicMetadata: {
          role: 'creator',
        },
      }),
    },
  })

  mocks.reserveCreatorQuota.mockResolvedValue({
    release: vi.fn(),
  })

  mocks.productCreate.mockResolvedValue({
    _id: 'product-test',
    ...productInput,
  })

  mocks.userFindOneAndUpdate.mockResolvedValue({})
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Creator Terms product gate', () => {
  it('rejects missing creator acceptance with HTTP 403', async () => {
    const response = await POST(request())

    expect(response.status).toBe(403)

    expect(await response.json()).toMatchObject({
      code: 'creator_terms_required',
    })

    expect(
      mocks.hasCurrentAcceptance
    ).toHaveBeenCalledWith(
      'user-creator',
      'creator'
    )

    expect(
      mocks.editableProduct
    ).not.toHaveBeenCalled()

    assertNoProductWrite()
  })

  it('fails closed when acceptance lookup fails', async () => {
    mocks.hasCurrentAcceptance.mockRejectedValue(
      new Error('Mongo unavailable')
    )

    const response = await POST(request())

    expect(response.status).toBe(500)

    assertNoProductWrite()
  })

  it('permits product creation after current acceptance', async () => {
    mocks.hasCurrentAcceptance.mockResolvedValue(true)

    const response = await POST(request())

    expect(response.status).toBe(201)

    expect(
      mocks.hasCurrentAcceptance
    ).toHaveBeenCalledWith(
      'user-creator',
      'creator'
    )

    expect(
      mocks.productCreate
    ).toHaveBeenCalledOnce()

    expect(
      mocks.reserveCreatorQuota
    ).toHaveBeenCalledOnce()
  })

  it('ignores client-supplied acceptance metadata', async () => {
    const response = await POST(
      new Request(
        'https://fixitoday.com/api/product',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...productInput,
            termsAccepted: true,
            termsVersion:
              'Version 1.0, 18 October 2026',
          }),
        }
      )
    )

    expect(response.status).toBe(403)
    assertNoProductWrite()
  })

  it('preserves flag-OFF product creation', async () => {
    vi.stubEnv(
      'CREATOR_TERMS_ACCEPTANCE_ENABLED',
      ''
    )

    const response = await POST(request())

    expect(response.status).toBe(201)

    expect(
      mocks.hasCurrentAcceptance
    ).not.toHaveBeenCalled()

    expect(
      mocks.productCreate
    ).toHaveBeenCalledOnce()
  })

  it('does not allow unauthenticated product creation', async () => {
    mocks.auth.mockResolvedValue({
      userId: null,
    })

    const response = await POST(request())

    expect(response.status).toBe(401)

    expect(
      mocks.hasCurrentAcceptance
    ).not.toHaveBeenCalled()

    assertNoProductWrite()
  })
})
