import { NextResponse } from 'next/server'
import { authenticate, unauthorizedResponse } from '@/lib/authenticate'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'
import { businessDb, notificationConfiguration, notificationHealth, loadReport, retryKnownFailure } from '@/lib/business/server'
import { parseReportRange } from '@/lib/business/periods'
import { eventsCsv } from '@/lib/business/events'
import { verifyCronSecret } from '@/lib/verifyCronSecret'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }

export async function POST(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Open this action on the website.' }, { status: 403, headers })
  let userId
  try { ({ userId } = await authenticate(request)) } catch { return unauthorizedResponse() }
  if (!await checkAdminPrivileges(userId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers })
  let body
  try {
    const text = await request.text()
    if (text.length > 1024) throw Error('Oversized request')
    body = JSON.parse(text)
    if (body.action !== 'retry_known_failure' || !/^[a-f0-9]{64}$/.test(body.id || '')) throw Error('Invalid request')
  } catch { return NextResponse.json({ error: 'Choose a valid notification.' }, { status: 400, headers }) }
  try {
    const result = await retryKnownFailure(await businessDb(), body.id)
    return NextResponse.json(result, { status: ['disabled','not_retryable'].includes(result.status) ? 409 : 200, headers })
  } catch { return NextResponse.json({ error: 'Retry outcome unavailable. Refresh delivery status before trying again.' }, { status: 503, headers }) }
}

export async function GET(request) {
  const url = new URL(request.url), exportMode = url.searchParams.get('download')
  // Existing scheduler credential may only read the redacted event export.
  const exportAuthorized = exportMode === 'page.json' && Boolean(process.env.CRON_SECRET) && verifyCronSecret(request.headers.get('authorization') || '', `Bearer ${process.env.CRON_SECRET}`)
  if (!exportAuthorized) {
    let userId
    try { ({ userId } = await authenticate(request)) } catch { return unauthorizedResponse() }
    if (!await checkAdminPrivileges(userId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers })
  }
  let period
  try { period = parseReportRange(url.searchParams) } catch { return NextResponse.json({ error: 'Choose a valid report period and UTC date.' }, { status: 400, headers }) }
  try {
    const db = await businessDb(), configuration = notificationConfiguration()
    if (exportMode === 'page.json' || exportMode === 'events.csv') {
      const query = { occurredAt: { $gte: period.since, $lt: period.until } }
      const after = url.searchParams.get('after')
      if (after) {
        let cursor
        try { cursor = JSON.parse(Buffer.from(after, 'base64url').toString()) } catch { return NextResponse.json({ error: 'Invalid export cursor.' }, { status: 400, headers }) }
        if (!/^[a-f0-9]{64}$/.test(cursor.id || '') || !Number.isFinite(Date.parse(cursor.at))) return NextResponse.json({ error: 'Invalid export cursor.' }, { status: 400, headers })
        query.$or = [{ occurredAt: { $gt: new Date(cursor.at) } }, { occurredAt: new Date(cursor.at), _id: { $gt: cursor.id } }]
      }
      const rows = await db.collection('businessEvents').find(query, { projection: { _id: 1, version: 1, kind: 1, source: 1, reference: 1, occurredAt: 1, status: 1, amountMinor: 1, currency: 1, itemCount: 1 } }).sort({ occurredAt: 1, _id: 1 }).limit(2001).toArray()
      const more = rows.length > 2000, events = rows.slice(0, 2000), last = events.at(-1)
      if (exportMode === 'events.csv') {
        if (more) return NextResponse.json({ error: 'This period has over 2,000 events. Use the E-drive exporter for the complete paginated export.' }, { status: 413, headers })
        return new Response(eventsCsv(events), { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="fit-business-${period.key.replace(':','-')}.csv"` } })
      }
      return NextResponse.json({ period, events, next: more ? Buffer.from(JSON.stringify({ at: last.occurredAt.toISOString(), id: last._id })).toString('base64url') : null, privacy: 'Redacted business ledger; no contact, chat body, card, credential or visitor-identity fields.' }, { headers })
    }
    const [{ report }, health] = await Promise.all([loadReport(db, period), notificationHealth(db)])
    if (exportMode === 'summary.json') return new Response(JSON.stringify(report, null, 2), { headers: { ...headers, 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="fit-summary-${period.key.replace(':','-')}.json"` } })
    return NextResponse.json({ configuration, report, health }, { headers })
  } catch {
    return NextResponse.json({ error: 'Report unavailable. No missing data has been reported as zero.' }, { status: 503, headers })
  }
}
