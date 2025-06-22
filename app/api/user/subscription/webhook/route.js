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
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error("Webhook signature verification failed:", err.message);
        return NextResponse.json({ error: "Webhook Error" }, { status: 400 });
    }

    if (event.type === "customer.subscription.deleted") {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const customer = await stripe.customers.retrieve(customerId);
        const emailAddress = [customer.email];

        if (!emailAddress) {
            console.error("No email found on customer object.");
            return NextResponse.json({ error: "No email found on customer object" }, { status: 400 });
        }

        const client = await clerkClient()

        const { data, totalCount } = await client.users.getUserList({ query: emailAddress });

        if (!data) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        await client.users.updateUser(data[0].id, {
            publicMetadata: { ...data[0].publicMetadata, stripeSubscriptionId: "" },
            unsafeMetadata: { ...data[0].unsafeMetadata, priceId: "" }
        });
    }

    return NextResponse.json({ received: true });
}