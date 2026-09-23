import { createHash, randomUUID } from 'node:crypto'
import FabricationRequest from '@/models/FabricationRequest'
import FabricationAsset from '@/models/FabricationAsset'
import { reserveCreatorQuota } from '@/lib/creatorQuota'
import { calculateFabricationEstimate } from './pricing'
import { validateFabricationInput, validateFabricationPersonalization, isFabricationRegionContained } from './validate'
import { loadPublicFabrication } from './serverAccess'
import { findOwnedAsset, shapeFabricationAsset } from './serverAssets'
import { checkedClientRequestId, checkedCreatorId, checkedId, fail } from './serverHttp'

let requestIndexesReady
async function ensureRequestIndexes() {
  if (!requestIndexesReady) requestIndexesReady = FabricationRequest.createIndexes().catch(error => { requestIndexesReady = null; throw error })
  await requestIndexesReady
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]))
  return value
}

export function parseFabricationSubmission(body, creating = false) {
  const { creatorId, imageAssetId, referenceAssetId, ...rest } = body
  let clientRequestId
  if (creating) { clientRequestId = checkedClientRequestId(rest.clientRequestId); delete rest.clientRequestId }
  const checked = validateFabricationInput(rest)
  if (!checked.ok) fail(checked.error)
  const value = { creatorId: checkedCreatorId(creatorId), input: checked.value,
    imageAssetId: imageAssetId == null ? null : checkedId(imageAssetId, 'image asset ID'),
    referenceAssetId: referenceAssetId == null ? null : checkedId(referenceAssetId, 'reference asset ID') }
  return { ...value, clientRequestId,
    fingerprint: createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex') }
}

async function resolveAttachments(parsed, service, userId) {
  const offer = service.catalog.offers.find(offer => offer.id === parsed.input.offerId && offer.enabled)
  if (!offer) fail('This fabrication offer is unavailable.')
  if (parsed.input.personalization && !parsed.imageAssetId) fail('Choose a template or upload an image before adding text.')
  if (parsed.imageAssetId) {
    if (parsed.imageAssetId === offer.template?.assetId) {
      await findOwnedAsset(parsed.imageAssetId, service.creator.userId, 'image')
      if (parsed.input.personalization && !isFabricationRegionContained(parsed.input.personalization.region, offer.template.region)) {
        fail('Place the text inside the template’s permitted region.')
      }
    } else {
      if (!userId) fail('Sign in to use your uploaded image.', 401)
      await findOwnedAsset(parsed.imageAssetId, userId, 'image')
    }
  }
  if (parsed.referenceAssetId) {
    if (!userId) fail('Sign in to attach your reference file.', 401)
    await findOwnedAsset(parsed.referenceAssetId, userId, 'reference')
  }
}

async function prepareEstimate(parsed, userId) {
  const service = await loadPublicFabrication(parsed.creatorId, { offerId: parsed.input.offerId })
  if (!service) fail('This creator is not accepting fabrication requests.', 404, 'service_unavailable')
  await resolveAttachments(parsed, service, userId)
  const calculated = calculateFabricationEstimate(service.catalog, parsed.input)
  if (!calculated.ok) fail(calculated.error, calculated.status || 400)
  return { service, snapshot: calculated.value }
}

export async function estimateFabrication(body, userId) {
  const parsed = parseFabricationSubmission(body)
  return (await prepareEstimate(parsed, userId)).snapshot
}

export async function shapeFabricationRequest(record) {
  const doc = record.toObject?.() || record
  const image = doc.imageAssetId ? await FabricationAsset.findOne({ assetId: doc.imageAssetId }).lean() : null
  const reference = doc.referenceAssetId ? await FabricationAsset.findOne({ assetId: doc.referenceAssetId }).lean() : null
  return {
    requestId: doc.requestId, creatorUserId: doc.creatorUserId, customerUserId: doc.customerUserId,
    status: doc.status, snapshot: doc.snapshot, customerPersonalization: doc.customerPersonalization,
    personalization: doc.personalization, providerNote: doc.providerNote,
    confirmedPrice: doc.confirmedPrice, confirmedCurrency: 'sgd',
    createdAt: doc.createdAt, updatedAt: doc.updatedAt, revision: doc.revision || 0,
    image: image ? await shapeFabricationAsset(image) : null,
    reference: reference ? await shapeFabricationAsset(reference) : null,
  }
}

function checkReplay(existing, parsed) {
  if (existing.submissionFingerprint !== parsed.fingerprint) fail('This request ID was already used for a different submission. Start a new request.', 409, 'idempotency_conflict')
  return existing
}

export async function createFabricationRequest(body, userId) {
  if (!userId) fail('Sign in to submit your request.', 401)
  const parsed = parseFabricationSubmission(body, true)
  await ensureRequestIndexes()
  const identity = { customerUserId: userId, clientRequestId: parsed.clientRequestId }
  const existing = await FabricationRequest.findOne(identity).lean()
  // An exact retry reads its already-created job even after the creator downgrades.
  if (existing) return { request: await shapeFabricationRequest(checkReplay(existing, parsed)), created: false }
  const { service, snapshot } = await prepareEstimate(parsed, userId)
  let reservation
  try { reservation = await reserveCreatorQuota(service.creator.userId, 'monthlyPrintRequests') } catch (error) {
    // A concurrent duplicate may have filled the last monthly slot.
    const winner = await FabricationRequest.findOne(identity).lean()
    if (winner) return { request: await shapeFabricationRequest(checkReplay(winner, parsed)), created: false }
    throw error
  }
  let stored
  try {
    stored = await FabricationRequest.create({
      ...identity, requestId: randomUUID(), creatorUserId: service.creator.userId,
      submissionFingerprint: parsed.fingerprint, status: 'submitted',
      snapshot, imageAssetId: parsed.imageAssetId, referenceAssetId: parsed.referenceAssetId,
      customerPersonalization: snapshot.personalization || null,
      personalization: snapshot.personalization || null,
    })
  } catch (error) {
    if (error?.code === 11000) {
      await reservation.release()
      const winner = await FabricationRequest.findOne(identity).lean()
      if (winner) return { request: await shapeFabricationRequest(checkReplay(winner, parsed)), created: false }
    } else if (['ValidationError', 'CastError'].includes(error?.name) || [121, 10334, 66].includes(error?.code)) {
      await reservation.release()
    } else {
      const winner = await FabricationRequest.findOne(identity).lean()
      // A network failure can be reported before the database commits the write.
      // Retain its allowance even if an immediate read cannot yet find the row.
      if (winner) return { request: await shapeFabricationRequest(checkReplay(winner, parsed)), created: false }
    }
    throw error
  }
  return { request: await shapeFabricationRequest(stored), created: true }
}

const TRANSITIONS = {
  submitted: ['submitted', 'quoted', 'cancelled'],
  quoted: ['quoted', 'in_progress', 'cancelled'],
  in_progress: ['in_progress', 'completed', 'cancelled'],
  completed: ['completed'], cancelled: ['cancelled'],
}

export function fabricationUpdate(body, request) {
  const allowed = ['expectedUpdatedAt', 'status', 'providerNote', 'confirmedPrice', 'personalization']
  if (Object.keys(body).some(key => !allowed.includes(key))) fail('Unsupported request update.')
  const expected = new Date(body.expectedUpdatedAt)
  if (typeof body.expectedUpdatedAt !== 'string' || !Number.isFinite(expected.getTime())) fail('Reload the request before updating it.')
  if (expected.getTime() !== new Date(request.updatedAt).getTime()) fail('This request changed. Reload it before updating.', 409, 'version_conflict')
  if (['completed', 'cancelled'].includes(request.status)) fail('This request is closed.', 409)
  const update = {}
  if (body.status !== undefined) {
    if (!TRANSITIONS[request.status]?.includes(body.status)) fail('That status change is not allowed.', 409)
    update.status = body.status
  }
  if (body.providerNote !== undefined) {
    if (typeof body.providerNote !== 'string' || body.providerNote.length > 2000 || /[<>\x00-\x08\x0b\x0c\x0e-\x1f]/.test(body.providerNote)) fail('Use a plain-text note up to 2,000 characters.')
    update.providerNote = body.providerNote.trim()
  }
  if (body.confirmedPrice !== undefined) {
    const price = body.confirmedPrice
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 100000 || Math.abs(price * 100 - Math.round(price * 100)) > 1e-7) fail('Enter a valid confirmed SGD price, using whole cents.')
    update.confirmedPrice = price
  }
  if (body.personalization !== undefined) {
    if (!request.imageAssetId) fail('This request has no image for text placement.')
    const checked = validateFabricationPersonalization(body.personalization)
    if (!checked.ok) fail(checked.error)
    update.personalization = checked.value
  }
  if (['quoted', 'in_progress', 'completed'].includes(update.status) && update.confirmedPrice == null && request.confirmedPrice == null) {
    fail('Confirm the SGD price before accepting this job.')
  }
  if (!Object.keys(update).length) fail('Choose a change to save.')
  return { expected, update }
}

export async function updateFabricationRequest(requestId, body, userId) {
  if (!userId) fail('Unauthorized.', 401)
  const identity = { requestId: checkedId(requestId, 'request ID'), creatorUserId: userId }
  const request = await FabricationRequest.findOne(identity).lean()
  if (!request) fail('Request not found.', 404)
  const { expected, update } = fabricationUpdate(body, request)
  const updatedAt = new Date(Math.max(Date.now(), expected.getTime() + 1))
  const saved = await FabricationRequest.findOneAndUpdate({ ...identity, updatedAt: expected,
    revision: request.revision || 0, status: request.status }, {
    $set: { ...update, updatedAt }, $inc: { revision: 1 },
  }, { new: true, runValidators: true, timestamps: false }).lean()
  if (!saved) fail('This request changed. Reload it before updating.', 409, 'version_conflict')
  return shapeFabricationRequest(saved)
}
