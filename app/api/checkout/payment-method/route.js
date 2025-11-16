import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-05-28.basil",
});

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const sessionId = searchParams.get('sessionId');

        if (!sessionId) {
            return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
        }

        // Retrieve the checkout session from Stripe
        const session = await stripe.checkout.sessions.retrieve(sessionId, {
            expand: ['payment_intent.payment_method', 'customer']
        });

        let paymentMethod = null;
        let customerDetails = null;

        // Extract payment method details
        if (session.payment_intent?.payment_method) {
            const pm = session.payment_intent.payment_method;
            paymentMethod = {
                type: pm.type,
                card: pm.card ? {
                    brand: pm.card.brand,
                    last4: pm.card.last4,
                    exp_month: pm.card.exp_month,
                    exp_year: pm.card.exp_year
                } : null
            };
        }

        // Extract customer details
        if (session.customer_details) {
            customerDetails = {
                name: session.customer_details.name,
                email: session.customer_details.email,
                phone: session.customer_details.phone,
                address: session.customer_details.address
            };
        }

        return NextResponse.json({
            paymentMethod,
            customerDetails
        }, { status: 200 });

    } catch (error) {
        console.error("Error fetching payment method:", error);
        return NextResponse.json({
            error: "Failed to fetch payment method: " + error.message
        }, { status: 500 });
    }
}
