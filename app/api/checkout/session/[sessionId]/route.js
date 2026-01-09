import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-05-28.basil",
});

export async function GET(
    request,
    { params }
) {
    const awaitedParams = await params;

    const sessionId = awaitedParams.sessionId;
    if (!sessionId) return NextResponse.json({ error: "Invalid Session ID" }, { status: 400 });
        
    try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        // Return only what the client needs for the return page
        return NextResponse.json({
            session: {
                id: session.id,
                status: session.status,
                customer_details: session.customer_details ? { email: session.customer_details.email } : null,
            }
        }, { status: 200 });
    } catch (error) {
        console.error("Error retrieving Stripe session:", error);
        return NextResponse.json(
            { error: "Failed to retrieve session" },
            { status: 500 }
        );
    }
}
