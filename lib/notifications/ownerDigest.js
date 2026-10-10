import { createHash, randomUUID } from 'node:crypto'
import { sendEmail } from '@/lib/email'
import { OWNER_DIGEST_DELIVERY_ENABLED, OWNER_DIGEST_EMAIL } from './ownerDigestPolicy'
import { buildGuidedOwnerDigest, buildPaidOrderOwnerDigest } from './ownerDigestMessage'

const options = { returnDocument: 'after', writeConcern: { w: 'majority', wtimeoutMS: 10000 } }
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id)
const allowedRetry = ['pending', 'failed', 'not_configured']
export function ownerDigestStatus(row, now = new Date()) {
  const state = row?.ownerDigest
  if (!state) return { status: 'not_prepared', attempts: 0 }
  const stale = state.status === 'sending' && (!state.startedAt || !Number.isFinite(new Date(state.startedAt).getTime()) || new Date(state.startedAt).getTime() + 120000 <= now.getTime())
  return { status: stale ? 'uncertain' : state.status, attempts: state.attempts || 0 }
}
function validSnapshot(snapshot) {
  const m = snapshot?.message
  return snapshot?.version === 1 && m?.to === OWNER_DIGEST_EMAIL &&
    Object.keys(m).sort().join(',') === 'html,messageId,subject,text,to' &&
    typeof m.text === 'string' && typeof m.html === 'string' &&
    Buffer.byteLength(m.text, 'utf8') <= 128 * 1024 && Buffer.byteLength(m.html, 'utf8') <= 768 * 1024 &&
    typeof m.subject === 'string' && !/[\r\n]/.test(m.subject) &&
    /^<fit-owner-(guided|paid)-[0-9a-f]{64}@fixitoday\.com>$/.test(m.messageId) &&
    snapshot.fingerprint === fingerprint(m)
}

// Dormant prepared delivery logic. No routes/cron/admin action call this module.
// store is an existing source record's native Mongo collection (not a new queue).
// Deterministic Message-ID assists diagnosis; SMTP is not exactly-once.
async function deliver(store, key, build, eligible, { retry = false, send = sendEmail, env = process.env, now = new Date(), timeoutMs = 15000 } = {}) {
  if (!OWNER_DIGEST_DELIVERY_ENABLED) return { status: 'disabled', attempts: 0 }
  try {
    let row = await store.findOne(key)
    if (!row || !eligible(row)) return { status: 'not_eligible', attempts: 0 }
    if (!row.ownerDigest) {
      let message
      try { message = await build(row) } catch { return { status: 'invalid_record', attempts: 0 } }
      const snapshot = { version: 1, message, fingerprint: fingerprint(message), status: 'pending', attempts: 0, preparedAt: now }
      if (!validSnapshot(snapshot)) return { status: 'invalid_record', attempts: 0 }
      // No upsert: never manufacture a source request/order. Concurrent workers
      // retain the first complete message, even if the source later changes.
      await store.findOneAndUpdate({ ...key, ownerDigest: { $exists: false } }, { $set: { ownerDigest: snapshot } }, options)
      row = await store.findOne(key)
    }
    if (!row || !eligible(row)) return { status: 'not_eligible', attempts: row?.ownerDigest?.attempts || 0 }
    if (!validSnapshot(row?.ownerDigest)) return { status: 'invalid_record', attempts: 0 }
    const filter = { ...key, status: row.status, 'ownerDigest.fingerprint': row.ownerDigest.fingerprint,
      'ownerDigest.status': { $in: retry === true ? allowedRetry : ['pending'] }, 'ownerDigest.attempts': { $gte: 0, $lt: 3 } }
    if (!env.GMAIL_USER || !env.GMAIL_PASSWORD) {
      await store.findOneAndUpdate(filter, { $set: { 'ownerDigest.status': 'not_configured', 'ownerDigest.reason': 'mailer_unavailable' } }, options)
      return ownerDigestStatus(await store.findOne(key), now)
    }
    const claim = randomUUID()
    const claimed = await store.findOneAndUpdate(filter, { $set: { 'ownerDigest.status': 'sending', 'ownerDigest.claim': claim,
      'ownerDigest.startedAt': now, 'ownerDigest.reason': null }, $inc: { 'ownerDigest.attempts': 1 } }, options)
    if (!claimed) {
      const latest = await store.findOne(key)
      return latest && eligible(latest) ? ownerDigestStatus(latest, now) : { status: 'not_eligible', attempts: latest?.ownerDigest?.attempts || 0 }
    }
    let status = 'uncertain', reason = 'provider_acknowledgement_unknown', timer
    // Refuse corrupted or redirected snapshots even after the atomic claim.
    if (!validSnapshot(claimed.ownerDigest)) return { status: 'uncertain', attempts: claimed.ownerDigest?.attempts || 0 }
    try {
      const info = await Promise.race([Promise.resolve().then(() => send({ ...claimed.ownerDigest.message })), new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error('Mail outcome unknown')), timeoutMs)
      })])
      if (info?.accepted?.some(address => String(address).toLowerCase() === OWNER_DIGEST_EMAIL)) { status = 'accepted'; reason = null }
      else if (info?.rejected?.some(address => String(address).toLowerCase() === OWNER_DIGEST_EMAIL)) { status = 'failed'; reason = 'provider_rejected' }
    } catch (error) {
      if ((error?.responseCode >= 400 && error.responseCode < 600) || ['EAUTH', 'EENVELOPE', 'EDNS'].includes(error?.code)) { status = 'failed'; reason = 'provider_rejected' }
    } finally { clearTimeout(timer) }
    const updated = await store.findOneAndUpdate({ ...key, 'ownerDigest.claim': claim, 'ownerDigest.status': 'sending' },
      { $set: { 'ownerDigest.status': status, 'ownerDigest.reason': reason, 'ownerDigest.finishedAt': new Date() } }, options)
    return updated ? ownerDigestStatus(updated) : { status: 'uncertain', attempts: claimed.ownerDigest.attempts }
  } catch {
    // A lost durable claim/final acknowledgement is never reclaimed automatically.
    // Never leak provider errors or turn saved source data into a submission failure.
    return { status: 'uncertain', attempts: null }
  }
}

export function notifyGuidedEnquiryOwner(store, requestId, config) {
  if (!OWNER_DIGEST_DELIVERY_ENABLED) return Promise.resolve({ status: 'disabled', attempts: 0 })
  if (!validId(requestId)) return Promise.resolve({ status: 'invalid_record', attempts: 0 })
  return deliver(store, { requestId }, buildGuidedOwnerDigest,
    row => row.status === 'configured' && row.guidedBrief?.version === 1 && !row.creatorUserId, config)
}
export function notifyPaidOrderOwner(orders, sessionId, { loadCheckout, ...config } = {}) {
  if (!OWNER_DIGEST_DELIVERY_ENABLED) return Promise.resolve({ status: 'disabled', attempts: 0 })
  if (!validId(sessionId) || typeof loadCheckout !== 'function') return Promise.resolve({ status: 'invalid_record', attempts: 0 })
  return deliver(orders, { stripeSessionId: sessionId }, async order => buildPaidOrderOwnerDigest({ checkout: await loadCheckout(sessionId), order }),
    row => Boolean(row.paidConfirmedAt) && !['cancelled', 'refunded', 'partially_refunded'].includes(row.status), config)
}
