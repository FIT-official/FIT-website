import { NextResponse } from "next/server";
import Stripe from "stripe";

export async function GET(
    request,
    { params }
) {
    const awaitedParams = await params;

    const sessionId = awaitedParams.sessionId;
    if (!/^cs_[a-zA-Z0-9_]+$/.test(sessionId || '')) return NextResponse.json({ error: "Invalid payment link. Return to your cart." }, { status: 400 });
        
    try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-05-28.basil', timeout: 10000, maxNetworkRetries: 1 });
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        // Return only what the client needs for the return page
        return NextResponse.json({
            session: {
                id: session.id,
                status: session.status,
                payment_status: session.payment_status,
                attemptId: session.metadata?.checkoutAttemptId || null,
            }
        }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error("Error retrieving Stripe session:", error);
        return NextResponse.json(
            { error: "Unable to check payment status. Please try again before starting another payment." },
            { status: 503 }
        );
    }
}
