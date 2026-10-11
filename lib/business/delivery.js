import { createHash, randomUUID } from 'node:crypto'
import { OWNER_EMAIL } from './events'
const hash = v => createHash('sha256').update(JSON.stringify(v)).digest('hex')
export const MAX_ATTEMPTS = 4
const WRITE = { returnDocument: 'after', writeConcern: { w: 'majority', wtimeoutMS: 10000 } }

export async function insertOnce(store, row) {
  try { return await store.updateOne({ _id: row._id }, { $setOnInsert: row }, { upsert: true }) }
  catch (error) {
    if (error?.code === 11000 && await store.findOne({ _id: row._id })) return { upsertedCount: 0 }
    throw error
  }
}

export function notificationState(row, now = new Date()) {
  return row?.status === 'sending' && +new Date(row.leaseUntil) <= +now ? 'uncertain' : row?.status || 'missing'
}
export function validateMessage(m, channel) {
  if (!m || typeof m.text !== 'string' || Buffer.byteLength(m.text) > 131072) return false
  if (channel === 'email') return m.to === OWNER_EMAIL && typeof m.subject === 'string' && !/[\r\n]/.test(m.subject) && typeof m.html === 'string' && Buffer.byteLength(m.html) <= 786432
  return channel === 'telegram' && m.text.length <= 3500 && !m.to
}
export async function queueMessage(store, key, channel, message, { now = new Date() } = {}) {
  if (!['email','telegram'].includes(channel) || !validateMessage(message, channel)) throw Error('Invalid notification')
  const _id = hash([key, channel]), snapshot = { ...message, ...(channel === 'email' ? { messageId: `<fit-business-${_id}@fixitoday.com>` } : {}) }
  const row = { _id, key, channel, message: snapshot, fingerprint: hash(snapshot), status: 'pending', attempts: 0,
    createdAt: now, nextAttemptAt: now, expiresAt: new Date(+now + 90 * 86400000) }
  await insertOnce(store, row)
  return _id
}

// Provider acceptance is recorded separately from inbox/read confirmation.
// A timeout or lost final acknowledgement is uncertain, never auto-replayed.
export async function deliverNotification(store, id, send, { now = new Date(), timeoutMs = 15000 } = {}) {
  const claim = randomUUID()
  const row = await store.findOneAndUpdate({ _id: id, status: { $in: ['pending','retry'] }, attempts: { $lt: MAX_ATTEMPTS }, nextAttemptAt: { $lte: now } },
    { $set: { status: 'sending', claim, startedAt: now, leaseUntil: new Date(+now + timeoutMs + 60000) }, $inc: { attempts: 1 } }, WRITE)
  if (!row) return { status: notificationState(await store.findOne({ _id: id }), now) }
  let result = { status: 'uncertain', reason: 'provider_acknowledgement_unknown' }, timer
  if (row.fingerprint !== hash(row.message) || !validateMessage(row.message, row.channel)) result = { status: 'failed', reason: 'invalid_snapshot' }
  else {
    try {
      const outcome = await Promise.race([Promise.resolve().then(() => send(row.channel, row.message)), new Promise(resolve => { timer = setTimeout(() => resolve({ status: 'uncertain', reason: 'provider_timeout' }), timeoutMs) })])
      if (['accepted','retry','failed','not_configured','uncertain'].includes(outcome?.status)) result = outcome
    } catch (error) {
      if (['EDNS','EAUTH','EENVELOPE'].includes(error?.code) || (error?.responseCode >= 400 && error.responseCode < 600)) result = { status: error.responseCode >= 500 ? 'failed' : 'retry', reason: 'provider_rejected' }
    } finally { clearTimeout(timer) }
  }
  if (result.status === 'retry' && row.attempts >= MAX_ATTEMPTS) result = { status: 'failed', reason: 'attempt_limit' }
  const waitMs = Math.max(Math.min(Number(result.retryAfterSeconds) || 0, 86400) * 1000, 60000 * 2 ** (row.attempts - 1))
  const fields = { status: result.status, reason: String(result.reason || '').slice(0, 80), finishedAt: now,
    ...(result.providerId ? { providerId: String(result.providerId).slice(0, 150) } : {}),
    ...(result.status === 'retry' ? { nextAttemptAt: new Date(+now + waitMs) } : {}) }
  try {
    const saved = await store.findOneAndUpdate({ _id: id, claim, status: 'sending' }, { $set: fields }, WRITE)
    return saved ? { status: saved.status, attempts: saved.attempts } : { status: 'uncertain' }
  } catch { return { status: 'uncertain' } }
}
