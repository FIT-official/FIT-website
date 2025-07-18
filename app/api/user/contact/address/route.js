import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { auth, clerkClient } from "@clerk/nextjs/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function GET(req) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        await connectToDatabase();
        const user = await User.findOne({ userId });
        if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
        return NextResponse.json({ address: user.contact?.address || null }, { status: 200 });
    } catch (err) {
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const { address } = await req.json();
        if (
            !address ||
            !address.street ||
            !address.unitNumber ||
            !address.city ||
            !address.state ||
            !address.postalCode ||
            !address.country
        ) {
            return NextResponse.json({ error: "Missing address fields" }, { status: 400 });
        }
        await connectToDatabase();
        const user = await User.findOneAndUpdate(
            { userId },
            { $set: { "contact.address": address } },
            { new: true, upsert: true }
        );

        const client = await clerkClient();
        const clerkUser = await client.users.getUser(userId);
        const stripeCustomerId = clerkUser?.publicMetadata?.stripeCustomerId;

        if (stripeCustomerId) {
            await stripe.customers.update(stripeCustomerId, {
                address: {
                    line1: address.street + (address.unitNumber ? `, ${address.unitNumber}` : ""),
                    city: address.city,
                    state: address.state,
                    postal_code: address.postalCode,
                    country: address.country,
                }
            });
        }

        return NextResponse.json({ success: true, address: user.contact.address }, { status: 200 });
    } catch (err) {
        console.error("POST /api/user/contact/address error:", err);
        return NextResponse.json({ error: err?.message || "Server error", details: err }, { status: 500 });
    }
}