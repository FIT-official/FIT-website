import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { cartIdentity } from '@/lib/cartOwner';
import { connectToDatabase } from '@/lib/db';
import { storeDeadline } from '@/lib/storeDeadline';
import CheckoutSession from '@/models/CheckoutSession';
import Order from '@/models/Order';
import { buildGooglePurchase, buildGoogleReviewOptIn } from '@/lib/googleMeasurementReceipt';
import { GOOGLE_REVIEW_POLICY } from '@/lib/googleMeasurementConfig';

export const dynamic = 'force-dynamic';
function json(body, status = 200) {
    return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' } });
}

export async function GET(request, { params }) {
    const { sessionId } = await params;
    if (!/^cs_[a-zA-Z0-9_]{1,200}$/.test(sessionId || '')) return json({ error: 'Invalid payment link.' }, 400);
    try {
        // Do not create a guest identity or extend the public status route with PII.
        const { userId } = await cartIdentity(request);
        if (!userId) return json({ error: 'Order confirmation is unavailable.' }, 401);
        await storeDeadline(connectToDatabase());
        const checkout = await storeDeadline(CheckoutSession.findOne({ sessionId, userId })
            .select('sessionId userId status snapshotVersion items totalAmount currency').lean());
        if (!checkout) return json({ error: 'Order confirmation is unavailable.' }, 404);
        if (checkout.status === 'pending') return json({ pending: true }, 202);
        const order = await storeDeadline(Order.findOne({ stripeSessionId: sessionId, userId })
            .select('orderId stripeSessionId userId status customerEmail shippingAddress.country googleReviewDeliveryEstimate').lean());
        if (!order) return json({ pending: checkout.status === 'completed', purchase: null, review: null });
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-05-28.basil', timeout: 8000, maxNetworkRetries: 0 });
        const payment = await storeDeadline(stripe.checkout.sessions.retrieve(sessionId), 9000);
        const input = { ownerId: userId, checkout, order, payment };
        const purchase = buildGooglePurchase(input);
        const estimate = order.googleReviewDeliveryEstimate;
        // Only an explicit verified fulfilment record is accepted. Generic feed
        // handling/transit times and page-visit dates are never substitutes.
        const deliveryEstimate = estimate?.verifiedAt && Number.isFinite(Date.parse(estimate.verifiedAt))
            ? { orderId: order.orderId, date: estimate.date, source: estimate.source } : null;
        const review = buildGoogleReviewOptIn({ ...input, deliveryEstimate, policy: GOOGLE_REVIEW_POLICY });
        return json({ purchase, review, reviewUnavailable: purchase && !review ? 'verified_delivery_details_required' : null });
    } catch {
        // Never log the buyer's email, private receipt or Stripe response.
        return json({ error: 'Order confirmation is temporarily unavailable.' }, 503);
    }
}
