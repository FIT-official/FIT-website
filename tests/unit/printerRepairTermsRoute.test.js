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
  enforceFabricationRate: vi.fn(),
  requireRepairOrigin: vi.fn(),
  createRepairRequest: vi.fn(),
  recoverRepairRequest: vi.fn(),
  notifyRepairOwner: vi.fn(),
  validateRepairSubmission: vi.fn(),
  recordAcceptance: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: mocks.auth,
}))

vi.mock('@/lib/db', () => ({
  connectToDatabase: mocks.connectToDatabase,
}))

vi.mock('@/lib/fabrication/serverRateLimit', () => ({
  enforceFabricationRate: mocks.enforceFabricationRate,
}))

vi.mock('@/lib/printerRepair/server', () => ({
  requireRepairOrigin: mocks.requireRepairOrigin,
  createRepairRequest: mocks.createRepairRequest,
  recoverRepairRequest: mocks.recoverRepairRequest,
}))

vi.mock('@/lib/printerRepair/ownerEmail', () => ({
  notifyRepairOwner: mocks.notifyRepairOwner,
}))

vi.mock('@/models/PrinterRepairRequest', () => ({
  default: {
    collection: {},
  },
}))

vi.mock('@/lib/printerRepair/validate', () => ({
  validateRepairSubmission: mocks.validateRepairSubmission,
}))

vi.mock('@/lib/termsAcceptance', () => ({
  checkAcceptance(input) {
    if (
      input?.accepted !== true ||
      typeof input.termsVersion !== 'string' ||
      !input.termsVersion
    ) {
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

    if (
      input.termsVersion !==
      'Version 1.0, 18 October 2026'
    ) {
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
      termsVersion: input.termsVersion,
      sourceSha256: 'a'.repeat(64),
    }
  },
  recordAcceptance: mocks.recordAcceptance,
}))

import { POST } from '@/app/api/printer-repair/route'

const CLIENT_REQUEST_ID =
  '12345678-1234-4123-8123-123456789abc'

const VERSION =
  'Version 1.0, 18 October 2026'

const repairPayload = {
  clientRequestId: CLIENT_REQUEST_ID,
  brief: {
    brand: 'Example',
    model: 'Example printer',
  },
  photoAssetIds: [],
}

function request(termsAcceptance) {
  const body = {
    ...repairPayload,
    ...(termsAcceptance === undefined
      ? {}
      : { termsAcceptance }),
  }

  return new Request(
    'https://fixitoday.com/api/printer-repair',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )
}

function assertNoRepairWrite() {
  expect(
    mocks.createRepairRequest
  ).not.toHaveBeenCalled()

  expect(
    mocks.notifyRepairOwner
  ).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.resetAllMocks()

  vi.stubEnv(
    'TERMS_CHECKBOX_ENABLED',
    'true'
  )

  vi.stubEnv(
    'VERCEL_ENV',
    'production'
  )

  mocks.auth.mockResolvedValue({
    userId: 'user-repair',
  })

  mocks.connectToDatabase.mockResolvedValue({})

  mocks.validateRepairSubmission.mockReturnValue({
    ok: true,
    value: repairPayload,
  })

  mocks.recordAcceptance.mockResolvedValue({
    recorded: true,
  })

  mocks.createRepairRequest.mockResolvedValue({
    created: true,
    request: {
      requestId: CLIENT_REQUEST_ID,
      status: 'assessment_requested',
    },
  })

  mocks.notifyRepairOwner.mockResolvedValue(
    undefined
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Printer repair acceptance route', () => {
  it('rejects missing acceptance with HTTP 400', async () => {
    const response = await POST(request())

    expect(response.status).toBe(400)

    expect(await response.json()).toMatchObject({
      code: 'terms_required',
      error:
        'Tick the box to agree to the Terms and Conditions.',
    })

    expect(
      mocks.recordAcceptance
    ).not.toHaveBeenCalled()

    assertNoRepairWrite()
  })

  it('rejects unticked acceptance with HTTP 400', async () => {
    const response = await POST(
      request({
        accepted: false,
        termsVersion: VERSION,
      })
    )

    expect(response.status).toBe(400)

    expect(await response.json()).toMatchObject({
      code: 'terms_required',
    })

    expect(
      mocks.recordAcceptance
    ).not.toHaveBeenCalled()

    assertNoRepairWrite()
  })

  it('rejects stale acceptance with HTTP 409', async () => {
    const response = await POST(
      request({
        accepted: true,
        termsVersion: 'Version 0.9',
      })
    )

    expect(response.status).toBe(409)

    expect(await response.json()).toMatchObject({
      code: 'terms_version_changed',
      error:
        'Our terms were updated. Please review and tick the box again.',
    })

    expect(
      mocks.recordAcceptance
    ).not.toHaveBeenCalled()

    assertNoRepairWrite()
  })

  it('fails closed if acceptance cannot be saved', async () => {
    mocks.recordAcceptance.mockRejectedValue(
      new Error('Mongo unavailable')
    )

    const response = await POST(
      request({
        accepted: true,
        termsVersion: VERSION,
      })
    )

    expect(response.status).toBe(503)

    expect(
      mocks.recordAcceptance
    ).toHaveBeenCalledOnce()

    assertNoRepairWrite()
  })

  it('records acceptance before creating a request', async () => {
    const order = []

    mocks.recordAcceptance.mockImplementation(
      async () => {
        order.push('acceptance')
        return { recorded: true }
      }
    )

    mocks.createRepairRequest.mockImplementation(
      async () => {
        order.push('repair')
        return {
          created: true,
          request: {
            requestId: CLIENT_REQUEST_ID,
            status: 'assessment_requested',
          },
        }
      }
    )

    const response = await POST(
      request({
        accepted: true,
        termsVersion: VERSION,
      })
    )

    expect(response.status).toBe(201)

    expect(
      mocks.recordAcceptance
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-repair',
        context: 'repair_booking',
        document: 'customer',
        termsVersion: VERSION,
        referenceId: CLIENT_REQUEST_ID,
      })
    )

    expect(order).toEqual([
      'acceptance',
      'repair',
    ])

    expect(
      mocks.createRepairRequest
    ).toHaveBeenCalledWith(
      repairPayload,
      'user-repair'
    )
  })

  it('does not persist acceptance metadata in the repair payload', async () => {
    await POST(
      request({
        accepted: true,
        termsVersion: VERSION,
      })
    )

    const [payload] =
      mocks.createRepairRequest.mock.calls[0]

    expect(payload).not.toHaveProperty(
      'termsAcceptance'
    )

    expect(payload).toEqual(repairPayload)
  })

  it('preserves the flag-OFF route behaviour', async () => {
    vi.stubEnv(
      'TERMS_CHECKBOX_ENABLED',
      ''
    )

    const response = await POST(request())

    expect(response.status).toBe(201)

    expect(
      mocks.recordAcceptance
    ).not.toHaveBeenCalled()

    expect(
      mocks.validateRepairSubmission
    ).not.toHaveBeenCalled()

    expect(
      mocks.createRepairRequest
    ).toHaveBeenCalledWith(
      repairPayload,
      'user-repair'
    )
  })

  it('does not create a repair request on preview', async () => {
    mocks.recordAcceptance.mockRejectedValue(
      Object.assign(
        new Error('Preview is read-only.'),
        {
          code: 'preview_read_only',
          status: 503,
        }
      )
    )

    const response = await POST(
      request({
        accepted: true,
        termsVersion: VERSION,
      })
    )

    expect(response.status).toBe(503)

    expect(await response.json()).toMatchObject({
      code: 'preview_read_only',
    })

    assertNoRepairWrite()
  })
})
