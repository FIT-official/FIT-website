import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db'
import User from '@/models/User'
import CustomPrintRequest from '@/models/CustomPrintRequest'
import { authenticate, unauthorizedResponse, UnauthorizedError } from '@/lib/authenticate'
import { customPrintDisplayPrice } from '@/lib/customPrintDisplayPrice'

// POST /api/cart/custom-print { requestId }
export async function POST(request) {
  try {
    const { userId } = await authenticate(request);
    const body = await request.json()
    const { requestId } = body
    if (!requestId) {
      console.log('[POST /api/cart/custom-print] requestId is required');
      return NextResponse.json({ error: 'requestId is required' }, { status: 400 })
    }
    await connectToDatabase()
    const [user, reqDoc] = await Promise.all([
      User.findOne({ userId }),
      // Ownership-scoped: a foreign requestId behaves exactly like an unknown
      // one (404), so this endpoint is not an existence oracle.
      CustomPrintRequest.findOne({ requestId, userId }),
    ])
    if (!user) {
      console.log('[POST /api/cart/custom-print] User not found for userId:', userId);
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    if (!reqDoc) {
      console.log('[POST /api/cart/custom-print] CustomPrintRequest not found for requestId:', requestId);
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }
    // Allow adding to cart regardless of status/quote
    // Represent the quoted request in the cart with a synthetic productId
    const productId = `custom-print:${reqDoc.requestId}`
    const existing = user.cart.find((item) => item.productId === productId)
    if (!existing) {
      const availableDeliveryTypes = reqDoc.delivery?.deliveryTypes || []
      const defaultDeliveryType =
        reqDoc.status === 'quoted' && availableDeliveryTypes.length > 0
          ? (availableDeliveryTypes[0].type || 'custom_print')
          : 'custom_print'

      user.cart.push({
        productId,
        quantity: 1,
        chosenDeliveryType: defaultDeliveryType,
        requestId: reqDoc.requestId,
        // Snapshot the same amount the cart displays and checkout charges
        // (instant → quote.total, manual → basePrice + printFee).
        price: reqDoc.status === 'quoted' ? customPrintDisplayPrice(reqDoc).amount : 0,
      })
    }
    await user.save()
    return NextResponse.json({ cart: user.cart })
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    // Log the full error for debugging
    console.error('Error in /api/cart/custom-print POST:', error);
    if (error && error.errors) {
      Object.entries(error.errors).forEach(([key, val]) => {
        console.error(`[POST /api/cart/custom-print] Validation error for ${key}:`, val && val.message, val);
      });
    }
    if (error && error.stack) {
      console.error('[POST /api/cart/custom-print] Stack trace:', error.stack);
    }
    // Never echo internal error objects to the client; full detail is logged above.
    return NextResponse.json({ error: 'Could not add the print request to the cart' }, { status: 500 })
  }
}
