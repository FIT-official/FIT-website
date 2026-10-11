import { NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/verifyCronSecret'
import { businessDb, notificationConfiguration, reconcileSources, prepareSummaries, drainNotifications } from '@/lib/business/server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  if (!verifyCronSecret(request.headers.get('authorization') || '', `Bearer ${process.env.CRON_SECRET}`)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!notificationConfiguration().enabled) return NextResponse.json({ enabled: false, attempted: 0 })
  try {
    const db = await businessDb(), now = new Date()
    const recovered = await reconcileSources(db, { now })
    const recoveryPending = recovered.some(r => r.morePossible || r.status === 'capture_failed')
    const summaries = recoveryPending ? { status: 'waiting_for_source_recovery' } : await prepareSummaries(db, { now })
    const delivery = await drainNotifications(db, { now })
    return NextResponse.json({ enabled: true, recovered, summaries, delivery }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Business notification run incomplete. Persisted records remain available for recovery.' }, { status: 503 })
  }
}
