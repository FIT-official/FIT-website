import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import CustomPrintRequest from '@/models/CustomPrintRequest'
import Product from '@/models/Product'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'

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
  const requests = await CustomPrintRequest.find().sort({ createdAt: -1 }).lean()
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

  await connectToDatabase()

  const doc = await CustomPrintRequest.findOne({ requestId })
  if (!doc) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

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
    // Save dimensions if provided
    if (dimensions && typeof dimensions === 'object') {
      doc.dimensions = { ...dimensions }
    }
    // Save admin note if provided
    if (typeof note === 'string') {
      doc.adminNote = note
    }
    doc.currency = cur
    doc.status = 'quoted'
    doc.statusHistory.push({
      status: 'quoted',
      note: note || 'Quote created.',
    })
  } else if (action === 'cancel') {
    doc.status = 'cancelled'
    doc.statusHistory.push({ status: 'cancelled', note: note || 'Request cancelled by admin.' })
  } else if (action === 'status' && status) {
    doc.status = status
    doc.statusHistory.push({ status, note: note || `Status updated to ${status}` })
  }

  await doc.save()
  // Remove deliveryFee from response if present
  const obj = doc.toObject()
  if ('deliveryFee' in obj) delete obj.deliveryFee
  return NextResponse.json({ request: obj })
}
