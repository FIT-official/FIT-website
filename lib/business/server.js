import { businessEvent, eventMessage, aggregateBusiness, summaryMessage, OWNER_EMAIL } from './events'
import { REPORT_KINDS, reportPeriod, nextReportPeriod } from './periods'
import { queueMessage, deliverNotification, notificationState, insertOnce } from './delivery'
import { sendTelegramAlert } from './telegram'
import { visitorSummary } from './visitors'

export function notificationConfiguration(env = process.env) {
  const startedAt = new Date(env.FIT_BUSINESS_NOTIFICATIONS_START_AT || '')
  return { enabled: env.FIT_BUSINESS_NOTIFICATIONS_ENABLED === 'true' && Number.isFinite(+startedAt),
    startedAt: Number.isFinite(+startedAt) ? startedAt : null,
    emailConfigured: env.GMAIL_USER?.toLowerCase() === OWNER_EMAIL && Boolean(env.GMAIL_PASSWORD),
    telegramConfigured: Boolean(env.FIT_TELEGRAM_BOT_TOKEN && /^\d{1,20}$/.test(env.FIT_TELEGRAM_CHAT_ID || '')),
    ownerEmail: OWNER_EMAIL, timeZone: 'Asia/Singapore', summariesAt: '08:00 Singapore; Monday weekly; first day monthly',
    retention: { eventsDays: 366, notificationSnapshotsDays: 90 },
    visitorBasis: 'Existing consented PostHog analytics',
    telegramDestinationConfigured: Boolean(env.FIT_TELEGRAM_CHAT_ID) }
}

let ready
export async function businessDb() {
  const { connectToDatabase } = await import('@/lib/db')
  const connection = await connectToDatabase(), db = connection.connection.db
  if (!ready) ready = Promise.all([
    db.collection('businessEvents').createIndex({ occurredAt: 1, _id: 1 }),
    db.collection('businessEvents').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('businessNotifications').createIndex({ status: 1, nextAttemptAt: 1 }),
    db.collection('businessNotifications').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]).catch(e => { ready = null; throw e })
  await ready
  return db
}

export function businessSender(env = process.env) {
  return async (channel, message) => {
    if (channel === 'telegram') {
      // Bind each queued message to the destination present when it was saved.
      if (!message.chatId || message.chatId !== env.FIT_TELEGRAM_CHAT_ID) return { status: 'not_configured', reason: 'telegram_destination_not_bound' }
      return sendTelegramAlert(message, { token: env.FIT_TELEGRAM_BOT_TOKEN, chatId: message.chatId })
    }
    if (!notificationConfiguration(env).emailConfigured) return { status: 'not_configured', reason: 'mailer_unavailable' }
    const { sendEmail } = await import('@/lib/email')
    const info = await sendEmail(message)
    if (info?.accepted?.some(v => String(v).toLowerCase() === OWNER_EMAIL)) return { status: 'accepted', providerId: info.messageId }
    if (info?.rejected?.some(v => String(v).toLowerCase() === OWNER_EMAIL)) return { status: 'failed', reason: 'provider_rejected' }
    return { status: 'uncertain', reason: 'provider_acknowledgement_unknown' }
  }
}

export async function stageEvent(db, input, { message, email = true, telegram = false, emailObservation = null,
  env = process.env, now = new Date(), dispatch = true, sender = businessSender(env) } = {}) {
  const configuration = notificationConfiguration(env)
  if (!configuration.enabled) return { status: 'disabled' }
  const event = businessEvent(input)
  if (+event.occurredAt < +configuration.startedAt) return { status: 'before_tracking_start' }
  const events = db.collection('businessEvents'), queue = db.collection('businessNotifications')
  const inserted = await insertOnce(events, { ...event, recordedAt: now })
  if (emailObservation) await events.updateOne({ _id: event._id }, { $set: { emailObservation: String(emailObservation).slice(0, 60) } })
  const ids = []
  if (email) ids.push(await queueMessage(queue, event._id, 'email', message || eventMessage(event), { now }))
  if (telegram) ids.push(await queueMessage(queue, event._id, 'telegram', { text: eventMessage(event).text, chatId: env.FIT_TELEGRAM_CHAT_ID || null }, { now }))
  const delivery = dispatch ? await Promise.all(ids.map(id => deliverNotification(queue, id, sender, { now }))) : []
  return { status: 'recorded', eventId: event._id, created: Boolean(inserted.upsertedCount), delivery }
}

export async function captureChat(event) {
  if (!notificationConfiguration().enabled) return { status: 'disabled' }
  const message = event.message, reference = message?.id
  if (!reference || !['message.new','message.updated'].includes(event.type)) return { status: 'ignored' }
  const kind = `chat.${event.type}`
  // No chat text, sender identity or participant list enters the business ledger.
  const senderId = message.user?.id || message.user_id
  const alert = event.type === 'message.new' && senderId !== process.env.STREAM_SUPPORT_USER_ID && message.user?.role !== 'admin' && !message.silent
  const occurredAt = event.type === 'message.updated' ? message.updated_at || event.created_at || message.created_at : message.created_at || event.created_at
  return stageEvent(await businessDb(), { kind, source: 'website-chat', reference,
    key: `${kind}:${reference}${event.type === 'message.updated' ? ':' + occurredAt : ''}`, occurredAt, status: event.channel?.data?.kind || event.channel?.kind || 'support' },
  { email: alert, telegram: alert })
}

export async function sourceEvents(db, source, reference, { env = process.env, dispatch = true } = {}) {
  const cfg = notificationConfiguration(env)
  if (!cfg.enabled) return { status: 'disabled' }
  const collections = { order: 'orders', print: 'customprintrequests', repair: 'printerrepairrequests', bulk: 'bulkFilamentRequests', fabrication: 'fabricationrequests', legacy: 'users' }
  if (!collections[source]) throw Error('Unknown source')
  const row = await db.collection(collections[source]).findOne(source === 'order' ? { stripeSessionId: reference } : source === 'bulk' ? { _id: reference } : source === 'legacy' ? { userId: reference } : { requestId: reference }, source === 'legacy' ? { projection: { orderHistory: 1 } } : {})
  if (!row) return { status: 'missing_source' }
  if (source === 'print' && row.source === 'product') {
    // Fulfilment jobs generated by a paid shop order are not new enquiries.
    for (const [index, h] of (row.statusHistory || []).entries()) {
      const at = h.timestamp || h.updatedAt || h.createdAt
      if (!at || !h.status || !Number.isFinite(+new Date(at)) || +new Date(at) < +cfg.startedAt) continue
      await stageEvent(db, { kind: 'order.status', source: 'print-job', reference: row.requestId,
        key: `status:print-job:${row.requestId}:${new Date(at).toISOString()}:${index}:${h.status}`, occurredAt: at, status: h.status }, { env, dispatch, email: false })
    }
    return { status: 'recorded_order_job' }
  }
  if (source === 'legacy') {
    for (const order of row.orderHistory || []) for (const [index, h] of (order.statusHistory || []).entries()) {
      const at = h.timestamp || h.updatedAt
      if (!at || !Number.isFinite(+new Date(at)) || +new Date(at) < +cfg.startedAt) continue
      await stageEvent(db, { kind: 'order.status', source: 'order-line', reference: String(order._id),
        key: `status:order-line:${order._id}:${new Date(at).toISOString()}:${index}:${h.status}`, occurredAt: at, status: h.status }, { env, dispatch, email: false })
    }
    return { status: 'recorded' }
  }
  let input, message, email = true, emailObservation = null
  if (source === 'order') {
    if (!row.paidConfirmedAt) return { status: 'not_paid' }
    input = { kind: 'order.paid', source, reference: row.orderId, key: `order.paid:${row.stripeSessionId}`,
      occurredAt: row.paidConfirmedAt, status: 'paid', amountMinor: Math.round(row.totalAmount * 100), currency: row.currency,
      itemCount: (row.items || []).reduce((n, i) => n + i.quantity, 0) }
    if (+new Date(row.paidConfirmedAt) >= +cfg.startedAt) {
      const checkout = await db.collection('checkoutsessions').findOne({ sessionId: row.stripeSessionId })
      const { buildPaidOrderOwnerDigest } = await import('@/lib/notifications/ownerDigestMessage')
      // Existing immutable preparation builder; exclude all stored card metadata.
      try { message = buildPaidOrderOwnerDigest({ checkout, order: { ...row, paymentMethod: { type: row.paymentMethod?.type } } }) }
      catch {
        // A legacy or incomplete preparation snapshot must not hide a payment
        // from business totals. Explicitly require review; invent no item data.
        const generic = eventMessage(businessEvent(input))
        const notice = 'Preparation snapshot unavailable or inconsistent. Staff review is required before preparing this order.'
        message = { ...generic, subject: `FIT paid order needs preparation review ${row.orderId}`,
          text: notice + '\n\n' + generic.text, html: '<p>' + notice + '</p>' + generic.html }
      }
    }
  } else {
    if (source === 'print' && (!row.guidedBrief && !row.printConfiguration?.isConfigured)) return { status: 'draft' }
    const ref = source === 'bulk' ? row._id : row.requestId
    const firstConfigured = (row.statusHistory || []).find(h => h.status === 'configured')
    const submittedAt = source === 'print' && !row.guidedBrief ? firstConfigured?.updatedAt || firstConfigured?.timestamp || row.printConfiguration?.configuredAt || row.createdAt : row.createdAt
    input = { kind: 'enquiry.submitted', source, reference: ref, key: `enquiry.submitted:${source}:${ref}`,
      occurredAt: submittedAt, status: source === 'bulk' ? 'new' : source === 'repair' ? 'assessment_requested' : source === 'fabrication' ? 'submitted' : 'configured' }
    if (source === 'print' && row.guidedBrief && !row.creatorUserId && +new Date(row.createdAt) >= +cfg.startedAt) {
      const { buildGuidedOwnerDigest } = await import('@/lib/notifications/ownerDigestMessage')
      message = buildGuidedOwnerDigest(row)
    }
    if (source === 'bulk' || source === 'repair') { email = false; emailObservation = row.notifications?.email?.status }
  }
  const result = +new Date(input.occurredAt) < +cfg.startedAt ? { status: 'before_tracking_start' } : await stageEvent(db, input, { message, email, emailObservation, env, dispatch })
  // Only source-recorded transitions count. Reconciliation can recover these
  // without fabricating a history from today's mutable status.
  for (const [index, h] of (row.businessStatusHistory || row.statusHistory || []).entries()) {
    const at = h.timestamp || h.updatedAt || h.createdAt
    if (!at || !h.status || !Number.isFinite(+new Date(at)) || +new Date(at) < +cfg.startedAt || (index === 0 && h.status === input.status && Math.abs(+new Date(at) - +new Date(input.occurredAt)) < 1000)) continue
    await stageEvent(db, { kind: source === 'order' ? 'order.status' : 'enquiry.status', source, reference: input.reference,
      key: `status:${source}:${input.reference}:${new Date(at).toISOString()}:${index}:${h.status}`, occurredAt: at, status: h.status }, { env, dispatch, email: false })
  }
  return result
}

export async function observeSource(source, reference) {
  if (!notificationConfiguration().enabled) return { status: 'disabled' }
  try { return await sourceEvents(await businessDb(), source, reference) }
  catch { console.error('[business-notifications] source capture pending reconciliation', source); return { status: 'capture_failed' } }
}

export async function observeStatus({ source, reference, key, at, status }) {
  if (!notificationConfiguration().enabled) return { status: 'disabled' }
  try { return await stageEvent(await businessDb(), { source, reference, key, occurredAt: at, status,
    kind: source === 'order' || source === 'order-line' ? 'order.status' : 'enquiry.status' }, { email: false }) }
  catch { console.error('[business-notifications] status capture pending reconciliation', source); return { status: 'capture_failed' } }
}

export async function loadReport(db, period, options = {}) {
  const cfg = notificationConfiguration(options.env)
  const rows = await db.collection('businessEvents').find({ occurredAt: { $gte: period.since, $lt: period.until } }).sort({ occurredAt: 1, _id: 1 }).limit(50001).toArray()
  if (rows.length > 50000) throw Error('Report exceeds bounded export size; choose a shorter period')
  const visitors = await visitorSummary(period, options)
  return { report: aggregateBusiness(rows, period, { startedAt: cfg.startedAt, visitors }), rows }
}

export async function prepareSummaries(db, { env = process.env, now = new Date(), fetchImpl = fetch } = {}) {
  const cfg = notificationConfiguration(env)
  if (!cfg.enabled) return { status: 'disabled' }
  const summaries = db.collection('businessReports'), queue = db.collection('businessNotifications'), state = db.collection('businessReportState')
  // One due period per cadence per run. Persisted cursors catch up after an
  // outage, without flooding old pre-activation periods or skipping days.
  return Promise.all(REPORT_KINDS.map(async kind => {
    const cursor = await state.findOne({ _id: `summary:${kind}` })
    const period = nextReportPeriod(reportPeriod(kind, cursor?.dueAt || cfg.startedAt))
    if (+period.dueAt > +now) return { kind, status: 'not_due', dueAt: period.dueAt }
    let snapshot = await summaries.findOne({ _id: period.key })
    if (!snapshot) {
      const { report } = await loadReport(db, period, { env, fetchImpl })
      await insertOnce(summaries, { _id: period.key, report, preparedAt: now })
      snapshot = await summaries.findOne({ _id: period.key })
    }
    const id = await queueMessage(queue, `report:${period.key}`, 'email', summaryMessage(snapshot.report), { now })
    await insertOnce(state, { _id: `summary:${kind}`, dueAt: period.dueAt })
    await state.updateOne({ _id: `summary:${kind}` }, { $max: { dueAt: period.dueAt } })
    return { period: period.key, notificationId: id, moreDue: +nextReportPeriod(period).dueAt <= +now }
  }))
}

export async function drainNotifications(db, { env = process.env, now = new Date(), sender = businessSender(env) } = {}) {
  if (!notificationConfiguration(env).enabled) return { status: 'disabled' }
  const store = db.collection('businessNotifications')
  const rows = await store.find({ status: { $in: ['pending','retry'] }, nextAttemptAt: { $lte: now }, attempts: { $lt: 4 } }).sort({ createdAt: 1 }).limit(8).toArray()
  const results = []
  for (let i = 0; i < rows.length; i += 4) results.push(...await Promise.all(rows.slice(i, i + 4).map(r => deliverNotification(store, r._id, sender, { now }))))
  return { attempted: rows.length, results }
}

export async function notificationHealth(db, now = new Date()) {
  const rows = await db.collection('businessNotifications').find({}, { projection: { _id: 1, channel: 1, status: 1, reason: 1, attempts: 1, createdAt: 1, leaseUntil: 1 } }).sort({ createdAt: -1 }).limit(10001).toArray()
  const counts = {}
  for (const r of rows.slice(0, 10000)) { const state = notificationState(r, now); counts[state] = (counts[state] || 0) + 1 }
  const review = rows.filter(r => ['failed','not_configured','uncertain'].includes(notificationState(r, now))).slice(0, 20).map(r => ({
    id: r._id, channel: r.channel, status: notificationState(r, now), reason: r.reason || 'acknowledgement_unknown', attempts: r.attempts,
    canRetry: ['failed','not_configured'].includes(r.status) && r.attempts < 4 && r.reason !== 'invalid_snapshot' }))
  return { counts, review, capped: rows.length > 10000, acceptedMeans: 'Provider accepted, not inbox/read confirmation' }
}

export async function retryKnownFailure(db, id, { env = process.env, now = new Date(), sender = businessSender(env) } = {}) {
  if (!notificationConfiguration(env).enabled) return { status: 'disabled' }
  const store = db.collection('businessNotifications')
  const prior = await store.findOne({ _id: id })
  if (!prior || prior.reason === 'invalid_snapshot') return { status: 'not_retryable' }
  const row = await store.findOneAndUpdate({ _id: id, status: { $in: ['failed','not_configured'] }, attempts: { $lt: 4 } },
    { $set: { status: 'retry', nextAttemptAt: now } }, { returnDocument: 'after' })
  if (!row) return { status: 'not_retryable' }
  return deliverNotification(store, id, sender, { now })
}

// Cursor-based recovery of saved business sources after capture outages. Never
// backfill earlier than explicit activation, and never read the current cart.
export async function reconcileSources(db, { env = process.env, now = new Date(), budgetMs = 15000 } = {}) {
  const cfg = notificationConfiguration(env)
  if (!cfg.enabled) return { status: 'disabled' }
  const state = db.collection('businessReportState'), results = [], deadline = Date.now() + budgetMs
  for (const [source, collection] of Object.entries({ order: 'orders', print: 'customprintrequests', repair: 'printerrepairrequests', bulk: 'bulkFilamentRequests', fabrication: 'fabricationrequests', legacy: 'users' })) {
    if (Date.now() >= deadline) { results.push({ source, recovered: 0, morePossible: true }); continue }
    const cursor = await state.findOne({ _id: `cursor:${source}` })
    const since = cursor?.at ? new Date(cursor.at) : cfg.startedAt
    const field = source === 'legacy' ? 'businessActivityAt' : 'updatedAt'
    const query = { [field]: { $gte: since, $lte: now } }
    if (cursor?.id) query.$or = [{ [field]: { $gt: since } }, { [field]: since, _id: { $gt: cursor.id } }]
    const rows = await db.collection(collection).find(query, { projection: { _id: 1, requestId: 1, stripeSessionId: 1, userId: 1, updatedAt: 1, businessActivityAt: 1 } }).sort({ [field]: 1, _id: 1 }).limit(101).toArray()
    let recovered = 0
    for (const row of rows.slice(0, 100)) {
      if (Date.now() >= deadline) break
      try { await sourceEvents(db, source, source === 'order' ? row.stripeSessionId : source === 'legacy' ? row.userId : source === 'bulk' ? row._id : row.requestId, { env, dispatch: false }) }
      catch { results.push({ source, status: 'capture_failed' }); break }
      await state.updateOne({ _id: `cursor:${source}` }, { $set: { at: row[field], id: row._id } }, { upsert: true }); recovered++
    }
    results.push({ source, recovered, morePossible: recovered < rows.length })
  }
  return results
}
