import { NextResponse } from 'next/server'
import { loadBulkCatalogue } from '@/lib/bulkFilamentHttp'
import { makerCatalogue } from '@/lib/makerTools/catalogue'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET() {
  try {
    return NextResponse.json({ offers: makerCatalogue(await loadBulkCatalogue()) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Current catalogue stock could not be confirmed. Refresh to try again.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
