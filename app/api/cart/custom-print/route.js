import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import User from '@/models/User'
import CustomPrintRequest from '@/models/CustomPrintRequest'

// POST /api/cart/custom-print { requestId }
export async function POST(request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { requestId } = body
  if (!requestId) {
    return NextResponse.json({ error: 'requestId is required' }, { status: 400 })
  }

  await connectToDatabase()

  const [user, reqDoc] = await Promise.all([
    User.findOne({ userId }),
    CustomPrintRequest.findOne({ requestId }),
  ])

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }
  if (!reqDoc) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }
  if (reqDoc.status !== 'payment_pending' || reqDoc.totalAmount <= 0) {
    return NextResponse.json({ error: 'Request is not ready for payment' }, { status: 400 })
  }

  // Represent the quoted request in the cart with a synthetic productId
  const productId = `custom-print:${reqDoc.requestId}`

  const existing = user.cart.find((item) => item.productId === productId)
  if (!existing) {
    user.cart.push({
      productId,
      quantity: 1,
      chosenDeliveryType: 'custom_print',
      selectedVariants: {},
      isCustomPrint: true,
      customPrintRequestId: reqDoc.requestId,
      price: reqDoc.totalAmount,
      finalPrice: reqDoc.totalAmount,
      basePrice: reqDoc.printFee,
      deliveryFee: reqDoc.deliveryFee,
      currency: reqDoc.currency || 'sgd',
    })
  }

  await user.save()

  return NextResponse.json({ cart: user.cart })
}
