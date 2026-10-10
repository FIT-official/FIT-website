import { createHash, randomUUID } from 'node:crypto'
import { fail } from '@/lib/fabrication/serverHttp'
import { contentFields, entryId, exactFields, newContent, pageFilter, pageResult, PAGE_SIZE, plainText, REPORT_REASONS, revision, STATUSES, TOPICS } from './validate'

export function publicEntry(row) {
  return { entryId: row.entryId, kind: row.kind, parentId: row.parentId || null, displayName: row.displayName,
    title: row.title || '', body: row.body, topic: row.topic || '', revision: row.revision,
    createdAt: new Date(row.createdAt).toISOString(), publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : null }
}
export const privateEntry = row => ({ ...publicEntry(row), status: row.status, moderationNote: row.moderationNote || '', updatedAt: new Date(row.updatedAt).toISOString() })
const staffEntry = row => ({ ...privateEntry(row), audit: (row.audit || []).map(item => ({ action: item.action, at: item.at, revision: item.revision, note: item.note || '' })) })
const cursorRows = (collection, filter, id = 'entryId') => collection.find(filter).sort({ createdAt: -1, [id]: -1 }).limit(PAGE_SIZE + 1).toArray()
const event = (action, actor, version, note = '') => ({ action, actor, revision: version, at: new Date(), note })
const changes = (set, action, actor, version, note = '') => ({ $set: { ...set, updatedAt: new Date() }, $inc: { revision: 1 }, $push: { audit: { $each: [event(action, actor, version + 1, note)], $slice: -50 } } })

// Collections are explicit so the same persistence rules run against owned local
// Mongo fixtures without loading Clerk, Redis, email or production credentials.
export function communityStore(entries, reports) {
  async function approvedPost(id) {
    const row = await entries.findOne({ entryId: entryId(id), parentId: null, status: 'approved' })
    if (!row) fail('This discussion is not available.', 404)
    return row
  }
  async function visibleEntry(id) {
    const row = await entries.findOne({ entryId: entryId(id), status: 'approved' })
    if (!row) fail('This item is not available.', 404)
    if (row.parentId) await approvedPost(row.parentId)
    return row
  }
  async function create(body, ownerUserId, parentId = null) {
    const value = newContent(body, parentId ? 'comment' : body.kind)
    if (parentId) parentId = entryId(parentId)
    const identity = { ownerUserId, clientRequestId: value.clientRequestId }
    const hash = createHash('sha256').update(JSON.stringify({ ...value, parentId })).digest('hex')
    const replay = row => {
      if (row.submissionFingerprint !== hash) fail('This submission reference belongs to different content. Check My submissions before retrying.', 409)
      return { entry: privateEntry(row), created: false }
    }
    const saved = await entries.findOne(identity)
    if (saved) return replay(saved)
    if (parentId) await approvedPost(parentId)
    const now = new Date()
    const row = { ...value, ...identity, entryId: randomUUID(), parentId, submissionFingerprint: hash,
      status: 'pending', revision: 1, moderationNote: '', createdAt: now, updatedAt: now, publishedAt: null,
      audit: [event('submitted', ownerUserId, 1)] }
    try { await entries.insertOne(row); return { entry: privateEntry(row), created: true } }
    catch (error) {
      // Only recover an actual matching write, never claim a failed save succeeded.
      const winner = await entries.findOne(identity)
      if (winner) return replay(winner)
      throw error
    }
  }
  async function edit(id, body, ownerUserId) {
    id = entryId(id); const version = revision(body.revision)
    if (!['edit', 'withdraw'].includes(body.action)) fail('Choose an available action.')
    const row = await entries.findOne({ entryId: id, ownerUserId })
    if (!row) fail('Submission not found.', 404)
    exactFields(body, body.action === 'withdraw' ? ['action', 'revision'] : ['action', 'revision', 'displayName', 'body', ...(row.kind === 'comment' ? [] : ['title', 'topic'])])
    if (row.status === 'withdrawn') fail('This submission has been withdrawn.', 409)
    if (body.action === 'edit' && row.parentId) await approvedPost(row.parentId)
    const set = body.action === 'withdraw' ? { status: 'withdrawn', publishedAt: null } : { ...contentFields(body, row.kind), status: 'pending', moderationNote: '', publishedAt: null }
    const updated = await entries.findOneAndUpdate({ entryId: id, ownerUserId, revision: version, status: { $ne: 'withdrawn' } }, changes(set, body.action, ownerUserId, version), { returnDocument: 'after', includeResultMetadata: false })
    if (!updated) fail('This submission changed. Refresh before trying again.', 409)
    return { entry: privateEntry(updated) }
  }
  async function list(params, ownerUserId = null) {
    let filter = ownerUserId ? { ownerUserId } : { status: 'approved', parentId: null }
    if (!ownerUserId) {
      const kind = params.get('kind') || 'all', topic = params.get('topic') || 'all'
      if (!['all', 'question', 'project'].includes(kind) || !['all', ...TOPICS].includes(topic)) fail('Choose a valid community filter.')
      if (kind !== 'all') filter.kind = kind
      if (topic !== 'all') filter.topic = topic
    }
    filter = pageFilter(params, filter)
    const result = pageResult(await cursorRows(entries, filter), ownerUserId ? privateEntry : row => ({ ...publicEntry(row), body: row.body.slice(0, 240) }))
    if (ownerUserId) {
      const ids = [...new Set(result.items.map(row => row.parentId).filter(Boolean))]
      const parents = ids.length ? await entries.find({ entryId: { $in: ids }, parentId: null, status: 'approved' }).limit(PAGE_SIZE).toArray() : []
      return { ...result, items: result.items.map(row => ({ ...row, discussionAvailable: !row.parentId || parents.some(parent => parent.entryId === row.parentId) })) }
    }
    return result
  }
  async function detail(id, params) {
    id = entryId(id)
    const post = await approvedPost(id)
    const result = pageResult(await cursorRows(entries, pageFilter(params, { parentId: id, status: 'approved', kind: 'comment' })), publicEntry)
    // A parent hidden while the comments query runs must not expose its thread.
    const current = await approvedPost(id)
    if (current.revision !== post.revision) fail('This discussion changed. Refresh to continue.', 409)
    return { entry: publicEntry(current), comments: result.items, nextCursor: result.nextCursor }
  }
  async function report(id, body, reporterUserId) {
    id = entryId(id)
    exactFields(body, ['revision', 'reason', 'details'])
    const version = revision(body.revision)
    if (!REPORT_REASONS.includes(body.reason)) fail('Choose a report reason.')
    const details = plainText(body.details === undefined ? '' : body.details, 'report details', 0, 1000)
    const row = await visibleEntry(id)
    if (row.revision !== version) fail('This item changed. Refresh before reporting it.', 409)
    const identity = { entryId: id, entryRevision: version, reporterUserId }
    if (!await reports.findOne(identity)) {
      try { await reports.insertOne({ ...identity, reportId: randomUUID(), reason: body.reason, details, snapshot: publicEntry(row), status: 'open', createdAt: new Date() }) }
      catch (error) { if (error.code !== 11000) throw error }
    }
    return { received: true }
  }
  async function queue(params) {
    const view = params.get('view') || 'pending'
    if (view === 'reports' || view === 'resolved-reports') {
      const rows = await cursorRows(reports, pageFilter(params, { status: view === 'reports' ? 'open' : 'resolved' }, 'createdAt', 'reportId'), 'reportId')
      const result = pageResult(rows, row => ({ reportId: row.reportId, entryId: row.entryId, entryRevision: row.entryRevision, reason: row.reason, details: row.details, snapshot: row.snapshot, status: row.status, createdAt: row.createdAt, resolutionNote: row.resolutionNote || '' }), 'createdAt', 'reportId')
      const ids = result.items.map(row => row.entryId)
      const current = ids.length ? await entries.find({ entryId: { $in: ids } }).limit(PAGE_SIZE).toArray() : []
      return { ...result, items: result.items.map(row => ({ ...row, current: current.find(item => item.entryId === row.entryId) ? staffEntry(current.find(item => item.entryId === row.entryId)) : null })) }
    }
    if (!STATUSES.includes(view)) fail('Choose a moderation queue.')
    const result = pageResult(await cursorRows(entries, pageFilter(params, { status: view })), staffEntry)
    const ids = [...new Set(result.items.map(row => row.parentId).filter(Boolean))]
    const parents = ids.length ? await entries.find({ entryId: { $in: ids }, parentId: null }).limit(PAGE_SIZE).toArray() : []
    return { ...result, items: result.items.map(row => ({ ...row, parent: row.parentId ? (() => { const parent = parents.find(item => item.entryId === row.parentId); return parent ? { entryId: parent.entryId, title: parent.title, status: parent.status } : null })() : null })) }
  }
  async function moderate(body, adminUserId) {
    if (body.action === 'resolve_report') {
      exactFields(body, ['action', 'reportId', 'note'])
      const note = plainText(body.note, 'a resolution note', 3, 500)
      const row = await reports.findOneAndUpdate({ reportId: entryId(body.reportId), status: 'open' }, { $set: { status: 'resolved', resolvedAt: new Date(), resolvedBy: adminUserId, resolutionNote: note } }, { returnDocument: 'after', includeResultMetadata: false })
      if (!row) fail('This report changed. Refresh the queue.', 409)
      return { resolved: true }
    }
    exactFields(body, ['action', 'entryId', 'revision', 'note'])
    if (!['approve', 'reject', 'hide'].includes(body.action)) fail('Choose a moderation action.')
    const id = entryId(body.entryId), version = revision(body.revision)
    const note = plainText(body.note === undefined ? '' : body.note, 'a moderation note', body.action === 'approve' ? 0 : 3, 500)
    const row = await entries.findOne({ entryId: id })
    if (!row) fail('Submission not found.', 404)
    if (row.parentId && body.action === 'approve') await approvedPost(row.parentId)
    const expectedStatus = body.action === 'hide' ? 'approved' : 'pending'
    const status = { approve: 'approved', reject: 'rejected', hide: 'hidden' }[body.action]
    const updated = await entries.findOneAndUpdate({ entryId: id, revision: version, status: expectedStatus }, changes({ status, moderationNote: note, publishedAt: status === 'approved' ? new Date() : null }, body.action, adminUserId, version, note), { returnDocument: 'after', includeResultMetadata: false })
    if (!updated) fail('This submission changed. Refresh before moderating it.', 409)
    return { entry: staffEntry(updated) }
  }
  return { create, edit, list, detail, report, queue, moderate }
}
