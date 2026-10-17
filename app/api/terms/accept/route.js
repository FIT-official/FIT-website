import { auth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import {
  checkAcceptance,
  hasCurrentAcceptance,
  recordAcceptance,
} from '@/lib/termsAcceptance'
import { isCreatorTermsAcceptanceEnabled } from '@/lib/legalFlags'
import { CREATOR_TERMS_VERSION } from '@/content/legal/creatorTermsV1'
import {
  fail,
  json,
  readJson,
  failure,
} from '@/lib/fabrication/serverHttp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { userId } = await auth()

    if (!userId) {
      fail(
        'Sign in to view your acceptance.',
        401,
        'unauthorised'
      )
    }

    if (!isCreatorTermsAcceptanceEnabled()) {
      return json({
        accepted: false,
        termsVersion: CREATOR_TERMS_VERSION,
      })
    }

    await connectToDatabase()

    const accepted = await hasCurrentAcceptance(
      userId,
      'creator'
    )

    return json({
      accepted,
      termsVersion: CREATOR_TERMS_VERSION,
    })
  } catch (error) {
    return failure(error)
  }
}

export async function POST(request) {
  try {
    const { userId } = await auth()

    if (!userId) {
      fail(
        'Sign in to accept the Creator Terms.',
        401,
        'unauthorised'
      )
    }

    if (process.env.VERCEL_ENV === 'preview') {
      fail(
        'Preview is read-only.',
        503,
        'preview_read_only'
      )
    }

    if (!isCreatorTermsAcceptanceEnabled()) {
      fail(
        'Creator Terms acceptance is unavailable.',
        403,
        'terms_disabled'
      )
    }

    const input = await readJson(request)

    const allowed = new Set([
      'document',
      'accepted',
      'termsVersion',
    ])

    if (
      Object.keys(input).some(
        key => !allowed.has(key)
      )
    ) {
      fail(
        'Invalid acceptance field.',
        400,
        'invalid_request'
      )
    }

    if (
      input.document !== 'creator' &&
      input.document !== 'creator-terms'
    ) {
      fail(
        'Invalid terms document.',
        400,
        'invalid_document'
      )
    }

    const checked = checkAcceptance(
      {
        accepted: input.accepted,
        termsVersion: input.termsVersion,
      },
      'creator'
    )

    await connectToDatabase()

    const result = await recordAcceptance({
      userId,
      context: 'creator_onboarding',
      document: 'creator',
      termsVersion: checked.termsVersion,
      referenceId: userId,
    })

    return json({
      accepted: true,
      termsVersion: result.termsVersion,
      acceptedAt: result.acceptedAt,
    })
  } catch (error) {
    // The shared helper preserves application-specific status
    // and error codes for FabricationError instances.
    // Convert errors from the acceptance service accordingly.
    if (
      typeof error?.code === 'string' &&
      Number.isInteger(error.status) &&
      error.status >= 400 &&
      error.status <= 599
    ) {
      return json(
        {
          error: error.message,
          code: error.code,
        },
        error.status
      )
    }

    return failure(error)
  }
}
