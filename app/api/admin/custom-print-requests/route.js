import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import CustomPrintRequest from '@/models/CustomPrintRequest'
import Product from '@/models/Product'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'
import { validateDimensions } from '@/lib/validation/dimensions'
import { checkMachineLimits, machineLimitMessage } from '@/lib/quoting/machineLimits'
import AppSettings from '@/models/AppSettings'
import { getAppSettingsId } from '@/lib/appSettingsId'
import { notifyCustomPrintEvent } from '@/lib/notifications/customPrint'
import { withCreatorDisplayNames } from '@/lib/creatorPrintService/creatorNames'

// Admin: list all custom print requests
export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const hasAccess = await checkAdminPrivileges(userId)
  if (!hasAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await connectToDatabase()
  const docs = await CustomPrintRequest.find().sort({ createdAt: -1 }).lean()
  // Creator column for creator-routed jobs; the panel defaults to FIT-only.
  let requests = docs
  try {
    requests = await withCreatorDisplayNames(docs)
  } catch (err) {
    console.error('[GET /api/admin/custom-print-requests] creator names failed:', err)
  }
  return NextResponse.json({ requests })
}

// Admin: update quote / status for a specific request
export async function PUT(request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const hasAccess = await checkAdminPrivileges(userId)
  if (!hasAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { requestId, action, quoteAmount, currency, note, status, dimensions, delivery } = body

  if (!requestId) {
    return NextResponse.json({ error: 'requestId is required' }, { status: 400 })
  }

  const dimCheck = validateDimensions(dimensions)
  if (!dimCheck.ok) {
    return NextResponse.json({ error: dimCheck.error }, { status: 400 })
  }

  await connectToDatabase()

  // Range check against the admin-configured machine limits (catches unit
  // typos like grams entered as kg; no-op until limits are set).
  if (dimCheck.value) {
    const appSettings = await AppSettings.findById(getAppSettingsId()).lean()
    const limitsCheck = checkMachineLimits(
      dimCheck.value,
      dimCheck.value.weight ?? null,
      appSettings?.machineLimits || null,
    )
    if (!limitsCheck.fits) {
      return NextResponse.json(
        { error: machineLimitMessage(limitsCheck.violations) },
        { status: 400 },
      )
    }
  }

  const doc = await CustomPrintRequest.findOne({ requestId })
  if (!doc) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  // Which customer notification this action triggers (resolved after save).
  let notifyEvent = null

  if (action === 'quote') {
    if (typeof quoteAmount !== 'number' || quoteAmount < 0) {
      return NextResponse.json({ error: 'quoteAmount must be a non-negative number' }, { status: 400 })
    }
    const cur = currency || doc.currency || 'sgd'

    // Ensure basePrice exists (older requests may have been created before using the canonical slug lookup)
    if (doc.basePrice == null || Number(doc.basePrice) === 0) {
      try {
        const product = await Product.findOne({ slug: 'custom-print-request' }).lean();
        const amount = Number(product?.basePrice?.presentmentAmount);
        if (Number.isFinite(amount) && amount > 0) {
          doc.basePrice = amount;
        }
      } catch (e) {
        console.error('[PUT /api/admin/custom-print-requests] Failed to backfill basePrice:', e);
      }
    }

    // basePrice is set at request creation from product, do not overwrite here
    doc.printFee = quoteAmount
    // Save available delivery types (array of objects)
    if (delivery && Array.isArray(delivery.deliveryTypes)) {
      doc.delivery = { deliveryTypes: delivery.deliveryTypes }
    }
    // Save validated dimensions if provided
    if (dimCheck.value && Object.keys(dimCheck.value).length > 0) {
      doc.dimensions = { ...dimCheck.value }
    }
    // Save admin note if provided
    if (typeof note === 'string') {
      doc.adminNote = note
    }
    doc.currency = cur
    doc.status = 'quoted'
    // Admin-issued quotes are always 'manual' (the Instant Quoting Engine
    // sets 'instant' itself when persisting via /api/quote). Setting this
    // defensively keeps the cart's price-source branch deterministic.
    doc.quoteMode = 'manual'
    doc.statusHistory.push({
      status: 'quoted',
      note: note || 'Quote created.',
    })
    notifyEvent = 'quote-ready'
  } else if (action === 'cancel') {
    doc.status = 'cancelled'
    doc.statusHistory.push({ status: 'cancelled', note: note || 'Request cancelled by admin.' })
    notifyEvent = 'cancelled'
  } else if (action === 'status' && status) {
    doc.status = status
    doc.statusHistory.push({ status, note: note || `Status updated to ${status}` })
    // Only customer-meaningful transitions trigger a notification.
    if (['paid', 'printing', 'printed', 'shipped', 'delivered'].includes(status)) {
      notifyEvent = status
    }
  }

  await doc.save()

  // Notify the customer (email + buyer↔vendor chat) for this transition.
  // Best-effort — never fail the admin action on a notification error.
  if (notifyEvent) {
    try {
      const product = await Product.findOne({ slug: 'custom-print-request' })
        .select('creatorUserId')
        .lean()
      await notifyCustomPrintEvent({
        event: notifyEvent,
        request: doc.toObject(),
        product,
        note,
      })
    } catch (notifyErr) {
      console.error('[PUT /api/admin/custom-print-requests] notification failed:', notifyErr)
    }
  }

  // Remove deliveryFee from response if present
  const obj = doc.toObject()
  if ('deliveryFee' in obj) delete obj.deliveryFee
  return NextResponse.json({ request: obj })
}
