import { NextResponse } from 'next/server'
import { getFilamentAvailability, unavailableFilamentCatalogue } from '@/lib/filamentInventory'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const colours = await getFilamentAvailability()
    return NextResponse.json({ colours, stockChecked: true },
      { headers: { 'Cache-Control': 'private, max-age=0' } })
  } catch (error) {
    console.error('FIT filament availability unavailable:', error?.message || 'inventory_error')
    return NextResponse.json({ colours: unavailableFilamentCatalogue(), stockChecked: false },
      { headers: { 'Cache-Control': 'no-store' } })
  }
}
