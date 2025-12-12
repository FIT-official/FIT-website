import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import CustomPrintRequest from '@/models/CustomPrintRequest'
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
  const { requestId, action, quoteAmount, deliveryFee, currency, note, status, deliveryType } = body

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
    const safeDelivery = typeof deliveryFee === 'number' && deliveryFee >= 0 ? deliveryFee : 0
    const cur = currency || doc.currency || 'sgd'

    doc.basePrice = quoteAmount
    doc.printFee = quoteAmount
    doc.deliveryFee = safeDelivery
    doc.deliveryType = deliveryType || doc.deliveryType || null
    doc.totalAmount = quoteAmount + safeDelivery
    doc.currency = cur
    doc.status = 'payment_pending'
    doc.statusHistory.push({
      status: 'payment_pending',
      note: note || 'Quote created and awaiting payment.',
    })
  } else if (action === 'cancel') {
    doc.status = 'cancelled'
    doc.statusHistory.push({ status: 'cancelled', note: note || 'Request cancelled by admin.' })
  } else if (action === 'status' && status) {
    doc.status = status
    doc.statusHistory.push({ status, note: note || `Status updated to ${status}` })
  }

  await doc.save()
  return NextResponse.json({ request: doc })
}
