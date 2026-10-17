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
  connectToDatabase: vi.fn(),
  checkAcceptance: vi.fn(),
  recordAcceptance: vi.fn(),
  hasCurrentAcceptance: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: mocks.auth,
}))

vi.mock('@/lib/db', () => ({
  connectToDatabase: mocks.connectToDatabase,
}))

vi.mock('@/content/legal/creatorTermsV1', () => ({
  CREATOR_TERMS_VERSION: 'Version 1.0, 18 October 2026',
}))

vi.mock('@/lib/termsAcceptance', () => ({
  checkAcceptance: mocks.checkAcceptance,
  recordAcceptance: mocks.recordAcceptance,
  hasCurrentAcceptance: mocks.hasCurrentAcceptance,
}))

import { GET, POST } from '@/app/api/terms/accept/route'

const VERSION = 'Version 1.0, 18 October 2026'

function request(input = {}) {
  return new Request(
    'https://fixitoday.com/api/terms/accept',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    }
  )
}

function validInput() {
  return {
    document: 'creator',
    accepted: true,
    termsVersion: VERSION,
  }
}

function acceptanceError(code, status, message) {
  return Object.assign(new Error(message), {
    code,
    status,
  })
}

function assertNoAcceptanceWrite() {
  expect(mocks.recordAcceptance).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.resetAllMocks()

  vi.stubEnv(
    'CREATOR_TERMS_ACCEPTANCE_ENABLED',
    'true'
  )
  vi.stubEnv('VERCEL_ENV', 'production')

  mocks.auth.mockResolvedValue({
    userId: 'user-creator',
  })

  mocks.connectToDatabase.mockResolvedValue({})

  mocks.checkAcceptance.mockImplementation(input => {
    if (input.accepted !== true || !input.termsVersion) {
      throw acceptanceError(
        'terms_required',
        400,
        'Tick the box to agree to the Creator Terms.'
      )
    }

    if (input.termsVersion !== VERSION) {
      throw acceptanceError(
        'terms_version_changed',
        409,
        'Our terms were updated. Please review and tick the box again.'
      )
    }

    return {
      ok: true,
      document: 'creator',
      termsVersion: VERSION,
      sourceSha256: 'b'.repeat(64),
    }
  })

  mocks.recordAcceptance.mockResolvedValue({
    recorded: true,
    document: 'creator',
    termsVersion: VERSION,
    acceptedAt: '2026-10-18T00:00:00.000Z',
  })

  mocks.hasCurrentAcceptance.mockResolvedValue(false)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/terms/accept', () => {
  it('requires authentication before any database access', async () => {
    mocks.auth.mockResolvedValue({
      userId: null,
    })

    const response = await POST(request(validInput()))

    expect(response.status).toBe(401)

    expect(mocks.connectToDatabase).not.toHaveBeenCalled()
    assertNoAcceptanceWrite()
  })

  it('refuses writes on Vercel preview', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')

    const response = await POST(request(validInput()))

    expect(response.status).toBe(503)

    expect(await response.json()).toMatchObject({
      code: 'preview_read_only',
    })

    expect(mocks.connectToDatabase).not.toHaveBeenCalled()
    assertNoAcceptanceWrite()
  })

  it('returns 403 when creator acceptance is disabled', async () => {
    vi.stubEnv(
      'CREATOR_TERMS_ACCEPTANCE_ENABLED',
      ''
    )

    const response = await POST(request(validInput()))

    expect(response.status).toBe(403)

    expect(await response.json()).toMatchObject({
      code: 'terms_disabled',
    })

    expect(mocks.connectToDatabase).not.toHaveBeenCalled()
    assertNoAcceptanceWrite()
  })

  it('rejects unexpected client fields', async () => {
    const response = await POST(
      request({
        ...validInput(),
        acceptedAt: '2001-01-01T00:00:00.000Z',
      })
    )

    expect(response.status).toBe(400)

    expect(await response.json()).toMatchObject({
      code: 'invalid_request',
    })

    expect(mocks.checkAcceptance).not.toHaveBeenCalled()
    assertNoAcceptanceWrite()
  })

  it('rejects invalid document names', async () => {
    const response = await POST(
      request({
        ...validInput(),
        document: 'customer',
      })
    )

    expect(response.status).toBe(400)

    expect(await response.json()).toMatchObject({
      code: 'invalid_document',
    })

    assertNoAcceptanceWrite()
  })

  it('returns 400 for unticked creator acceptance', async () => {
    const response = await POST(
      request({
        ...validInput(),
        accepted: false,
      })
    )

    expect(response.status).toBe(400)

    expect(await response.json()).toMatchObject({
      code: 'terms_required',
      error: 'Tick the box to agree to the Creator Terms.',
    })

    assertNoAcceptanceWrite()
  })

  it('returns 409 for a stale creator version', async () => {
    const response = await POST(
      request({
        ...validInput(),
        termsVersion: 'Version 0.9',
      })
    )

    expect(response.status).toBe(409)

    expect(await response.json()).toMatchObject({
      code: 'terms_version_changed',
      error:
        'Our terms were updated. Please review and tick the box again.',
    })

    assertNoAcceptanceWrite()
  })

  it('records the authenticated user and returns ISO acceptedAt', async () => {
    const response = await POST(request(validInput()))

    expect(response.status).toBe(200)

    const body = await response.json()

    expect(body).toMatchObject({
      accepted: true,
      termsVersion: VERSION,
    })

    expect(body.acceptedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    )

    expect(mocks.recordAcceptance).toHaveBeenCalledWith({
      userId: 'user-creator',
      context: 'creator_onboarding',
      document: 'creator',
      termsVersion: VERSION,
      referenceId: 'user-creator',
    })

    expect(mocks.connectToDatabase).toHaveBeenCalledOnce()
  })

  it('does not claim success when persistence fails', async () => {
    mocks.recordAcceptance.mockRejectedValue(
      new Error('Mongo unavailable')
    )

    const response = await POST(request(validInput()))

    expect(response.status).toBe(503)
    expect(response.status).not.toBe(200)
  })

  it('returns a server-selected document version', async () => {
    const response = await POST(request(validInput()))
    const body = await response.json()

    expect(body.termsVersion).toBe(VERSION)
    expect(mocks.recordAcceptance).toHaveBeenCalledWith(
      expect.objectContaining({
        document: 'creator',
        termsVersion: VERSION,
      })
    )
  })
})

describe('GET /api/terms/accept', () => {
  it('requires authentication', async () => {
    mocks.auth.mockResolvedValue({
      userId: null,
    })

    const response = await GET()

    expect(response.status).toBe(401)
    expect(mocks.hasCurrentAcceptance).not.toHaveBeenCalled()
  })

  it('does not query persistence when the flag is OFF', async () => {
    vi.stubEnv(
      'CREATOR_TERMS_ACCEPTANCE_ENABLED',
      ''
    )

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)

    expect(body).toEqual({
      accepted: false,
      termsVersion: VERSION,
    })

    expect(mocks.connectToDatabase).not.toHaveBeenCalled()
    expect(mocks.hasCurrentAcceptance).not.toHaveBeenCalled()
  })

  it('reports current creator acceptance from the database', async () => {
    mocks.hasCurrentAcceptance.mockResolvedValue(true)

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)

    expect(body).toEqual({
      accepted: true,
      termsVersion: VERSION,
    })

    expect(mocks.hasCurrentAcceptance).toHaveBeenCalledWith(
      'user-creator',
      'creator'
    )
  })
})
