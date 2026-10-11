import { createHash } from 'node:crypto'
export const OWNER_EMAIL = 'fixittoday.contact@gmail.com'
export const EVENT_KINDS = ['order.paid', 'order.status', 'enquiry.submitted', 'enquiry.status', 'chat.message.new', 'chat.message.updated']
export const eventId = key => createHash('sha256').update(String(key)).digest('hex')
export const escapeHtml = v => String(v).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]))

// The analytical ledger has no customer names, email/phone/address, message
// bodies, IPs, credentials, payment/card details or arbitrary request payloads.
export function businessEvent(input) {
  if (!EVENT_KINDS.includes(input?.kind) || !/^[a-z][a-z_-]{0,39}$/.test(input.source || '') ||
      typeof input.reference !== 'string' || !/^[a-zA-Z0-9_:.\-]{1,200}$/.test(input.reference) ||
      typeof input.key !== 'string' || input.key.length > 512 || !input.key.length) throw Error('Invalid business event')
  const at = new Date(input.occurredAt)
  if (!Number.isFinite(+at)) throw Error('Invalid event time')
  const row = { _id: eventId(input.key), version: 1, kind: input.kind, source: input.source,
    reference: input.reference, occurredAt: at, status: /^[a-zA-Z0-9_-]{1,60}$/.test(input.status || '') ? input.status : 'unknown',
    expiresAt: new Date(+at + 366 * 86400000) }
  if (input.kind === 'order.paid') {
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 0 || !/^[A-Z]{3}$/.test(input.currency) ||
        !Number.isSafeInteger(input.itemCount) || input.itemCount < 0) throw Error('Invalid paid order metrics')
    Object.assign(row, { amountMinor: input.amountMinor, currency: input.currency, itemCount: input.itemCount })
  }
  return row
}

export function eventMessage(row) {
  const text = [`FIT ${row.kind}`, `Reference: ${row.reference}`, `Source: ${row.source}`,
    `Time: ${new Date(row.occurredAt).toLocaleString('en-GB', { timeZone: 'Asia/Singapore', hour12: false })} Singapore`,
    row.status ? `Status: ${row.status}` : '',
    row.kind === 'order.paid' ? `Paid total: ${row.currency} ${(row.amountMinor / 100).toFixed(2)}; items: ${row.itemCount}` : '',
    row.kind.startsWith('chat.') ? 'A website chat message was received. Message content stays in the authenticated website.' : '',
    'Review: https://www.fixitoday.com/admin'].filter(Boolean).join('\n')
  return { to: OWNER_EMAIL, subject: `FIT ${row.kind} ${row.reference}`.slice(0, 200), text,
    html: `<pre style="white-space:pre-wrap">${escapeHtml(text)}</pre>` }
}

export function aggregateBusiness(events, period, { startedAt, visitors = { available: false, reason: 'Not configured' } } = {}) {
  const rows = events.filter(e => +new Date(e.occurredAt) >= +period.since && +new Date(e.occurredAt) < +period.until)
  const kinds = {}, statuses = {}, currencies = {}, sources = {}
  for (const e of rows) {
    kinds[e.kind] = (kinds[e.kind] || 0) + 1
    sources[e.source] = (sources[e.source] || 0) + 1
    if (e.kind.endsWith('.status') && e.status) statuses[e.status] = (statuses[e.status] || 0) + 1
    if (e.kind === 'order.paid') {
      const c = currencies[e.currency] ||= { orders: 0, grossPaidMinor: 0, items: 0 }
      c.orders++; c.grossPaidMinor += e.amountMinor; c.items += e.itemCount
    }
  }
  return { version: 1, period: { ...period, since: period.since.toISOString(), until: period.until.toISOString(), dueAt: period.dueAt.toISOString() },
    coverage: { startedAt: startedAt ? new Date(startedAt).toISOString() : null, partial: !startedAt || +new Date(startedAt) > +period.since,
      notes: 'Paid totals are gross confirmed amounts, not profit or net revenue. Refund amounts are not inferred from status changes. No currency conversion.' },
    events: rows.length, kinds, sources, statusChanges: statuses, currencies, visitors }
}

export function summaryMessage(report) {
  const v = report.visitors
  const rows = [`FIT ${report.period.kind} business summary`, report.period.label,
    report.coverage.partial ? 'Business-event coverage is partial: tracking began during or after this period.' : 'Recorded business events for this period.',
    '', 'AT A GLANCE', `Paid orders: ${report.kinds['order.paid'] || 0}`, `Enquiries submitted: ${report.kinds['enquiry.submitted'] || 0}`,
    `New chat messages: ${report.kinds['chat.message.new'] || 0}`, `Status changes: ${(report.kinds['order.status'] || 0) + (report.kinds['enquiry.status'] || 0)}`,
    '', 'ORDERS BY CURRENCY', ...Object.entries(report.currencies).map(([currency, c]) => `${currency}: ${c.orders} paid orders; gross ${(c.grossPaidMinor / 100).toFixed(2)}; ${c.items} items`),
    '', 'VISITOR STATISTICS (consented analytics only)', v.available ? `${v.pageViews} pageviews; ${v.uniqueVisitors} distinct consented visitors. ${v.complete ? 'All fetched pages covered.' : 'PARTIAL provider result; do not treat as a complete total.'}` : `Unavailable: ${v.reason || 'provider unavailable'}`,
    'Visitors declining analytics are not included; visitor IDs, full URLs and IP addresses are not exported.',
    '', 'STATUS CHANGES', ...Object.entries(report.statusChanges).map(([s, n]) => `${s}: ${n}`),
    '', report.coverage.notes, 'Review and download CSV/JSON: https://www.fixitoday.com/admin']
  const text = rows.join('\n')
  return { to: OWNER_EMAIL, subject: `FIT ${report.period.kind} summary | ${report.kinds['order.paid'] || 0} paid orders | ${report.period.label}`,
    text, html: `<pre style="white-space:pre-wrap">${escapeHtml(text)}</pre>` }
}

// Prevent spreadsheet formula execution, preserve commas/newlines safely.
export function csvCell(input) {
  let s = input == null ? '' : String(input)
  if (/^[\s]*[=+@\-]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s
  return '"' + s.replace(/"/g, '""') + '"'
}
export function eventsCsv(events) {
  const keys = ['id','occurredAt','kind','source','reference','status','currency','amountMinor','itemCount']
  return '\uFEFF' + [keys, ...events.map(e => [e._id, new Date(e.occurredAt).toISOString(), e.kind, e.source, e.reference, e.status, e.currency, e.amountMinor, e.itemCount])].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
