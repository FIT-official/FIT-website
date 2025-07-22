import { NextResponse } from "next/server";
import Stripe from "stripe";
import DigitalProductTransaction from "@/models/DigitalProductTransaction";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
    const sig = req.headers.get("stripe-signature");
    const body = await req.text();

    let event;

    try {
        event = stripe.webhooks.constructEvent(
            body,
            sig,
            process.env.STRIPE_DIGITAL_TRANSACTION_SIGNING_SECRET
        );
    } catch (err) {
        console.error("Webhook signature verification failed:", err.message);
        return NextResponse.json({ error: "Webhook Error" }, { status: 400 });
    }

    if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const sessionId = session.id;
        const metadata = session.metadata;

        if (!metadata?.salesData) {
            console.warn("No salesData in session metadata.");
            return NextResponse.json({ received: true });
        }

        let digitalProductData;
        try {
            digitalProductData = JSON.parse(metadata.digitalProductData); // { buyer: userId, productId: item.productId }
        } catch (e) {
            console.error("Failed to parse digitalProductData:", e);
            return NextResponse.json({ error: "Invalid digitalProductData" }, { status: 400 });
        }

        for (const [productId, { buyer, links }] of Object.entries(digitalProductData)) {
            try {
                await DigitalProductTransaction.create({
                    userId: buyer,
                    productId,
                    sessionId,
                    status: "completed",
                    assets: Array.isArray(links) ? links : [],
                });
            } catch (error) {
                console.error("Error creating digital product transaction:", buyer, error);
            }
        }
    }

    return NextResponse.json({ received: true });
}