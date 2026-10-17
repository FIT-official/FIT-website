import TermsAcceptance from '@/models/TermsAcceptance'

import {
  CUSTOMER_TERMS_VERSION,
  CUSTOMER_TERMS_SOURCE_SHA256,
} from '@/content/legal/customerTermsV1'

import {
  CREATOR_TERMS_VERSION,
  CREATOR_TERMS_SOURCE_SHA256,
} from '@/content/legal/creatorTermsV1'

import {
  isTermsCheckboxEnabled,
  isCreatorTermsAcceptanceEnabled,
} from '@/lib/legalFlags'

const CONTEXTS = new Set([
  'checkout',
  'repair_booking',
  'signup',
  'creator_onboarding',
])

const DOCUMENT_ALIASES = Object.freeze({
  customer: 'customer',
  terms: 'customer',
  creator: 'creator',
  'creator-terms': 'creator',
})

const REQUIRED_MESSAGES = Object.freeze({
  customer: 'Tick the box to agree to the Terms and Conditions.',
  creator: 'Tick the box to agree to the Creator Terms.',
})

const VERSION_CHANGED_MESSAGE =
  'Our terms were updated. Please review and tick the box again.'

export function normaliseDocument(document) {
  if (
    typeof document !== 'string' ||
    !Object.hasOwn(DOCUMENT_ALIASES, document)
  ) {
    throw new TypeError('Invalid acceptance document')
  }

  return DOCUMENT_ALIASES[document]
}

export function currentDocument(document) {
  const selected = normaliseDocument(document)

  if (selected === 'customer') {
    return {
      document: 'customer',
      version: CUSTOMER_TERMS_VERSION,
      sourceSha256: CUSTOMER_TERMS_SOURCE_SHA256,
    }
  }

  return {
    document: 'creator',
    version: CREATOR_TERMS_VERSION,
    sourceSha256: CREATOR_TERMS_SOURCE_SHA256,
  }
}

export function isAcceptanceEnabled(
  document,
  env = process.env
) {
  const selected = normaliseDocument(document)

  return selected === 'customer'
    ? isTermsCheckboxEnabled(env)
    : isCreatorTermsAcceptanceEnabled(env)
}

function acceptanceError(
  code,
  status = 400,
  document = 'customer'
) {
  const selected = normaliseDocument(document)

  const messages = {
    terms_required: REQUIRED_MESSAGES[selected],
    terms_version_changed: VERSION_CHANGED_MESSAGE,
    invalid_identity: 'Sign in before accepting the terms.',
    invalid_context: 'Invalid acceptance context.',
    invalid_reference: 'Invalid acceptance reference.',
    invalid_document_hash: 'Invalid legal document hash.',
    preview_read_only: 'Preview is read-only.',
    acceptance_write_failed: 'Unable to record terms acceptance.',
  }

  const error = new Error(
    messages[code] || REQUIRED_MESSAGES[selected]
  )

  error.code = code
  error.status = status
  error.statusCode = status

  return error
}

export function checkAcceptance(input, document) {
  const current = currentDocument(document)

  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some(
      key => !['accepted', 'termsVersion'].includes(key)
    ) ||
    input.accepted !== true ||
    typeof input.termsVersion !== 'string' ||
    !input.termsVersion
  ) {
    throw acceptanceError(
      'terms_required',
      400,
      current.document
    )
  }

  if (input.termsVersion !== current.version) {
    throw acceptanceError(
      'terms_version_changed',
      409,
      current.document
    )
  }

  return {
    ok: true,
    document: current.document,
    termsVersion: current.version,
    sourceSha256: current.sourceSha256,
  }
}

export async function recordAcceptance({
  userId,
  context,
  document,
  termsVersion,
  referenceId = '',
}) {
  const current = currentDocument(document)

  if (
    typeof userId !== 'string' ||
    !userId ||
    userId.length > 128
  ) {
    throw acceptanceError(
      'invalid_identity',
      401,
      current.document
    )
  }

  if (!CONTEXTS.has(context)) {
    throw acceptanceError(
      'invalid_context',
      400,
      current.document
    )
  }

  if (
    typeof referenceId !== 'string' ||
    !referenceId ||
    referenceId.length > 100
  ) {
    throw acceptanceError(
      'invalid_reference',
      400,
      current.document
    )
  }

  if (termsVersion !== current.version) {
    throw acceptanceError(
      'terms_version_changed',
      409,
      current.document
    )
  }

  if (
    typeof current.sourceSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(current.sourceSha256)
  ) {
    throw acceptanceError(
      'invalid_document_hash',
      500,
      current.document
    )
  }

  if (process.env.VERCEL_ENV === 'preview') {
    throw acceptanceError(
      'preview_read_only',
      503,
      current.document
    )
  }

  const identity = {
    userId,
    context,
    referenceId,
    document: current.document,
    termsVersion: current.version,
    sourceSha256: current.sourceSha256,
  }

  const acceptedAt = new Date()
  let record

  try {
    record = await TermsAcceptance.findOneAndUpdate(
      identity,
      {
        $setOnInsert: {
          ...identity,
          acceptedAt,
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    )
  } catch (error) {
    if (error?.code !== 11000) throw error

    record = await TermsAcceptance.findOne(identity)
  }

  if (
    !record ||
    !(record.acceptedAt instanceof Date) ||
    Number.isNaN(record.acceptedAt.getTime())
  ) {
    throw acceptanceError(
      'acceptance_write_failed',
      503,
      current.document
    )
  }

  return {
    recorded: true,
    document: current.document,
    termsVersion: current.version,
    sourceSha256: current.sourceSha256,
    acceptedAt: record.acceptedAt.toISOString(),
    userId,
    referenceId,
  }
}

export async function hasCurrentAcceptance(userId, document) {
  if (
    typeof userId !== 'string' ||
    !userId ||
    userId.length > 128
  ) {
    return false
  }

  const current = currentDocument(document)

  if (!/^[a-f0-9]{64}$/.test(current.sourceSha256)) {
    return false
  }

  const record = await TermsAcceptance.findOne({
    userId,
    document: current.document,
    termsVersion: current.version,
    sourceSha256: current.sourceSha256,
  })

  return Boolean(record)
}
