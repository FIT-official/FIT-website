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
            process.env.STRIPE_DELETE_SUBSCRIPTION_SIGNING_SECRET
        );
    } catch (err) {
        console.error("Webhook signature verification failed:", err.message);
        return NextResponse.json({ error: "Webhook Error" }, { status: 400 });
    }

    if (event.type === "customer.subscription.deleted") {
        const subscription = event.data.object;
        const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
        const client = await clerkClient();

        // Find the Clerk user by the Stripe ids stored at signup, never by a
        // fuzzy email search (which could de-provision the wrong account).
        let target = null;
        let customerEmail = null;
        try {
            const customer = await stripe.customers.retrieve(customerId);
            customerEmail = customer?.deleted ? null : customer?.email || null;
        } catch (err) {
            console.error("Failed to retrieve Stripe customer:", err.message);
        }
        if (customerEmail) {
            const { data } = await client.users.getUserList({ emailAddress: [customerEmail], limit: 50 });
            target = (data || []).find(u =>
                u.publicMetadata?.stripeSubscriptionId === subscription.id ||
                u.publicMetadata?.stripeCustomerId === customerId
            ) || null;
        }

        if (!target) {
            console.error("No Clerk user matches subscription", subscription.id, "customer", customerId);
            // 200 so Stripe stops retrying; nothing to revoke.
            return NextResponse.json({ received: true, matched: false });
        }

        await client.users.updateUser(target.id, {
            publicMetadata: { ...target.publicMetadata, stripeSubscriptionId: "" },
            unsafeMetadata: { ...target.unsafeMetadata, priceId: "" }
        });
    }

    return NextResponse.json({ received: true });
}