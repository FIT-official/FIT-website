import { randomUUID } from 'node:crypto'
import { sendEmail } from '@/lib/email'

// The same existing FIT owner destination used by bulk enquiries.
export const REPAIR_OWNER_EMAIL = 'fixittoday.contact@gmail.com'
const MAX_ATTEMPTS = 3
const RETRYABLE = ['pending', 'failed', 'not_configured']
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export function repairOwnerMessage(doc) {
  const b = doc.brief
  const text = [
    `Customer: ${b.contactName}`, `Phone: ${b.phone || 'Not provided'}`,
    'Handover / address: discuss with customer; no collection or visit arranged.', '',
    'Assessment preparation', `Printer: ${b.brand} ${b.model}`, `Feeder: ${b.feeder}`,
    `Reported issue: ${b.issue}${b.specificSymptom ? ` / ${b.specificSymptom}` : ''}`,
    `Customer remarks: ${b.details}`, `Error message: ${b.errorCode || 'None provided'}`,
    `Checks already tried: ${b.troubleshooting || 'None provided'}`,
    `Private photos: ${doc.photoAssetIds.length}; view in the admin assessment queue.`,
    `Preferred date: ${b.preferredDate || 'Discuss with customer'}; not a booked appointment.`, '',
    'Payment / Stripe: no payment taken; no Stripe transaction. Assessment enquiry only.',
    'No fee, repair scope, parts or appointment agreed. Customer approval is required before work.',
    `Customer email: ${b.email}`, `Organisation: ${b.organisation || 'None'}`,
    `Request reference: ${doc.requestId}`, 'Review: https://www.fixitoday.com/admin?tab=printerRepair',
  ].join('\n')
  return { to: REPAIR_OWNER_EMAIL, subject: `FIT printer assessment ${doc.requestId}`,
    messageId: `<repair-${doc.requestId}@fixitoday.com>`, text,
    html: `<div style="font:15px/1.6 Arial,sans-serif;white-space:pre-wrap">${escape(text)}</div>` }
}

export function repairEmailSummary(doc, now = new Date()) {
  const email = doc?.notifications?.email
  let status = email?.status || 'not_recorded'
  if (status === 'sending' && (!email.startedAt || new Date(email.startedAt).getTime() + 120000 <= now.getTime())) status = 'uncertain'
  const attempts = Number.isSafeInteger(email?.attempts) ? email.attempts : 0
  return { status, attempts, canRetry: doc?.status === 'assessment_requested' && RETRYABLE.includes(status) && attempts < MAX_ATTEMPTS }
}

// Durable compare-and-set claim; deterministic Message-ID is diagnostic, not an
// SMTP idempotency guarantee. Ambiguous outcomes are never reclaimed or resent.
// Retry is an explicit admin action, bounded to 3 attempts. No background sends.
export async function notifyRepairOwner(store, requestId, { retry = false, send = sendEmail, env = process.env, now = new Date(), timeoutMs = 15000 } = {}) {
  try {
    const filter = { requestId, status: 'assessment_requested', 'notifications.email.status': { $in: retry ? RETRYABLE : ['pending'] }, 'notifications.email.attempts': { $lt: MAX_ATTEMPTS } }
    const options = { returnDocument: 'after', writeConcern: { w: 'majority', wtimeoutMS: 10000 } }
    if (!env.GMAIL_USER || !env.GMAIL_PASSWORD) {
      await store.findOneAndUpdate(filter, { $set: { 'notifications.email.status': 'not_configured', 'notifications.email.reason': 'mailer_unavailable' } }, options)
    } else {
      const claim = randomUUID()
      const row = await store.findOneAndUpdate(filter, { $set: { 'notifications.email.status': 'sending', 'notifications.email.claim': claim,
        'notifications.email.startedAt': now, 'notifications.email.recipient': REPAIR_OWNER_EMAIL, 'notifications.email.reason': null },
        $inc: { 'notifications.email.attempts': 1 } }, options)
      if (row) {
        let status = 'uncertain', reason = 'provider_acknowledgement_unknown', timer
        try {
          const info = await Promise.race([Promise.resolve().then(() => send(repairOwnerMessage(row))), new Promise((_, reject) => {
            timer = setTimeout(() => reject(Error('Mail outcome unknown')), timeoutMs)
          })])
          if (info?.accepted?.some(address => String(address).toLowerCase() === REPAIR_OWNER_EMAIL)) { status = 'accepted'; reason = null }
          else if (info?.rejected?.some(address => String(address).toLowerCase() === REPAIR_OWNER_EMAIL)) { status = 'failed'; reason = 'provider_rejected' }
        } catch (error) {
          if ((error.responseCode >= 400 && error.responseCode < 600) || ['EAUTH', 'EENVELOPE', 'EDNS'].includes(error.code)) { status = 'failed'; reason = 'provider_rejected' }
        } finally { clearTimeout(timer) }
        const updated = await store.findOneAndUpdate({ requestId, 'notifications.email.claim': claim, 'notifications.email.status': 'sending' },
          { $set: { 'notifications.email.status': status, 'notifications.email.reason': reason, 'notifications.email.finishedAt': new Date(),
            'notifications.email.messageId': `<repair-${requestId}@fixitoday.com>` } }, options)
        return updated ? repairEmailSummary(updated).status : 'uncertain'
      }
    }
    return repairEmailSummary(await store.findOne({ requestId })).status
  } catch {
    // The assessment is already saved. A failed/ambiguous alert must not turn
    // that successful write into a false submission error or another send.
    return 'uncertain'
  }
}
