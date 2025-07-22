import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { auth } from "@clerk/nextjs/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-05-28.basil",
});

export async function GET(
    request,
    { params }
) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const awaitedParams = await params;

    const sessionId = awaitedParams.sessionId;
    if (!sessionId) return NextResponse.json({ error: "Invalid Session ID" }, { status: 400 });
        
    try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        return NextResponse.json({ session }, { status: 200 });
    } catch (error) {
        console.error("Error retrieving Stripe session:", error);
        return NextResponse.json(
            { error: "Failed to retrieve session" },
            { status: 500 }
        );
    }
}
