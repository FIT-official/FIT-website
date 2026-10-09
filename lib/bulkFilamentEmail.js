import { sendEmail } from './email'
const OWNER_EMAIL = 'fixittoday.contact@gmail.com'
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const money = cents => `SGD ${(cents / 100).toFixed(2)}`
export function bulkOwnerEmail(doc) {
  const lines = [
    `Reference: ${doc._id}`, `Name: ${doc.customer.name}`, `Email: ${doc.customer.email}`,
    `Phone: ${doc.customer.phone || 'Not provided'}`, `Organisation: ${doc.customer.organisation || 'Not provided'}`,
    `Fulfilment: ${doc.fulfilment}`, doc.address,
    ...doc.lines.map(l => `${l.productName} | ${l.colour} | ${l.quantity} rolls | ${l.material} band ${l.band} (${l.tierRolls} rolls) | ${money(l.unitCents)} / roll | ${money(l.lineCents)} | ${l.remarks}`),
    `Indicative total: ${money(doc.totalCents)}`, doc.priceNotice, `Notes: ${doc.notes}`,
    'No stock reserved. Contact the customer to confirm the quotation.',
  ]
  return { to: OWNER_EMAIL, subject: `Bulk filament enquiry ${doc._id.replace(/[\r\n]/g, '')}`,
    html: `<h1>Bulk filament enquiry</h1>${lines.map(line => `<p>${escapeHtml(line)}</p>`).join('')}` }
}
// Claim only after persistence. Retries cannot send duplicate owner notifications.
// A crash after claiming remains "sending" for owner review, never a blind resend.
export async function notifyBulkOwner(store, requestId) {
  try {
    const doc = await store.findOneAndUpdate({ _id: requestId, 'notifications.email': 'pending' },
      { $set: { 'notifications.email': 'sending' } }, { returnDocument: 'after' })
    if (!doc) return
    let status = 'not_configured'
    if (process.env.GMAIL_USER && process.env.GMAIL_PASSWORD) {
      try { await sendEmail(bulkOwnerEmail(doc)); status = 'sent' }
      catch { status = 'failed' }
    }
    await store.updateOne({ _id: requestId }, { $set: { 'notifications.email': status, 'notifications.attemptedAt': new Date() } })
  } catch {
    // Persistence already succeeded. Notification or status-write failures must
    // not turn a stored enquiry into a failed submission. No sensitive logging.
  }
}
