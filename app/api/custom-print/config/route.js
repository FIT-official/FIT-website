import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import AppSettings from '@/models/AppSettings'
import CustomPrintRequest from '@/models/CustomPrintRequest'
import Product from '@/models/Product'
import { sendEmail } from '@/lib/email'
import { buildManualQuoteAdminEmail } from '@/lib/manualQuoteEmail'
import { notifyCustomPrintEvent } from '@/lib/notifications/customPrint'
import { getAppSettingsId } from '@/lib/appSettingsId'
import { persistInstantQuote } from '@/lib/quoting/persistInstantQuote'
import { MUTABLE_PRINT_STATUSES, PrintConfigurationError, validatePrintConfiguration } from '@/lib/quoting/validatePrintConfiguration'

const OPTION_KEYS = ['postProcessing', 'specialRequest', 'priority', 'expedite']

function pickOptions(body, existing) {
  const source = body?.options && typeof body.options === 'object' ? body.options : existing?.quote?.inputs?.options || {}
  return Object.fromEntries(OPTION_KEYS.map(key => [key, source?.[key] === true]))
}

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
    // A price set by hand must not be replaced by an instant quote from the
    // customer's side; the store re-quotes if the settings need to change.
    if (mode === 'instant' && existing.quoteMode === 'manual' && existing.status === 'quoted') {
      return NextResponse.json({ error: 'This request was quoted by Fix It Today. Add it to the cart from your account, or contact the store to change it.' }, { status: 409 })
    }
    const now = new Date()
    // An instant request that already carried a verified price is re-quoted
    // below with its new settings; the old quote is never left chargeable
    // (status drops to 'configured' until the refresh succeeds). A manual
    // request simply loses its quote and waits for the store.
    const refreshQuote = mode === 'instant' && existing.quoteMode === 'instant' && Number.isFinite(existing.quote?.total)
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
        note: mode === 'manual' ? 'Print settings saved, awaiting manual quote'
          : refreshQuote ? 'Print settings changed, refreshing the instant quote' : 'Print settings saved, quote refresh required' } },
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
      return NextResponse.json({ success: true, message: 'Configuration saved successfully', request: customPrintRequest })
    }
    if (!refreshQuote) return NextResponse.json({ success: true, message: 'Configuration saved successfully', request: customPrintRequest })

    const appSettings = await AppSettings.findById(getAppSettingsId()).lean()
    const outcome = await persistInstantQuote({ request: customPrintRequest, userId,
      body: { options: pickOptions(body, existing) }, appSettings })
    if (outcome.status !== 200) {
      return NextResponse.json({ success: true, message: 'Configuration saved; the quote could not be refreshed',
        request: customPrintRequest, quoteRefreshed: false, quoteError: outcome.body.error }, { status: 200 })
    }
    return NextResponse.json({ success: true, message: 'Configuration saved and quote refreshed',
      request: outcome.request || customPrintRequest, quote: outcome.body.quote, quoteRefreshed: true })
  } catch (error) {
    if (error instanceof PrintConfigurationError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error('Error saving print configuration:', error)
    return NextResponse.json({ error: 'Failed to save configuration' }, { status: 500 })
  }
}
