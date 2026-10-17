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
  write: vi.fn(),
  find: vi.fn(),
  stripeCreate: vi.fn(),
}))

vi.mock('@/models/TermsAcceptance', () => ({
  default: {
    findOneAndUpdate: mocks.write,
    findOne: mocks.find,
  },
}))

vi.mock('@/content/legal/customerTermsV1', () => ({
  CUSTOMER_TERMS_VERSION: 'Version 1.0, 18 October 2026',
  CUSTOMER_TERMS_SOURCE_SHA256: 'a'.repeat(64),
}))

vi.mock('@/content/legal/creatorTermsV1', () => ({
  CREATOR_TERMS_VERSION: 'Version 1.0, 18 October 2026',
  CREATOR_TERMS_SOURCE_SHA256: 'b'.repeat(64),
}))

import {
  checkAcceptance,
  currentDocument,
  isAcceptanceEnabled,
  recordAcceptance,
  hasCurrentAcceptance,
} from '@/lib/termsAcceptance'

import {
  isTermsCheckboxEnabled,
  isCreatorTermsAcceptanceEnabled,
} from '@/lib/legalFlags'

const CUSTOMER_VERSION = 'Version 1.0, 18 October 2026'
const CREATOR_VERSION = 'Version 1.0, 18 October 2026'

const customerInput = {
  userId: 'user-test',
  context: 'checkout',
  document: 'customer',
  termsVersion: CUSTOMER_VERSION,
  referenceId: 'attempt-test',
}

const creatorInput = {
  userId: 'creator-test',
  context: 'creator_onboarding',
  document: 'creator',
  termsVersion: CREATOR_VERSION,
  referenceId: 'creator-test',
}

const customerAcceptance = {
  accepted: true,
  termsVersion: CUSTOMER_VERSION,
}

const creatorAcceptance = {
  accepted: true,
  termsVersion: CREATOR_VERSION,
}

// Isolated submission harness.
//
// This checks that acceptance validation and persistence must both
// complete before a downstream Stripe operation is permitted.
//
// The actual checkout route must independently enforce the same
// ordering. These tests do not replace route-level integration tests.
async function submitCheckout({
  acceptance,
  userId = 'user-test',
  referenceId = 'attempt-test',
}) {
  const validated = checkAcceptance(
    acceptance,
    'customer'
  )

  await recordAcceptance({
    userId,
    context: 'checkout',
    document: 'customer',
    termsVersion: validated.termsVersion,
    referenceId,
  })

  return mocks.stripeCreate({
    attemptId: referenceId,
  })
}

beforeEach(() => {
  vi.resetAllMocks()

  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('TERMS_CHECKBOX_ENABLED', '')
  vi.stubEnv('CREATOR_TERMS_ACCEPTANCE_ENABLED', '')

  mocks.write.mockImplementation(
    async (_query, update) => ({
      ...update.$setOnInsert,
    })
  )

  mocks.find.mockResolvedValue(null)

  mocks.stripeCreate.mockResolvedValue({
    id: 'session-test',
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('Legal acceptance feature flags', () => {
  it('defaults both acceptance flags to OFF', () => {
    expect(isTermsCheckboxEnabled()).toBe(false)

    expect(
      isCreatorTermsAcceptanceEnabled()
    ).toBe(false)

    expect(
      isAcceptanceEnabled('customer')
    ).toBe(false)

    expect(
      isAcceptanceEnabled('creator')
    ).toBe(false)
  })

  it('enables customer acceptance only for exact true', () => {
    for (const value of [
      '',
      'TRUE',
      'True',
      '1',
      'yes',
      'false',
    ]) {
      vi.stubEnv('TERMS_CHECKBOX_ENABLED', value)

      expect(isTermsCheckboxEnabled()).toBe(false)
      expect(isAcceptanceEnabled('customer')).toBe(false)
    }

    vi.stubEnv('TERMS_CHECKBOX_ENABLED', 'true')

    expect(isTermsCheckboxEnabled()).toBe(true)
    expect(isAcceptanceEnabled('customer')).toBe(true)

    expect(isAcceptanceEnabled('creator')).toBe(false)
  })

  it('enables creator acceptance only for exact true', () => {
    for (const value of [
      '',
      'TRUE',
      'True',
      '1',
      'yes',
      'false',
    ]) {
      vi.stubEnv(
        'CREATOR_TERMS_ACCEPTANCE_ENABLED',
        value
      )

      expect(
        isCreatorTermsAcceptanceEnabled()
      ).toBe(false)

      expect(
        isAcceptanceEnabled('creator')
      ).toBe(false)
    }

    vi.stubEnv(
      'CREATOR_TERMS_ACCEPTANCE_ENABLED',
      'true'
    )

    expect(
      isCreatorTermsAcceptanceEnabled()
    ).toBe(true)

    expect(isAcceptanceEnabled('creator')).toBe(true)
    expect(isAcceptanceEnabled('customer')).toBe(false)
  })

  it('supports independently enabling both flags', () => {
    vi.stubEnv('TERMS_CHECKBOX_ENABLED', 'true')

    vi.stubEnv(
      'CREATOR_TERMS_ACCEPTANCE_ENABLED',
      'true'
    )

    expect(isAcceptanceEnabled('customer')).toBe(true)
    expect(isAcceptanceEnabled('creator')).toBe(true)
  })

  it('supports explicit environment objects', () => {
    const env = {
      TERMS_CHECKBOX_ENABLED: 'true',
      CREATOR_TERMS_ACCEPTANCE_ENABLED: 'false',
    }

    expect(isAcceptanceEnabled('customer', env)).toBe(true)
    expect(isAcceptanceEnabled('creator', env)).toBe(false)

    expect(
      isCreatorTermsAcceptanceEnabled({
        CREATOR_TERMS_ACCEPTANCE_ENABLED: 'true',
      })
    ).toBe(true)
  })
})

describe('Document metadata', () => {
  it('gets customer version and hash from the module', () => {
    expect(currentDocument('customer')).toEqual({
      document: 'customer',
      version: CUSTOMER_VERSION,
      sourceSha256: 'a'.repeat(64),
    })
  })

  it('gets creator version and hash from the module', () => {
    expect(currentDocument('creator')).toEqual({
      document: 'creator',
      version: CREATOR_VERSION,
      sourceSha256: 'b'.repeat(64),
    })
  })

  it('supports the existing document aliases', () => {
    expect(currentDocument('terms').document).toBe(
      'customer'
    )

    expect(
      currentDocument('creator-terms').document
    ).toBe('creator')
  })

  it('rejects invalid document names', () => {
    expect(() => currentDocument('unknown')).toThrow(
      'Invalid acceptance document'
    )

    expect(() => currentDocument('__proto__')).toThrow(
      'Invalid acceptance document'
    )
  })
})

describe('Acceptance validation', () => {
  it('accepts the current customer version', () => {
    expect(
      checkAcceptance(
        customerAcceptance,
        'customer'
      )
    ).toEqual({
      ok: true,
      document: 'customer',
      termsVersion: CUSTOMER_VERSION,
      sourceSha256: 'a'.repeat(64),
    })
  })

  it('accepts the current creator version', () => {
    expect(
      checkAcceptance(
        creatorAcceptance,
        'creator'
      )
    ).toEqual({
      ok: true,
      document: 'creator',
      termsVersion: CREATOR_VERSION,
      sourceSha256: 'b'.repeat(64),
    })
  })

  it('rejects missing customer acceptance with approved wording', () => {
    expect(() =>
      checkAcceptance(undefined, 'customer')
    ).toThrow(
      'Tick the box to agree to the Terms and Conditions.'
    )

    try {
      checkAcceptance(undefined, 'customer')
    } catch (error) {
      expect(error).toMatchObject({
        code: 'terms_required',
        status: 400,
        statusCode: 400,
      })
    }
  })

  it('rejects missing creator acceptance with approved wording', () => {
    expect(() =>
      checkAcceptance(undefined, 'creator')
    ).toThrow(
      'Tick the box to agree to the Creator Terms.'
    )

    try {
      checkAcceptance(undefined, 'creator')
    } catch (error) {
      expect(error).toMatchObject({
        code: 'terms_required',
        status: 400,
        statusCode: 400,
      })
    }
  })

  it('rejects stale versions with the approved update message', () => {
    expect(() =>
      checkAcceptance(
        {
          accepted: true,
          termsVersion: 'outdated',
        },
        'customer'
      )
    ).toThrow(
      'Our terms were updated. Please review and tick the box again.'
    )

    let thrown

    try {
      checkAcceptance(
        {
          accepted: true,
          termsVersion: 'outdated',
        },
        'customer'
      )
    } catch (error) {
      thrown = error
    }

    expect(thrown).toMatchObject({
      code: 'terms_version_changed',
      status: 409,
      statusCode: 409,
    })
  })

  it('rejects stale creator versions', () => {
    let thrown

    try {
      checkAcceptance(
        {
          accepted: true,
          termsVersion: 'outdated',
        },
        'creator'
      )
    } catch (error) {
      thrown = error
    }

    expect(thrown).toMatchObject({
      code: 'terms_version_changed',
      status: 409,
    })
  })

  it('rejects false acceptance', () => {
    expect(() =>
      checkAcceptance(
        {
          accepted: false,
          termsVersion: CUSTOMER_VERSION,
        },
        'customer'
      )
    ).toThrow(
      'Tick the box to agree to the Terms and Conditions.'
    )
  })

  it('rejects unexpected client-supplied metadata', () => {
    expect(() =>
      checkAcceptance(
        {
          ...customerAcceptance,
          acceptedAt: '2001-01-01T00:00:00.000Z',
        },
        'customer'
      )
    ).toThrow()

    expect(() =>
      checkAcceptance(
        {
          ...customerAcceptance,
          userId: 'someone-else',
        },
        'customer'
      )
    ).toThrow()

    expect(() =>
      checkAcceptance(
        {
          ...customerAcceptance,
          sourceSha256: 'f'.repeat(64),
        },
        'customer'
      )
    ).toThrow()
  })
})

describe('Acceptance persistence', () => {
  it('writes exact customer metadata and identity', async () => {
    const result = await recordAcceptance(customerInput)

    expect(mocks.write).toHaveBeenCalledOnce()

    const [query, update, options] =
      mocks.write.mock.calls[0]

    expect(query).toEqual({
      userId: 'user-test',
      context: 'checkout',
      referenceId: 'attempt-test',
      document: 'customer',
      termsVersion: CUSTOMER_VERSION,
      sourceSha256: 'a'.repeat(64),
    })

    expect(update.$setOnInsert).toMatchObject(query)

    expect(
      update.$setOnInsert.acceptedAt
    ).toBeInstanceOf(Date)

    expect(options).toMatchObject({
      upsert: true,
      new: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    })

    expect(result).toMatchObject({
      recorded: true,
      document: 'customer',
      termsVersion: CUSTOMER_VERSION,
      sourceSha256: 'a'.repeat(64),
      userId: 'user-test',
      referenceId: 'attempt-test',
    })
  })

  it('writes exact creator metadata and identity', async () => {
    const result = await recordAcceptance(creatorInput)

    const [query, update] = mocks.write.mock.calls[0]

    expect(query).toEqual({
      userId: 'creator-test',
      context: 'creator_onboarding',
      referenceId: 'creator-test',
      document: 'creator',
      termsVersion: CREATOR_VERSION,
      sourceSha256: 'b'.repeat(64),
    })

    expect(update.$setOnInsert).toMatchObject(query)

    expect(result).toMatchObject({
      recorded: true,
      document: 'creator',
      termsVersion: CREATOR_VERSION,
      sourceSha256: 'b'.repeat(64),
    })
  })

  it('generates an ISO 8601 UTC timestamp on the server', async () => {
    vi.useFakeTimers()

    vi.setSystemTime(
      new Date('2026-10-17T10:00:00.000Z')
    )

    const result = await recordAcceptance({
      ...customerInput,
      acceptedAt: '2001-01-01T00:00:00.000Z',
    })

    const stored =
      mocks.write.mock.calls[0][1]
        .$setOnInsert.acceptedAt

    expect(stored).toBeInstanceOf(Date)

    expect(stored.toISOString()).toBe(
      '2026-10-17T10:00:00.000Z'
    )

    expect(result.acceptedAt).toBe(
      '2026-10-17T10:00:00.000Z'
    )

    expect(result.acceptedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    )
  })

  it('rejects invalid identities and references', async () => {
    await expect(
      recordAcceptance({
        ...customerInput,
        userId: '',
      })
    ).rejects.toMatchObject({
      code: 'invalid_identity',
      status: 401,
    })

    await expect(
      recordAcceptance({
        ...customerInput,
        referenceId: '',
      })
    ).rejects.toMatchObject({
      code: 'invalid_reference',
      status: 400,
    })

    expect(mocks.write).not.toHaveBeenCalled()
  })

  it('fails closed when Mongo fails', async () => {
    mocks.write.mockRejectedValue(
      new Error('database unavailable')
    )

    await expect(
      recordAcceptance(customerInput)
    ).rejects.toThrow('database unavailable')
  })

  it('does not write acceptance on Vercel preview', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')

    await expect(
      recordAcceptance(customerInput)
    ).rejects.toMatchObject({
      code: 'preview_read_only',
      status: 503,
    })

    expect(mocks.write).not.toHaveBeenCalled()
  })

  it('preserves the original timestamp on retry', async () => {
    const original = new Date(
      '2026-10-17T09:00:00.000Z'
    )

    mocks.write.mockResolvedValue({
      ...customerInput,
      sourceSha256: 'a'.repeat(64),
      acceptedAt: original,
    })

    const first = await recordAcceptance(
      customerInput
    )

    const second = await recordAcceptance(
      customerInput
    )

    expect(first.acceptedAt).toBe(
      original.toISOString()
    )

    expect(second.acceptedAt).toBe(
      original.toISOString()
    )

    expect(
      mocks.write.mock.calls[0][0]
    ).toEqual(
      mocks.write.mock.calls[1][0]
    )

    expect(
      mocks.write.mock.calls[0][1]
    ).toHaveProperty('$setOnInsert')

    expect(
      mocks.write.mock.calls[1][1]
    ).toHaveProperty('$setOnInsert')
  })

  it('recovers a concurrent duplicate insert', async () => {
    const existing = {
      acceptedAt: new Date(
        '2026-10-17T09:00:00.000Z'
      ),
    }

    mocks.write.mockRejectedValue({
      code: 11000,
    })

    mocks.find.mockResolvedValue(existing)

    const result = await recordAcceptance(
      customerInput
    )

    expect(result.recorded).toBe(true)
    expect(mocks.find).toHaveBeenCalledOnce()

    expect(result.acceptedAt).toBe(
      existing.acceptedAt.toISOString()
    )
  })

  it('fails if a duplicate insert cannot be recovered', async () => {
    mocks.write.mockRejectedValue({
      code: 11000,
    })

    mocks.find.mockResolvedValue(null)

    await expect(
      recordAcceptance(customerInput)
    ).rejects.toMatchObject({
      code: 'acceptance_write_failed',
      status: 503,
    })
  })
})

describe('Current acceptance lookup', () => {
  it('finds a matching creator acceptance', async () => {
    mocks.find.mockResolvedValue({
      acceptedAt: new Date(),
    })

    const result = await hasCurrentAcceptance(
      'creator-test',
      'creator'
    )

    expect(result).toBe(true)

    expect(mocks.find).toHaveBeenCalledWith({
      userId: 'creator-test',
      document: 'creator',
      termsVersion: CREATOR_VERSION,
      sourceSha256: 'b'.repeat(64),
    })
  })

  it('returns false if acceptance is missing', async () => {
    mocks.find.mockResolvedValue(null)

    expect(
      await hasCurrentAcceptance(
        'creator-test',
        'creator'
      )
    ).toBe(false)
  })

  it('rejects invalid user IDs without database access', async () => {
    expect(
      await hasCurrentAcceptance(
        '',
        'creator'
      )
    ).toBe(false)

    expect(mocks.find).not.toHaveBeenCalled()
  })
})

describe('Checkout Stripe fail-closed ordering', () => {
  it('makes zero Stripe calls without acceptance', async () => {
    vi.stubEnv('TERMS_CHECKBOX_ENABLED', 'true')

    await expect(
      submitCheckout({
        acceptance: undefined,
      })
    ).rejects.toMatchObject({
      code: 'terms_required',
      status: 400,
    })

    expect(mocks.write).not.toHaveBeenCalled()
    expect(mocks.stripeCreate).not.toHaveBeenCalled()
  })

  it('makes zero Stripe calls with stale acceptance', async () => {
    vi.stubEnv('TERMS_CHECKBOX_ENABLED', 'true')

    await expect(
      submitCheckout({
        acceptance: {
          accepted: true,
          termsVersion: 'outdated',
        },
      })
    ).rejects.toMatchObject({
      code: 'terms_version_changed',
      status: 409,
    })

    expect(mocks.write).not.toHaveBeenCalled()
    expect(mocks.stripeCreate).not.toHaveBeenCalled()
  })

  it('makes zero Stripe calls when acceptance persistence fails', async () => {
    vi.stubEnv('TERMS_CHECKBOX_ENABLED', 'true')

    mocks.write.mockRejectedValue(
      new Error('database unavailable')
    )

    await expect(
      submitCheckout({
        acceptance: customerAcceptance,
      })
    ).rejects.toThrow('database unavailable')

    expect(mocks.write).toHaveBeenCalledOnce()
    expect(mocks.stripeCreate).not.toHaveBeenCalled()
  })

  it('makes zero Stripe calls on preview', async () => {
    vi.stubEnv('TERMS_CHECKBOX_ENABLED', 'true')
    vi.stubEnv('VERCEL_ENV', 'preview')

    await expect(
      submitCheckout({
        acceptance: customerAcceptance,
      })
    ).rejects.toMatchObject({
      code: 'preview_read_only',
      status: 503,
    })

    expect(mocks.write).not.toHaveBeenCalled()
    expect(mocks.stripeCreate).not.toHaveBeenCalled()
  })

  it('calls Stripe only after acceptance is recorded', async () => {
    vi.stubEnv('TERMS_CHECKBOX_ENABLED', 'true')

    const order = []

    mocks.write.mockImplementation(
      async (_query, update) => {
        order.push('acceptance')

        return {
          ...update.$setOnInsert,
        }
      }
    )

    mocks.stripeCreate.mockImplementation(async () => {
      order.push('stripe')

      return {
        id: 'session-test',
      }
    })

    const result = await submitCheckout({
      acceptance: customerAcceptance,
    })

    expect(result).toEqual({
      id: 'session-test',
    })

    expect(order).toEqual([
      'acceptance',
      'stripe',
    ])

    expect(mocks.write).toHaveBeenCalledOnce()
    expect(mocks.stripeCreate).toHaveBeenCalledOnce()
  })
})
