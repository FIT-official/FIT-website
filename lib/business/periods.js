const DAY = 86400000
const OFFSET = 8 * 3600000
export const REPORT_TIME_ZONE = 'Asia/Singapore'
export const REPORT_KINDS = ['daily', 'weekly', 'monthly']
const isoDate = ms => new Date(ms).toISOString().slice(0, 10)

// Half-open Singapore calendar periods, independent of the server's timezone.
export function reportPeriod(kind, now = new Date()) {
  if (!REPORT_KINDS.includes(kind) || !Number.isFinite(+new Date(now))) throw Error('Invalid reporting period')
  const local = new Date(+new Date(now) + OFFSET)
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
  let end = today, start
  if (kind === 'weekly') end -= ((local.getUTCDay() + 6) % 7) * DAY
  if (kind === 'monthly') end = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1)
  if (kind === 'daily') start = end - DAY
  if (kind === 'weekly') start = end - 7 * DAY
  if (kind === 'monthly') start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 1, 1)
  return { kind, key: `${kind}:${isoDate(start)}`, timeZone: REPORT_TIME_ZONE,
    since: new Date(start - OFFSET), until: new Date(end - OFFSET),
    label: `${isoDate(start)} to ${isoDate(end - DAY)} (Singapore)`,
    dueAt: new Date(end - OFFSET + 8 * 3600000) }
}

export function duePeriods(now = new Date()) {
  return REPORT_KINDS.map(kind => reportPeriod(kind, now)).filter(p => +p.dueAt <= +now)
}

export function nextReportPeriod(period) {
  const due = new Date(period.dueAt)
  const next = period.kind === 'monthly'
    ? new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth() + 1, 1))
    : new Date(+due + (period.kind === 'weekly' ? 7 : 1) * DAY)
  return reportPeriod(period.kind, next)
}

export function parseReportRange(search, now = new Date()) {
  const kind = search.get('period') || 'daily'
  const anchor = search.get('at')
  const at = anchor ? new Date(anchor) : now
  if (anchor && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(anchor) || !Number.isFinite(+at) || +at > +now)) throw Error('Invalid report date')
  return reportPeriod(kind, at)
}
