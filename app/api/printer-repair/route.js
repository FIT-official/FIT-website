import PrinterRepairRequest from '@/models/PrinterRepairRequest'
import { notifyRepairOwner } from '@/lib/printerRepair/ownerEmail'
import { auth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import { enforceFabricationRate } from '@/lib/fabrication/serverRateLimit'
import {
  fail,
  json,
  readJson,
  checkedClientRequestId,
} from '@/lib/fabrication/serverHttp'
import { repairFailure } from '@/lib/printerRepair/diagnostics'
import {
  createRepairRequest,
  recoverRepairRequest,
  requireRepairOrigin,
} from '@/lib/printerRepair/server'
import { validateRepairSubmission } from '@/lib/printerRepair/validate'
import { isTermsCheckboxEnabled } from '@/lib/legalFlags'
import {
  checkAcceptance,
  recordAcceptance,
} from '@/lib/termsAcceptance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function acceptanceFailure(error) {
  if (
    ['terms_required', 'terms_version_changed', 'preview_read_only']
      .includes(error?.code) &&
    Number.isInteger(error?.status)
  ) {
    return json(
      {
        error: error.message,
        code: error.code,
      },
      error.status
    )
  }

  return null
}

export async function POST(request) {
  try {
    requireRepairOrigin(request)

    const { userId } = await auth()

    if (!userId) {
      fail(
        'Sign in to send your assessment request.',
        401,
        'sign_in_required'
      )
    }

    await enforceFabricationRate(request, 'request', userId)

    const input = await readJson(request)
    const termsRequired = isTermsCheckboxEnabled()

    let payload = input
    let termsVersion = null

    if (termsRequired) {
      const {
        termsAcceptance,
        ...repairPayload
      } = input

      const checked = checkAcceptance(
        termsAcceptance,
        'customer'
      )

      termsVersion = checked.termsVersion
      payload = repairPayload
    }

    // Validate the unchanged repair submission before any
    // acceptance write or request-creation side effect.
    if (termsRequired) {
      const validated = validateRepairSubmission(payload)

      if (!validated.ok) {
        fail(
          'Invalid assessment request.',
          400,
          'invalid_request'
        )
      }

      const requestId = checkedClientRequestId(
        payload.clientRequestId
      )

      await connectToDatabase()

      // The request ID is the server-validated idempotency key.
      // The acceptance writer supplies its own timestamp and
      // document source hash.
      await recordAcceptance({
        userId,
        context: 'repair_booking',
        document: 'customer',
        termsVersion,
        referenceId: requestId,
      })
    } else {
      await connectToDatabase()
    }

    const result = await createRepairRequest(
      payload,
      userId
    )

    await notifyRepairOwner(
      PrinterRepairRequest.collection,
      result.request.requestId
    )

    return json(
      { request: result.request },
      result.created ? 201 : 200
    )
  } catch (error) {
    const mapped = acceptanceFailure(error)

    if (mapped) {
      return mapped
    }

    return repairFailure(error, 'submit')
  }
}

export async function GET(request) {
  try {
    const { userId } = await auth()

    if (!userId) {
      fail(
        'Sign in to view your request.',
        401
      )
    }

    await enforceFabricationRate(
      request,
      'public',
      userId
    )

    await connectToDatabase()

    return json({
      request: await recoverRepairRequest(
        new URL(request.url).searchParams.get(
          'clientRequestId'
        ),
        userId
      ),
    })
  } catch (error) {
    return repairFailure(error, 'recover')
  }
}
