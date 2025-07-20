import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
    try {
        const { stripeAccountId } = await req.json();

        if (!stripeAccountId) {
            return NextResponse.json({ error: "Missing stripeAccountId" }, { status: 400 });
        }

        const origin = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

        const accountLink = await stripe.accountLinks.create({
            account: stripeAccountId,
            refresh_url: `${origin}/dashboard?onboard=refresh`,
            return_url: `${origin}/dashboard?onboard=return`,
            type: "account_onboarding",
        });

        return NextResponse.json({ url: accountLink.url });
    } catch (error) {
        console.error("Stripe Express onboarding error:", error);
        return NextResponse.json({ error: "Failed to create onboarding link" }, { status: 500 });
    }
}

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const stripeAccountId = searchParams.get("stripeAccountId");
    if (!stripeAccountId) {
        return NextResponse.json({ error: "Missing stripeAccountId" }, { status: 400 });
    }
    try {
        const account = await stripe.accounts.retrieve(stripeAccountId);
        return NextResponse.json({ onboarded: !!account.details_submitted });
    } catch (error) {
        return NextResponse.json({ error: "Failed to check onboarding status" }, { status: 500 });
    }
}