import { NextResponse } from "next/server";
import Stripe from "stripe";
import { clerkClient } from "@clerk/nextjs/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
    const sig = req.headers.get("stripe-signature");
    const body = await req.text();

    let event;

    try {
        event = stripe.webhooks.constructEvent(
            body,
            sig,
            process.env.STRIPE_PAYOUT_SIGNING_SECRET
        );
    } catch (err) {
        console.error("Webhook signature verification failed:", err.message);
        return NextResponse.json({ error: "Webhook Error" }, { status: 400 });
    }

    if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const metadata = session.metadata;


        if (!metadata?.salesData) {
            console.warn("No salesData in session metadata.");
            return NextResponse.json({ received: true });
        }


        let salesData;
        try {
            salesData = JSON.parse(metadata.salesData); // { creatorUserId: amountInCents }
        } catch (e) {
            console.error("Failed to parse salesData:", e);
            return NextResponse.json({ error: "Invalid salesData" }, { status: 400 });
        }

        const client = await clerkClient();

        for (const [userId, grossAmount] of Object.entries(salesData)) {
            try {
                const user = await client.users.getUser(userId);
                const stripeAccountId = user.publicMetadata?.stripeAccountId;
                if (stripeAccountId) {
                    const payoutAmount = Math.floor(grossAmount * 0.98);
                    await stripe.transfers.create({
                        amount: payoutAmount,
                        currency: "sgd",
                        destination: stripeAccountId,
                        metadata: {
                            sellerUserId: userId,
                            originalGross: grossAmount,
                            sessionId: session.id,
                        },
                    });

                    // console.log(`Transferred ${payoutAmount} to seller ${userId} (${stripeAccountId})`);
                } else {
                    console.warn(`No Stripe account ID found for user: ${userId}`);
                }
            } catch (error) {
                console.error("Error processing payout for user:", userId, error);
            }
        }
    }

    return NextResponse.json({ received: true });
}