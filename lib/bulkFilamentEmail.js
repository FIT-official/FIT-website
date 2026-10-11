import { randomUUID } from 'node:crypto'
import { sendEmail } from './email'

export const BULK_OWNER_EMAIL = 'fixittoday.contact@gmail.com'
const MAX_ATTEMPTS = 3
const STALE_MS = 120000
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const money = cents => Number.isSafeInteger(cents) ? `SGD ${(cents / 100).toFixed(2)}` : 'Quotation required'

// Use only the immutable, server-priced request snapshot. Never client totals.
export function bulkOwnerMessage(doc) {
  const customer = doc.customer || {}
  const lines = Array.isArray(doc.lines) ? doc.lines : []
  const value = (v, fallback = 'Not provided') => v == null || v === '' ? fallback : String(v)
  // The bulk-filament contract counts 1kg rolls. Explicit different units on a
  // legacy record remain visible and must never be added to the roll total.
  const unit = line => line.unit === 'roll' ? 'rolls' : value(line.unit, 'rolls')
  const quantity = line => Number.isSafeInteger(line.quantity) && line.quantity > 0
    ? String(line.quantity) : value(line.quantity, 'Not recorded')
  const options = line => (line.options || []).map(o => `${value(o.type, 'Option')}: ${value(o.name)}`).join(' | ')
  const totalRolls = lines.length && lines.every(line => ['roll', 'rolls'].includes(unit(line)) &&
    Number.isSafeInteger(line.quantity) && line.quantity > 0)
    ? lines.reduce((sum, line) => sum + line.quantity, 0) : null
  const reference = value(doc._id)
  const fulfilment = doc.fulfilment === 'delivery' ? `Delivery enquiry: ${value(doc.address)}`
    : doc.fulfilment === 'collection' ? 'Collection: arrangements to confirm' : 'Fulfilment: Not recorded'
  const priceDetail = line => line.ladder === 'BAMBU_LIST'
    ? `${value(line.priceNotice, 'Final quotation needs owner confirmation.')}; price / roll: ${money(line.unitCents)}`
    : `Band: ${value(line.band, 'Not recorded')}; ${value(line.tierRolls, 'Not recorded')} ${value(line.tierGroupLabel || line.material, 'eligible')} rolls combined; indicative price / roll: ${money(line.unitCents)}`
  const notice = doc.priceNotice || 'Final quotation needs owner confirmation.'
  const payment = 'Payment / Stripe: no payment taken; no Stripe transaction. Enquiry only, not a confirmed order.'
  const availability = 'No stock reserved. Availability, final quotation and fulfilment need owner confirmation.'
  const rows = ['ITEMS TO PREPARE / CHECK', '']
  lines.forEach((line, i) => rows.push(`${i + 1}. ${value(line.productName)}`, options(line) || 'Options: Not recorded',
    `Quantity: ${quantity(line)} ${unit(line)}`, ''))
  if (!lines.length) rows.push('No item lines recorded.', '')
  if (Number.isSafeInteger(totalRolls)) rows.push(`Total quantity: ${totalRolls} rolls`, '')
  rows.push('CUSTOMER CONTACT', `Customer: ${value(customer.name)}`, `Phone: ${value(customer.phone)}`,
    `Customer email: ${value(customer.email)}`, `Organisation: ${value(customer.organisation, 'None')}`,
    '', 'DELIVERY / COLLECTION', fulfilment, '', 'ITEM REMARKS')
  lines.forEach((line, i) => rows.push(`Item ${i + 1} — ${value(line.productName)}`, `Item remarks: ${value(line.remarks, 'None')}`, ''))
  rows.push('INDICATIVE PRICING')
  lines.forEach((line, i) => rows.push(`Item ${i + 1} — ${value(line.productName)}`, priceDetail(line),
    `Indicative line total: ${money(line.lineCents)}`, ''))
  rows.push(`Indicative filament total: ${money(doc.totalCents)}`, notice,
    '', 'CUSTOMER NOTES', `Customer notes: ${value(doc.notes, 'None')}`,
    '', 'PAYMENT / STATUS', payment, availability, `Request reference: ${reference}`, 'Review: https://www.fixitoday.com/admin')
  const text = rows.join('\n')
  const detail = v => `<div style="white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word">${escape(v)}</div>`
  const section = (title, content) => `<h2 style="font-size:17px;margin:26px 0 10px;color:#163c32">${title}</h2>${content}`
  const itemRows = lines.map((line, i) => `<tr>
    <td style="padding:12px 10px;border-bottom:1px solid #d5dedb;vertical-align:top;overflow-wrap:anywhere;word-break:break-word">
      <strong>${i + 1}. ${escape(value(line.productName))}</strong>
      <div style="margin-top:5px;color:#40564e;white-space:pre-wrap">${escape(options(line) || 'Options: Not recorded')}</div>
    </td>
    <td style="width:76px;padding:12px 6px;border-bottom:1px solid #d5dedb;text-align:right;vertical-align:top;overflow-wrap:anywhere;word-break:break-word">
      <strong style="font-size:22px">${escape(quantity(line))}</strong><br/><span>${escape(unit(line))}</span>
    </td></tr>`).join('')
  const itemNotes = lines.map((line, i) => `<div style="padding:10px 0;border-bottom:1px solid #e4e9e7"><strong>Item ${i + 1} — ${escape(value(line.productName))}</strong>${detail('Item remarks: ' + value(line.remarks, 'None'))}</div>`).join('')
  const prices = lines.map((line, i) => `<div style="padding:10px 0;border-bottom:1px solid #e4e9e7"><strong>Item ${i + 1} — ${escape(value(line.productName))}</strong>${detail(priceDetail(line))}${detail('Indicative line total: ' + money(line.lineCents))}</div>`).join('')
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
    <body style="margin:0;padding:0;background:#f3f6f4;color:#172b24">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td style="padding:12px">
    <div style="max-width:640px;margin:auto;background:#fff;padding:16px;font:15px/1.5 Arial,sans-serif;overflow-wrap:anywhere;word-break:break-word">
    <h1 style="font-size:23px;line-height:1.25;margin:0 0 14px">Items to prepare / check</h1>
    <table aria-label="Items to prepare" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:fixed">
    <thead><tr style="background:#e8f1ec"><th scope="col" style="padding:9px 10px;text-align:left">Product / options</th><th scope="col" style="width:76px;padding:9px 6px;text-align:right">Qty</th></tr></thead>
    <tbody>${itemRows || '<tr><td colspan="2" style="padding:12px">No item lines recorded.</td></tr>'}</tbody></table>
    ${Number.isSafeInteger(totalRolls) ? `<p style="margin:12px 0;font-size:17px"><strong>Total quantity: ${totalRolls} rolls</strong></p>` : ''}
    <p style="margin:8px 0;color:#52655d">Enquiry only. Availability and final quotation need confirmation.</p>
    ${section('Customer contact', [`Customer: ${value(customer.name)}`, `Phone: ${value(customer.phone)}`, `Customer email: ${value(customer.email)}`, `Organisation: ${value(customer.organisation, 'None')}`].map(detail).join(''))}
    ${section('Delivery / collection', detail(fulfilment))}
    ${section('Item remarks', itemNotes)}
    ${section('Indicative pricing', prices + '<p><strong>' + escape('Indicative filament total: ' + money(doc.totalCents)) + '</strong></p>' + detail(notice))}
    ${section('Customer notes', detail('Customer notes: ' + value(doc.notes, 'None')))}
    ${section('Payment / status', detail(payment) + detail(availability) + detail('Request reference: ' + reference))}
    <p><a href="https://www.fixitoday.com/admin" style="color:#16624d">Review in FIT dashboard</a></p>
    </div></td></tr></table></body></html>`
  return { to: BULK_OWNER_EMAIL, subject: `FIT bulk filament enquiry ${doc._id}`,
    messageId: `<bulk-${doc._id}@fixitoday.com>`, text, html }
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
