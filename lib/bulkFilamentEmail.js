import { randomUUID } from 'node:crypto'
import { sendEmail } from './email'

export const BULK_OWNER_EMAIL = 'fixittoday.contact@gmail.com'
const MAX_ATTEMPTS = 3
const STALE_MS = 120000
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const money = cents => Number.isSafeInteger(cents) ? `SGD ${(cents / 100).toFixed(2)}` : 'Quotation required'

// Use only the immutable, server-priced request snapshot. Never client totals.
export function bulkOwnerMessage(doc) {
  const rows = [
    `Customer: ${doc.customer.name}`, `Phone: ${doc.customer.phone || 'Not provided'}`,
    doc.fulfilment === 'delivery' ? `Delivery enquiry: ${doc.address}` : 'Collection: arrangements to confirm',
    '', 'Preparation / availability check',
  ]
  doc.lines.forEach((line, i) => rows.push(
    `${i + 1}. ${line.productName}`,
    line.options.map(o => `${o.type}: ${o.name}`).join(' | '),
    `Quantity: ${line.quantity} rolls`,
    `Item remarks: ${line.remarks || 'None'}`,
    `Band: ${line.band}; ${line.tierRolls} ${line.material} rolls combined; indicative price / roll: ${money(line.unitCents)}`,
    `Indicative line total: ${money(line.lineCents)}`, '',
  ))
  rows.push(`Indicative filament total: ${money(doc.totalCents)}`, doc.priceNotice || 'Final quotation needs owner confirmation.')
  rows.push('', 'Payment / Stripe: no payment taken; no Stripe transaction. Enquiry only, not a confirmed order.',
    'No stock reserved. Availability, final quotation and fulfilment need owner confirmation.',
    `Customer email: ${doc.customer.email}`, `Organisation: ${doc.customer.organisation || 'None'}`,
    `Customer notes: ${doc.notes || 'None'}`, `Request reference: ${doc._id}`,
    'Review: https://www.fixitoday.com/admin')
  const text = rows.join('\n')
  return { to: BULK_OWNER_EMAIL, subject: `FIT bulk filament enquiry ${doc._id}`,
    messageId: `<bulk-${doc._id}@fixitoday.com>`, text,
    html: `<div style="font:15px/1.6 Arial,sans-serif;white-space:pre-wrap">${escape(text)}</div>` }
}

export function bulkEmailStatus(doc, now = new Date()) {
  const email = doc?.notifications?.email
  if (!email || typeof email === 'string') return email || 'not_configured'
  if (email.status === 'sending' && new Date(email.startedAt).getTime() + STALE_MS <= now.getTime()) return 'uncertain'
  return email.status
}

// SMTP cannot promise exactly-once delivery after an ambiguous acknowledgement.
// A durable atomic claim prevents concurrent sends. Unknown outcomes never retry.
export async function notifyBulkOwner(store, requestId, { retry = false, send = sendEmail, env = process.env, now = new Date(), timeoutMs = 15000 } = {}) {
  let claimed = null
  try {
    const allowed = retry ? ['pending', 'failed', 'not_configured'] : ['pending']
    const filter = { _id: requestId, 'notifications.email.status': { $in: allowed }, 'notifications.email.attempts': { $lt: MAX_ATTEMPTS } }
    const configured = Boolean(env.GMAIL_USER && env.GMAIL_PASSWORD)
    if (!configured) {
      await store.findOneAndUpdate(filter, { $set: { 'notifications.email.status': 'not_configured', 'notifications.email.reason': 'mailer_unavailable' } }, { returnDocument: 'after', writeConcern: { w: 'majority', wtimeoutMS: 10000 } })
    } else {
      const claim = randomUUID()
      claimed = await store.findOneAndUpdate(filter, { $set: { 'notifications.email.status': 'sending', 'notifications.email.claim': claim,
        'notifications.email.startedAt': now, 'notifications.email.recipient': BULK_OWNER_EMAIL, 'notifications.email.reason': null },
        $inc: { 'notifications.email.attempts': 1 } }, { returnDocument: 'after', writeConcern: { w: 'majority', wtimeoutMS: 10000 } })
      if (claimed) {
        let status = 'uncertain', reason = 'provider_acknowledgement_unknown', timer
        try {
          const info = await Promise.race([Promise.resolve().then(() => send(bulkOwnerMessage(claimed))), new Promise((_, reject) => {
            timer = setTimeout(() => reject(Object.assign(Error('Mail outcome unknown'), { code: 'BULK_MAIL_TIMEOUT' })), timeoutMs)
          })])
          if (info?.accepted?.some(address => String(address).toLowerCase() === BULK_OWNER_EMAIL)) { status = 'accepted'; reason = null }
          else if (info?.rejected?.some(address => String(address).toLowerCase() === BULK_OWNER_EMAIL)) { status = 'failed'; reason = 'provider_rejected' }
        } catch (error) {
          // An explicit SMTP negative reply or pre-delivery auth/envelope/DNS error is retryable.
          if ((error.responseCode >= 400 && error.responseCode < 600) || ['EAUTH', 'EENVELOPE', 'EDNS'].includes(error.code)) {
            status = 'failed'; reason = 'provider_rejected'
          }
        } finally { clearTimeout(timer) }
        const updated = await store.findOneAndUpdate({ _id: requestId, 'notifications.email.claim': claim, 'notifications.email.status': 'sending' },
          { $set: { 'notifications.email.status': status, 'notifications.email.reason': reason, 'notifications.email.finishedAt': new Date(),
            'notifications.email.messageId': `<bulk-${requestId}@fixitoday.com>` } }, { returnDocument: 'after', writeConcern: { w: 'majority', wtimeoutMS: 10000 } })
        if (!updated) return 'uncertain'
        return bulkEmailStatus(updated)
      }
    }
    return bulkEmailStatus(await store.findOne({ _id: requestId }))
  } catch {
    // Saving the enquiry already succeeded. Never turn it into a false submission failure,
    // and never resend after a lost database acknowledgement of a claimed/accepted send.
    return 'uncertain'
  }
}
