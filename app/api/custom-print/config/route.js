import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import CustomPrintRequest from '@/models/CustomPrintRequest'
import Product from '@/models/Product'
import { sendEmail } from '@/lib/email'
import { buildManualQuoteAdminEmail } from '@/lib/manualQuoteEmail'
import { notifyCustomPrintEvent } from '@/lib/notifications/customPrint'
import { MUTABLE_PRINT_STATUSES, PrintConfigurationError, validatePrintConfiguration } from '@/lib/quoting/validatePrintConfiguration'

export async function PUT(req) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    let body
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
    const { requestId, mode = 'manual' } = body || {}
    if (typeof requestId !== 'string' || !requestId || requestId.length > 100) {
      return NextResponse.json({ error: 'Request ID is required' }, { status: 400 })
    }
    if (!['instant', 'manual'].includes(mode)) return NextResponse.json({ error: 'Invalid quote mode' }, { status: 400 })
    const configuration = validatePrintConfiguration(body)
    if (mode === 'instant' && configuration.printSettings.materialType !== 'plastic') {
      return NextResponse.json({ error: 'This material needs a manual quote' }, { status: 400 })
    }
    await connectToDatabase()
    const existing = await CustomPrintRequest.findOne({ requestId, userId })
    if (!existing) return NextResponse.json({ error: 'Custom print request not found' }, { status: 404 })
    if (!MUTABLE_PRINT_STATUSES.includes(existing.status) || existing.paidAt || existing.stripeSessionId
      || existing.stripePaymentIntentId || existing.source === 'product') {
      return NextResponse.json({ error: 'This request is in payment or fulfilment and its print settings are locked' }, { status: 409 })
    }
    if (existing.creatorUserId) {
      return NextResponse.json({ error: 'Contact your print service to change this request' }, { status: 409 })
    }
    const now = new Date()
    // Status and version guards close the race with payment or another editor.
    // Every settings change invalidates the old price before any new quote.
    const customPrintRequest = await CustomPrintRequest.findOneAndUpdate({
      requestId, userId, status: { $in: MUTABLE_PRINT_STATUSES }, paidAt: null,
      stripeSessionId: null, stripePaymentIntentId: null,
      ...(existing.updatedAt ? { updatedAt: existing.updatedAt } : {}),
    }, {
      $set: { printConfiguration: { ...configuration, configuredAt: now, isConfigured: true },
        quoteMode: mode, status: 'configured' },
      $unset: { quote: 1, quotedAt: 1 },
      $push: { statusHistory: { status: 'configured', updatedAt: now,
        note: mode === 'manual' ? 'Print settings saved, awaiting manual quote' : 'Print settings saved, quote refresh required' } },
    }, { new: true, runValidators: true })
    if (!customPrintRequest) return NextResponse.json({ error: 'This request changed. Reload it before saving settings.' }, { status: 409 })

    if (mode === 'manual') {
      const adminEmail = process.env.ADMIN_EMAIL || process.env.GMAIL_USER
      if (adminEmail) {
        try {
          const { subject, html } = buildManualQuoteAdminEmail({ request: customPrintRequest.toObject() })
          await sendEmail({ to: adminEmail, subject, html })
        } catch (error) { console.error('Manual-quote admin notification failed:', error) }
      }
      try {
        const product = await Product.findOne({ slug: 'custom-print-request' }).select('creatorUserId').lean()
        await notifyCustomPrintEvent({ event: 'awaiting-quote', request: customPrintRequest.toObject(), product })
      } catch (error) { console.error('Awaiting-quote customer notification failed:', error) }
    }
    return NextResponse.json({ success: true, message: 'Configuration saved successfully', request: customPrintRequest })
  } catch (error) {
    if (error instanceof PrintConfigurationError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error('Error saving print configuration:', error)
    return NextResponse.json({ error: 'Failed to save configuration' }, { status: 500 })
  }
}
