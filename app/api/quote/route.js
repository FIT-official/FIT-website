import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import AppSettings from '@/models/AppSettings'
import CustomPrintRequest from '@/models/CustomPrintRequest'
import { buildQuote } from '@/lib/quoting/quoteRequest'
import { getAppSettingsId } from '@/lib/appSettingsId'
import { getFilamentAvailability, rushAvailability } from '@/lib/filamentInventory'
import { limitQuoteRequest } from '@/lib/rateLimit'
import { machineLimitMessage } from '@/lib/quoting/machineLimits'
import { checkQuoteLimits, persistInstantQuote } from '@/lib/quoting/persistInstantQuote'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const MAX_BODY_BYTES = 50_000

async function readBodyWithLimit(req, maxBytes) {
  if (!req.body) {
    const text = await req.text()
    return new TextEncoder().encode(text).byteLength > maxBytes ? { tooLarge: true } : { tooLarge: false, text }
  }
  const reader = req.body.getReader()
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) { reader.cancel().catch(() => {}); return { tooLarge: true } }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return { tooLarge: false, text: new TextDecoder().decode(bytes) }
}

export async function POST(req) {
  try {
    const { tooLarge, text } = await readBodyWithLimit(req, MAX_BODY_BYTES)
    if (tooLarge) return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    const { userId } = await auth()
    const rate = await limitQuoteRequest({ userId, headers: req.headers })
    if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Please retry shortly.' }, { status: 429, headers: rate.headers })
    let body
    try { body = JSON.parse(text) } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
    await connectToDatabase()
    const settings = await AppSettings.findById(getAppSettingsId()).lean()
    const pricingConfig = settings?.quotingConfig || {}
    const deliveryTypes = settings?.additionalDeliveryTypes || []
    const result = buildQuote(body, { pricingConfig, deliveryTypes })
    if (!result.ok) return NextResponse.json({ error: result.error, issues: result.issues }, { status: result.status })
    const { quote, requestId, preview } = result.data
    if (!requestId) {
      if (body.options?.priority || body.options?.expedite) {
        let colours
        try { colours = await getFilamentAvailability() }
        catch { return NextResponse.json({ error: 'Rush availability cannot be checked right now. Try again shortly.' }, { status: 503 }) }
        if (rushAvailability(colours, body.selection?.filament, body.selection?.colour) !== 'in_stock')
          return NextResponse.json({ error: 'This colour is unavailable for rush or priority. Choose an in-stock colour.' }, { status: 409 })
      }
      const limits = checkQuoteLimits(quote, settings)
      if (!limits.fits) return NextResponse.json({ error: machineLimitMessage(limits.violations) }, { status: 422 })
      return NextResponse.json({ quote, estimateOnly: true }, { headers: rate.headers })
    }
    if (!userId) return NextResponse.json({ error: 'Sign in to save a quote' }, { status: 401 })
    const request = await CustomPrintRequest.findOne({ requestId })
    if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    // The stored model is re-measured and priced server-side; with `preview`
    // nothing is written, otherwise the verified quote becomes the cart price.
    const outcome = await persistInstantQuote({ request, userId, body, preview, appSettings: settings })
    return NextResponse.json(outcome.body, { status: outcome.status, headers: outcome.status === 200 ? rate.headers : undefined })
  } catch (error) {
    console.error('Quote request failed:', error?.message || 'quote_error')
    return NextResponse.json({ error: 'The quote service is temporarily unavailable. Please try again.' }, { status: 503 })
  }
}
