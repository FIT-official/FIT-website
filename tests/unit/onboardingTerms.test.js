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
  userFindOne: vi.fn(),
  userSave: vi.fn(),
  checkAcceptance: vi.fn(),
  recordAcceptance: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: mocks.auth,
  clerkClient: mocks.clerkClient,
}))

vi.mock('@/lib/db', () => ({
  connectToDatabase: mocks.connectToDatabase,
}))

vi.mock('@/models/User', () => {
  const MockUser = vi.fn(function (doc) {
    Object.assign(this, doc)
    this.save = mocks.userSave
  })

  MockUser.findOne = mocks.userFindOne

  return {
    default: MockUser,
  }
})

vi.mock('@/lib/termsAcceptance', () => ({
  checkAcceptance: mocks.checkAcceptance,
  recordAcceptance: mocks.recordAcceptance,
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import {
  completeOnboarding,
} from '@/app/onboarding/_actions'

const VERSION = 'Version 1.0, 18 October 2026'

function formData({
  accepted = true,
  version = VERSION,
} = {}) {
  const form = new FormData()

  form.set('termsAccepted', accepted ? 'true' : 'false')
  form.set('termsVersion', version)

  return form
}

beforeEach(() => {
  vi.resetAllMocks()

  vi.stubEnv('TERMS_CHECKBOX_ENABLED', 'true')
  vi.stubEnv('VERCEL_ENV', 'production')

  mocks.auth.mockResolvedValue({
    userId: 'user-onboarding',
  })

  mocks.clerkClient.mockResolvedValue({
    users: {
      getUser: mocks.getUser,
      updateUser: mocks.updateUser,
    },
  })

  mocks.connectToDatabase.mockResolvedValue({})

  mocks.userFindOne.mockResolvedValue(null)
  mocks.userSave.mockResolvedValue(undefined)

  mocks.getUser.mockResolvedValue({
    id: 'user-onboarding',
    publicMetadata: {},
  })

  mocks.updateUser.mockResolvedValue({
    id: 'user-onboarding',
    publicMetadata: {
      onboardingComplete: true,
    },
  })

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
    acceptedAt: '2026-10-18T00:00:00.000Z',
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Customer Terms onboarding gate', () => {
  it('rejects missing acceptance before Clerk completion', async () => {
    const result = await completeOnboarding(new FormData())

    expect(result).toMatchObject({
      code: 'terms_required',
      error:
        'Tick the box to agree to the Terms and Conditions.',
    })

    expect(mocks.recordAcceptance).not.toHaveBeenCalled()
    expect(mocks.updateUser).not.toHaveBeenCalled()
    expect(mocks.userSave).not.toHaveBeenCalled()
  })

  it('rejects explicitly unticked acceptance', async () => {
    const result = await completeOnboarding(
      formData({ accepted: false })
    )

    expect(result).toMatchObject({
      code: 'terms_required',
    })

    expect(mocks.recordAcceptance).not.toHaveBeenCalled()
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })

  it('rejects stale acceptance before Clerk completion', async () => {
    const result = await completeOnboarding(
      formData({ version: 'Version 0.9' })
    )

    expect(result).toMatchObject({
      code: 'terms_version_changed',
      error:
        'Our terms were updated. Please review and tick the box again.',
    })

    expect(mocks.recordAcceptance).not.toHaveBeenCalled()
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })

  it('does not complete onboarding when persistence fails', async () => {
    mocks.recordAcceptance.mockRejectedValue(
      new Error('Mongo unavailable')
    )

    const result = await completeOnboarding(formData())

    expect(result?.message).toBeFalsy()
    expect(mocks.recordAcceptance).toHaveBeenCalledOnce()
    expect(mocks.updateUser).not.toHaveBeenCalled()
    expect(mocks.userSave).not.toHaveBeenCalled()
  })

  it('records acceptance before setting onboardingComplete', async () => {
    const result = await completeOnboarding(formData())

    expect(result?.message).toBe('Onboarding complete')

    expect(mocks.recordAcceptance).toHaveBeenCalledWith({
      userId: 'user-onboarding',
      context: 'signup',
      document: 'customer',
      termsVersion: VERSION,
      referenceId: 'user-onboarding',
    })

    expect(mocks.getUser).toHaveBeenCalledWith(
      'user-onboarding'
    )

    expect(mocks.updateUser).toHaveBeenCalledWith(
      'user-onboarding',
      expect.objectContaining({
        publicMetadata: expect.objectContaining({
          onboardingComplete: true,
        }),
      })
    )

    expect(
      mocks.recordAcceptance.mock.invocationCallOrder[0]
    ).toBeLessThan(
      mocks.updateUser.mock.invocationCallOrder[0]
    )

    expect(mocks.userSave).toHaveBeenCalledOnce()
  })

  it('preserves flag-OFF onboarding without acceptance fields', async () => {
    vi.stubEnv('TERMS_CHECKBOX_ENABLED', '')

    const result = await completeOnboarding(new FormData())

    expect(result?.message).toBe('Onboarding complete')

    expect(mocks.checkAcceptance).not.toHaveBeenCalled()
    expect(mocks.recordAcceptance).not.toHaveBeenCalled()
    expect(mocks.userSave).toHaveBeenCalledOnce()

    expect(mocks.updateUser).toHaveBeenCalledWith(
      'user-onboarding',
      expect.objectContaining({
        publicMetadata: expect.objectContaining({
          onboardingComplete: true,
        }),
      })
    )
  })

  it('does not complete onboarding on Vercel preview', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')

    mocks.recordAcceptance.mockRejectedValue(
      Object.assign(
        new Error('Preview is read-only.'),
        {
          code: 'preview_read_only',
          status: 503,
        }
      )
    )

    const result = await completeOnboarding(formData())

    expect(result?.message).toBeFalsy()
    expect(result?.code).toBe('preview_read_only')
    expect(mocks.updateUser).not.toHaveBeenCalled()
    expect(mocks.userSave).not.toHaveBeenCalled()
  })

  it('requires an authenticated user', async () => {
    mocks.auth.mockResolvedValue({ userId: null })

    const result = await completeOnboarding(formData())

    expect(result?.error).toBeTruthy()
    expect(mocks.recordAcceptance).not.toHaveBeenCalled()
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })
})
