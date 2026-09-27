import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db'
import AppSettings from '@/models/AppSettings'
import Product from '@/models/Product'
import { getAppSettingsId } from '@/lib/appSettingsId'
import { DEFAULT_PRINT_COLOURS } from '@/lib/quoting/genericPresets'
import { buildDeliveryOptions } from '@/lib/customPrint/deliveryOptions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FALLBACK = { printColours: DEFAULT_PRINT_COLOURS, deliveryTypes: buildDeliveryOptions([], []), machineLimits: null }

/**
 * GET /api/quote/config — customer-readable, non-sensitive quoting config for the
 * editor and the print request page. Exposes the colour/material catalogue, the
 * custom-print product's delivery options (type, display name, flat price) and
 * the machine limits, never pricing internals (the server prices via /api/quote).
 * Public: signed-out visitors need it to preview a request. Falls back to defaults.
 */
export async function GET() {
  try {
    await connectToDatabase()
    const [settings, product] = await Promise.all([
      AppSettings.findById(getAppSettingsId()).lean(),
      Product.findOne({ slug: 'custom-print-request' }).select('delivery').lean(),
    ])
    const printColours = settings?.printColours?.length ? settings.printColours : DEFAULT_PRINT_COLOURS
    const deliveryTypes = buildDeliveryOptions(product?.delivery?.deliveryTypes || [], settings?.additionalDeliveryTypes || [])
    const limits = settings?.machineLimits || null
    const machineLimits = limits && Object.values(limits).some(value => Number(value) > 0) ? {
      maxLengthCm: limits.maxLengthCm ?? null, maxWidthCm: limits.maxWidthCm ?? null,
      maxHeightCm: limits.maxHeightCm ?? null, maxWeightKg: limits.maxWeightKg ?? null,
    } : null
    return NextResponse.json({ printColours, deliveryTypes, machineLimits }, { status: 200 })
  } catch (error) {
    console.error('Error fetching public quote config:', error)
    // Degrade gracefully: the editor and request page fall back to defaults on any failure.
    return NextResponse.json(FALLBACK, { status: 200 })
  }
}
