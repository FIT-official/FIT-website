import 'server-only'
import { createHash } from 'node:crypto'
import { COLLECTION, LIMITS, STATUS } from './config.js'
import { emptyDoc } from './schema.js'

// Persistence for team/individual research records in ONE dedicated collection.
// Nothing here touches any existing class, workshop or student collection.

// Preview deployments get their own collection namespace, selected only from the server-owned
// Vercel environment (never from a cookie or request value). Same fail-closed rule as the workshop.
export function researchCollectionName(env = process.env) {
  if (env.VERCEL_ENV !== 'preview') return COLLECTION
  if (!/^[a-z0-9][a-z0-9.-]*\.vercel\.app$/i.test(env.VERCEL_URL || '')) throw new Error('Preview deployment identity is unavailable.')
  return 'researchPreview_' + createHash('sha256').update(env.VERCEL_URL.toLowerCase()).digest('hex').slice(0, 16) + '_' + COLLECTION
}

// No index is created automatically. Every record is found by its _id, which already owns the (class, scope,
// project) key and makes first saves atomic. An optional listing index for the teacher overview can be added
// later by an operator; it is deliberately not part of any request path.
export async function researchCollection() {
  const { connectToDatabase } = await import('@/lib/db')
  const db = (await connectToDatabase()).connection.db
  return db.collection(researchCollectionName())
}

export function recordId(classId, scope, slug) {
  return createHash('sha256').update(['research', classId, scope, slug].join('|')).digest('hex').slice(0, 40)
}

export function newRecord({ classId, scope, slug, doc, by, now }) {
  return {
    _id: recordId(classId, scope, slug),
    classId,
    scope,
    slug,
    revision: 1,
    reviewRevision: 0,
    status: STATUS.draft,
    ...doc,
    createdAt: now,
    updatedAt: now,
    updatedBy: by,
    submittedAt: null,
    safetyReview: null,
    keyRelease: null,
    feedback: [],
    events: [{ at: now, type: 'created', by, revision: 1 }],
    submissions: [],
  }
}

export function blankRecord({ classId, scope, slug }) {
  return {
    _id: recordId(classId, scope, slug), classId, scope, slug,
    revision: 0, reviewRevision: 0, status: STATUS.draft, ...emptyDoc(),
    createdAt: null, updatedAt: null, updatedBy: null, submittedAt: null,
    safetyReview: null, keyRelease: null, feedback: [], events: [], submissions: [],
  }
}

const target = (classId, scope, slug) => ({ _id: recordId(classId, scope, slug), classId, scope, slug })

export async function getRecord(collection, { classId, scope, slug }) {
  return collection.findOne(target(classId, scope, slug))
}

export async function listRecords(collection, { classId, slug }) {
  return collection
    .find({ classId, slug }, { projection: { submissions: 0 } })
    .sort({ updatedAt: -1 })
    .limit(200)
    .toArray()
}

// Insert the first revision. Returns { ok: true } or { ok: false, duplicate: true } if another
// request created the record first (the unique _id makes the first save atomic).
export async function insertFirst(collection, record) {
  try {
    await collection.insertOne(record)
    return { ok: true }
  } catch (error) {
    if (error?.code === 11000) return { ok: false, duplicate: true }
    throw error
  }
}

// Conditional update: the filter always pins identity (id, class, scope, slug) plus the caller's
// conditions (revision, status), so a stale writer matches nothing. Returns true on exactly one match.
export async function updateWhere(collection, { classId, scope, slug }, conditions, update) {
  const result = await collection.updateOne({ ...target(classId, scope, slug), ...conditions }, update)
  return result.matchedCount === 1
}

export const eventPush = event => ({ events: { $each: [event], $slice: -LIMITS.events } })
export const feedbackPush = entry => ({ feedback: { $each: [entry], $slice: -LIMITS.feedback } })
export const submissionPush = entry => ({ submissions: { $each: [entry], $slice: -LIMITS.submissions } })
