import mongoose from 'mongoose'
import { createHash, randomUUID } from 'node:crypto'
import CommunityEntry from '@/models/CommunityEntry'
import CommunityReport from '@/models/CommunityReport'
import CommunityAccountState from '@/models/CommunityAccountState'
import BlogPost from '@/models/BlogPost'
import User from '@/models/User'
import CustomPrintRequest from '@/models/CustomPrintRequest'
import FabricationRequest from '@/models/FabricationRequest'
import CreatorPrintService from '@/models/CreatorPrintService'
import CreatorFabricationService from '@/models/CreatorFabricationService'
import { effectiveStatus } from '@/lib/blog/status'
import { fail } from '@/lib/fabrication/serverHttp'
import { COMMUNITY_POLICY, REPORT_REASONS, classifyContent, completedOrderEligibility, plainText, publicEntry, validOperationId, validateEntry, validateModeration } from './policy'

let indexPromise
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const query = (builder, session) => session ? builder.session(session) : builder
const lean = (builder, session) => query(builder, session).lean()
export function requireCommunityOrigin(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') fail('Open this form on FIT and try again.', 403)
}
async function indexes() {
  if (!indexPromise) indexPromise = Promise.all([CommunityEntry.createIndexes(), CommunityReport.createIndexes(), CommunityAccountState.createIndexes()]).catch(error => { indexPromise = null; throw error })
  await indexPromise
}
async function transaction(work) {
  const session = await mongoose.startSession()
  try { let result; await session.withTransaction(async () => { result = await work(session) }); return result }
  finally { await session.endSession() }
}
export async function requirePublicSubject(kind, subject, session) {
  if (!['blog_comment', 'shop_review', 'shop_reply'].includes(kind) || typeof subject !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(subject)) fail('Choose a valid article or hosted shop.')
  if (kind === 'blog_comment') {
    const article = await lean(BlogPost.findOne({ slug: subject }), session)
    if (effectiveStatus(article) !== 'published') fail('Article not found.', 404)
    return
  }
  const owner = await lean(User.findOne({ userId: subject }).select('userId shop.published'), session)
  if (!owner || owner.shop?.published === false) fail('Hosted shop not found.', 404)
  const print = await lean(CreatorPrintService.findOne({ creatorUserId: subject, enabled: true }), session)
  const fabrication = await lean(CreatorFabricationService.findOne({ creatorUserId: subject }), session)
  if (!print && !(fabrication?.catalog ? fabrication.catalog.enabled === true : fabrication?.enabled === true)) fail('Printing service not found.', 404)
}
async function postingAllowed(actor, session) {
  const state = await lean(CommunityAccountState.findOne({ userId: actor }), session)
  if (state?.postingSuspended || (state?.restrictedUntil && new Date(state.restrictedUntil).getTime() > Date.now())) fail('Posting is restricted on this account. Contact FIT to request a review.', 403, 'posting_restricted')
}
export async function eligibleRequests(actor, subject) {
  if (!actor) fail('Sign in to see your completed requests.', 401)
  await requirePublicSubject('shop_review', subject)
  if (actor === subject) return []
  const print = await CustomPrintRequest.find({ userId: actor, creatorUserId: subject, status: 'delivered' }).select('requestId createdAt').sort({ createdAt: -1 }).limit(20).lean()
  const fabrication = await FabricationRequest.find({ customerUserId: actor, creatorUserId: subject, status: 'completed' }).select('requestId createdAt').sort({ createdAt: -1 }).limit(20).lean()
  const candidates = [...print.map(row => ({ orderType: 'print_request', orderId: row.requestId })), ...fabrication.map(row => ({ orderType: 'fabrication_request', orderId: row.requestId }))]
  const prior = await CommunityEntry.find({ kind: 'shop_review', verifiedOrderKey: { $in: candidates.map(row => row.orderType + ':' + row.orderId) } }).select('verifiedOrderKey').lean()
  const used = new Set(prior.map(row => row.verifiedOrderKey))
  return candidates.filter(row => !used.has(row.orderType + ':' + row.orderId))
}
export async function createEntry(body, actor) {
  if (!actor) fail('Sign in to post a comment or review.', 401)
  const checked = validateEntry(body)
  if (checked.error) fail(checked.error)
  const value = checked.value, fingerprint = hash(value)
  await indexes()
  const identity = { authorUserId: actor, clientRequestId: value.clientRequestId }
  const prior = await CommunityEntry.findOne(identity).lean()
  if (prior) {
    if (prior.submissionFingerprint !== fingerprint) fail('This reference belongs to an earlier version. Retry those details unchanged.', 409)
    return { entry: publicEntry(prior), hidden: prior.visibility === 'hidden', replayed: true }
  }
  try {
    return await transaction(async session => {
      await requirePublicSubject(value.kind, value.subject, session)
      // Serialize posting with an admin restriction so a concurrent suspension
      // cannot commit while this transaction uses an older account snapshot.
      await lockAccount(actor, session)
      await postingAllowed(actor, session)
      let verifiedOrderKey
      if (value.kind === 'shop_review') {
        const Model = value.orderType === 'print_request' ? CustomPrintRequest : FabricationRequest
        const record = await lean(Model.findOne({ requestId: value.orderId }), session)
        if (!completedOrderEligibility(record, actor, value.subject, value.orderType)) fail('A completed request for this shop is required. You cannot review your own shop.', 403, 'review_not_eligible')
        verifiedOrderKey = value.orderType + ':' + value.orderId
      }
      if (value.kind === 'shop_reply') {
        const parent = await lean(CommunityEntry.findOne({ entryId: value.replyTo, kind: 'shop_review', subject: value.subject, visibility: 'visible' }), session)
        if (!parent || actor !== parent.subject) fail('Only this shop can respond to this visible review.', 403)
      }
      const rows = await CommunityEntry.create([{ entryId: randomUUID(), ...identity, subject: value.subject, kind: value.kind,
        publicName: value.publicName, body: value.body, rating: value.rating, verifiedOrderKey,
        replyTo: value.replyTo || undefined, submissionFingerprint: fingerprint, flags: classifyContent(value.body, value.rating),
        visibility: 'visible', revision: 0 }], { session })
      return { entry: publicEntry(rows[0]), replayed: false }
    })
  } catch (error) {
    if (error.code !== 11000) throw error
    const winner = await CommunityEntry.findOne(identity).lean()
    if (winner && winner.submissionFingerprint === fingerprint) return { entry: publicEntry(winner), replayed: true }
    fail('This completed request already has a review, or this review already has a shop response.', 409)
  }
}
function cursorQuery(cursor) {
  if (!cursor) return {}
  const [date, id, extra] = cursor.split('|')
  if (extra || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(date || '') || !Number.isFinite(Date.parse(date)) || !validOperationId(id)) fail('Invalid comment page.')
  return { $or: [{ createdAt: { $lt: new Date(date) } }, { createdAt: new Date(date), entryId: { $lt: id } }] }
}
export async function publicEntries(kind, subject, cursor) {
  if (!['blog_comment', 'shop_review'].includes(kind)) fail('Choose comments or shop reviews.')
  await requirePublicSubject(kind, subject)
  const rows = await CommunityEntry.find({ kind, subject, visibility: 'visible', ...cursorQuery(cursor) }).sort({ createdAt: -1, entryId: -1 }).limit(21).lean()
  const page = rows.slice(0, 20), last = page.at(-1)
  const replies = kind === 'shop_review' ? await CommunityEntry.find({ kind: 'shop_reply', visibility: 'visible', subject, replyTo: { $in: page.map(row => row.entryId) } }).lean() : []
  const totals = kind === 'shop_review' ? await CommunityEntry.aggregate([
    { $match: { kind: 'shop_review', subject, visibility: 'visible' } }, { $group: { _id: null, count: { $sum: 1 }, average: { $avg: '$rating' } } },
  ]) : []
  return { entries: page.map(publicEntry), replies: replies.map(publicEntry),
    rating: kind === 'shop_review' ? { count: totals[0]?.count || 0, average: totals[0]?.average ?? null } : null,
    nextCursor: rows.length > 20 ? new Date(last.createdAt).toISOString() + '|' + last.entryId : null,
    policy: { immediatePublication: true, negativeFeedbackIsAbuse: false, automaticRestrictionsEnabled: false } }
}
export async function reportEntry(entryId, body, actor) {
  if (!validOperationId(entryId) || !body || typeof body !== 'object' || Array.isArray(body) ||
    Object.keys(body).some(key => !['reason', 'detail'].includes(key)) || !REPORT_REASONS.includes(body.reason) ||
    (body.detail && !plainText(body.detail, 500))) fail('Choose a report reason and use plain text.')
  const entry = await CommunityEntry.findOne({ entryId, visibility: 'visible' }).lean()
  if (!entry) fail('Comment or review not found.', 404)
  await indexes()
  return transaction(async session => {
    const report = await CommunityReport.updateOne({ entryId, reporterUserId: actor }, { $setOnInsert: { reason: body.reason, detail: body.detail?.trim() || '', resolved: false } }, { upsert: true, session })
    // New reports invalidate an admin's earlier view. Duplicate reports stay
    // idempotent and do not manufacture another incident or revision.
    if (report.upsertedCount === 1) await CommunityEntry.updateOne({ entryId }, { $addToSet: { flags: 'reported' }, $inc: { revision: 1 } }, { session })
    return { reported: true }
  })
}
export async function adminEntries(view = 'flagged', cursor) {
  if (!['flagged', 'all', 'hidden'].includes(view)) fail('Choose a valid moderation view.')
  const filter = view === 'flagged' ? { 'flags.0': { $exists: true } } : view === 'hidden' ? { visibility: 'hidden' } : {}
  const rows = await CommunityEntry.find({ ...filter, ...cursorQuery(cursor) }).sort({ createdAt: -1, entryId: -1 }).limit(21).lean()
  const page = rows.slice(0, 20), last = page.at(-1)
  return { entries: await Promise.all(page.map(async row => ({ ...publicEntry(row), subject: row.subject, visibility: row.visibility, flags: row.flags, abuseConfirmed: row.abuseConfirmed, revision: row.revision, audit: row.audit,
    reports: await CommunityReport.find({ entryId: row.entryId, resolved: false }).select('reason detail createdAt').lean(),
    confirmedAbuseCount: await CommunityEntry.countDocuments({ authorUserId: row.authorUserId, abuseConfirmed: true }),
    postingState: await postingStateForAdmin(row.authorUserId) }))),
    nextCursor: rows.length > 20 ? new Date(last.createdAt).toISOString() + '|' + last.entryId : null,
    policy: COMMUNITY_POLICY }
}
async function lockAccount(actor, session) {
  await CommunityAccountState.updateOne({ userId: actor }, { $inc: { revision: 1 } }, { upsert: true, session })
}
async function postingStateForAdmin(actor) {
  const state = await CommunityAccountState.findOne({ userId: actor }).select('revision restrictedUntil postingSuspended').lean()
  return { revision: state?.revision || 0, restrictedUntil: state?.restrictedUntil || null, postingSuspended: state?.postingSuspended === true }
}
export async function moderateEntry(entryId, body, admin) {
  if (!validOperationId(entryId)) fail('Choose a valid comment or review.')
  const checked = validateModeration(body)
  if (checked.error) fail(checked.error)
  const value = checked.value, fingerprint = hash(value)
  await indexes()
  return transaction(async session => {
    const row = await lean(CommunityEntry.findOne({ entryId }), session)
    if (!row) fail('Comment or review not found.', 404)
    const prior = row.audit?.find(event => event.operationId === value.operationId)
    if (prior) {
      if (prior.fingerprint !== fingerprint) fail('This operation reference was already used.', 409)
      return { updated: true, replayed: true }
    }
    if (row.revision !== value.expectedRevision) fail('This item changed. Refresh before moderating it.', 409)
    await lockAccount(row.authorUserId, session)
    const change = value.action === 'hide' ? { visibility: 'hidden' } : value.action === 'restore' ? { visibility: 'visible' }
      : value.action === 'mark_reviewed' ? { flags: [] } : { abuseConfirmed: value.action === 'confirm_abuse' }
    const result = await CommunityEntry.updateOne({ entryId, revision: value.expectedRevision }, {
      $set: change, $inc: { revision: 1 }, $push: { audit: { ...value, actorUserId: admin, at: new Date(), fingerprint } },
    }, { session, runValidators: true })
    if (result.matchedCount !== 1) fail('This item changed. Refresh before moderating it.', 409)
    if (value.action === 'mark_reviewed') await CommunityReport.updateMany({ entryId, resolved: false }, { $set: { resolved: true, resolvedBy: admin, resolvedAt: new Date() } }, { session })
    // Criticism/low stars remain public unless a FIT admin explicitly changes visibility.
    // Flags and confirmations never automatically suspend an account.
    return { updated: true, replayed: false }
  })
}
export async function restrictAuthor(entryId, body, admin) {
  if (!validOperationId(entryId) || !body || typeof body !== 'object' || Array.isArray(body) ||
    Object.keys(body).some(key => !['operationId', 'expectedRevision', 'expectedAccountRevision', 'action', 'reason', 'until'].includes(key)) ||
    !validOperationId(body.operationId) || !['restrict_posting', 'suspend_posting', 'restore_posting'].includes(body.action) ||
    !Number.isInteger(body.expectedRevision) || body.expectedRevision < 0 ||
    !Number.isInteger(body.expectedAccountRevision) || body.expectedAccountRevision < 0 ||
    !plainText(body.reason, 500, 5)) fail('Choose an account action and document the reason.')
  if (body.action === 'restrict_posting' && (typeof body.until !== 'string' || !Number.isFinite(Date.parse(body.until)) ||
    new Date(body.until).getTime() <= Date.now())) fail('Choose an explicit future end date for a temporary restriction.')
  await indexes()
  const fingerprint = hash({ operationId: body.operationId, expectedRevision: body.expectedRevision, expectedAccountRevision: body.expectedAccountRevision, action: body.action, reason: body.reason.trim(), until: body.action === 'restrict_posting' ? new Date(body.until).toISOString() : null })
  return transaction(async session => {
    const source = await lean(CommunityEntry.findOne({ entryId }), session)
    if (!source) fail('Comment or review not found.', 404)
    const account = await lean(CommunityAccountState.findOne({ userId: source.authorUserId }), session) || { revision: 0, audit: [] }
    const previous = account.audit?.find(event => event.operationId === body.operationId)
    if (previous) {
      if (previous.fingerprint !== fingerprint) fail('This operation reference was already used.', 409)
      return { updated: true, replayed: true }
    }
    if (source.revision !== body.expectedRevision || account.revision !== body.expectedAccountRevision) fail('This post or account changed. Refresh before changing posting access.', 409)
    await lockAccount(source.authorUserId, session)
    const confirmed = await query(CommunityEntry.countDocuments({ authorUserId: source.authorUserId, abuseConfirmed: true }), session)
    if (body.action !== 'restore_posting' && confirmed === 0) fail('Substantiated abuse is required. Negative feedback and reports alone do not justify a posting restriction.', 409)
    const change = body.action === 'restore_posting' ? { postingSuspended: false, restrictedUntil: null }
      : body.action === 'suspend_posting' ? { postingSuspended: true, restrictedUntil: null }
      : { postingSuspended: false, restrictedUntil: new Date(body.until) }
    await CommunityAccountState.updateOne({ userId: source.authorUserId }, { $set: change, $push: { audit: {
      operationId: body.operationId, actorUserId: admin, action: body.action, reason: body.reason.trim(),
      at: new Date(), until: change.restrictedUntil, sourceEntryId: entryId, fingerprint,
    } } }, { session, runValidators: true })
    return { updated: true, replayed: false, scope: 'comments_and_shop_reviews_only' }
  })
}
