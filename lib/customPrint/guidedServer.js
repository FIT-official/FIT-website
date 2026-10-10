import { createHash } from 'node:crypto'
import CustomPrintRequest from '@/models/CustomPrintRequest'
import { findOwnedAsset } from '@/lib/fabrication/serverAssets'
import { checkedClientRequestId, fail } from '@/lib/fabrication/serverHttp'
import { validateGuidedBrief } from './guidedBrief'

let indexesReady
export async function createGuidedRequest(body, user) {
  const clientId = checkedClientRequestId(body.clientRequestId)
  const checked = validateGuidedBrief(body.brief)
  if (checked.error) fail(checked.error)
  const assetId = body.assetId || null
  if (assetId !== null && (typeof assetId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(assetId))) fail('Invalid model attachment.')
  const fingerprint = createHash('sha256').update(JSON.stringify({ brief: checked.value, assetId })).digest('hex')
  const requestId = 'guided-' + createHash('sha256').update(`${user.userId}:${clientId}`).digest('hex').slice(0, 40)
  if (!indexesReady) indexesReady = CustomPrintRequest.createIndexes().catch(error => { indexesReady = null; throw error })
  await indexesReady
  const replay = doc => {
    if (doc.userId !== user.userId || doc.guidedFingerprint !== fingerprint) fail('This submission ID was used for a different brief. Restore that brief or start a new one.', 409)
    return { requestId: doc.requestId, status: doc.status, created: false }
  }
  const existing = await CustomPrintRequest.findOne({ requestId }).lean()
  if (existing) return replay(existing)
  if (assetId) {
    const asset = await findOwnedAsset(assetId, user.userId, 'reference')
    if (!/\.(stl|obj|3mf)$/i.test(asset.originalName) || asset.byteLength > 3 * 1024 * 1024) fail('Attach a validated STL, OBJ or 3MF model up to 3 MB.')
  }
  try {
    const doc = await CustomPrintRequest.create({ requestId, ...user, source: 'upload', status: 'configured', quoteMode: 'manual', guidedBrief: checked.value, guidedAssetId: assetId, guidedFingerprint: fingerprint, guidedReview: { status: 'pending' }, customerNote: checked.value.notes, statusHistory: [{ status: 'configured', note: 'Guided enquiry received. File, dimensions, printability and paid-print permission require staff review.' }] })
    return { requestId: doc.requestId, status: doc.status, created: true }
  } catch (error) {
    const winner = await CustomPrintRequest.findOne({ requestId }).lean()
    if (winner) return replay(winner)
    throw error
  }
}
