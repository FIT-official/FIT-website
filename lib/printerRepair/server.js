import { createHash, randomUUID } from 'node:crypto'
import PrinterRepairRequest from '@/models/PrinterRepairRequest'
import { findOwnedAsset, shapeFabricationAsset } from '@/lib/fabrication/serverAssets'
import { checkedClientRequestId, checkedId, fail } from '@/lib/fabrication/serverHttp'
import { repairEmailSummary } from './ownerEmail'
import { singaporeToday, validateRepairSubmission } from './validate'

let indexesReady
async function ensureIndexes() {
  if (!indexesReady) indexesReady = PrinterRepairRequest.createIndexes().catch(error => { indexesReady = null; throw error })
  await indexesReady
}
export function requireRepairOrigin(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') fail('Open the request form on this website and try again.', 403, 'invalid_origin')
}
export function shapeRepairRequest(row) {
  const record = row.toObject?.() || row
  return { requestId: record.requestId, status: record.status, brief: record.brief, photoCount: record.photoAssetIds.length, preferredDateNeedsDiscussion: Boolean(record.brief.preferredDate && record.brief.preferredDate < singaporeToday()), createdAt: record.createdAt, updatedAt: record.updatedAt }
}
const fingerprint = value => createHash('sha256').update(JSON.stringify({ brief: value.brief, photoAssetIds: [...value.photoAssetIds].sort() })).digest('hex')
function replay(record, hash) {
  if (record.submissionFingerprint !== hash) fail('This request ID belongs to an earlier version. Retry that version.', 409, 'idempotency_conflict')
  return { request: shapeRepairRequest(record), created: false }
}
export async function createRepairRequest(body, userId) {
  if (!userId) fail('Sign in to send your assessment request.', 401)
  const checked = validateRepairSubmission(body)
  if (!checked.ok) fail(checked.error)
  const value = checked.value, hash = fingerprint(value)
  const identity = { customerUserId: userId, clientRequestId: value.clientRequestId }
  await ensureIndexes()
  const existing = await PrinterRepairRequest.findOne(identity).lean()
  // An unchanged retry remains valid even if its preferred date is now past.
  if (existing) return replay(existing, hash)
  // A delayed retry may first arrive after the requested date. Preserve its
  // exact identity and brief; flag the elapsed preference for discussion.
  // It never creates a calendar slot. New browser drafts require future dates.
  for (const assetId of value.photoAssetIds) await findOwnedAsset(assetId, userId, 'image')
  try {
    const record = await PrinterRepairRequest.create({ ...identity, requestId: randomUUID(), submissionFingerprint: hash, status: 'assessment_requested', notifications: { email: { status: 'pending', attempts: 0 } }, brief: value.brief, photoAssetIds: value.photoAssetIds })
    return { request: shapeRepairRequest(record), created: true }
  } catch (error) {
    // Recover a concurrent unique-key winner or an uncertain committed write.
    const winner = await PrinterRepairRequest.findOne(identity).lean()
    if (winner) return replay(winner, hash)
    throw error
  }
}
export async function ownedRepairRequest(requestId, userId) {
  const row = await PrinterRepairRequest.findOne({ requestId: checkedId(requestId, 'request ID'), customerUserId: userId }).lean()
  if (!row) fail('Request not found.', 404, 'not_found')
  return row
}
export async function recoverRepairRequest(clientRequestId, userId) {
  const row = await PrinterRepairRequest.findOne({ clientRequestId: checkedClientRequestId(clientRequestId), customerUserId: userId }).lean()
  if (!row) fail('No saved request was found. You can retry the same request.', 404, 'not_found')
  return shapeRepairRequest(row)
}
export async function withdrawRepairRequest(requestId, userId) {
  await ownedRepairRequest(requestId, userId)
  const row = await PrinterRepairRequest.findOneAndUpdate({ requestId, customerUserId: userId }, { $set: { status: 'withdrawn' } }, { new: true, runValidators: true }).lean()
  if (!row) fail('Request not found.', 404, 'not_found')
  return shapeRepairRequest(row)
}
export async function repairTriageDraft(row) {
  const request = shapeRepairRequest(row)
  const photos = []
  for (const assetId of row.photoAssetIds) photos.push(await shapeFabricationAsset(await findOwnedAsset(assetId, row.customerUserId, 'image')))
  // A staff-only handoff, never a quote, calendar reservation, order or charge.
  return { schemaVersion: 1, service: 'printer_repair', request, photos, ownerEmail: repairEmailSummary(row),
    quoteDraft: { sourceRequestId: row.requestId, status: row.status === 'withdrawn' ? 'closed' : 'needs_assessment', scope: null, price: null, appointment: null, customerApproval: 'required_before_work' } }
}
