import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { auth, clerkClient } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { isAddressComplete, pickAddressFields } from "@/lib/checkoutAddressGate";

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
        const { address: rawAddress } = await req.json();
        // Unit number and state are optional; only the known keys are stored.
        const address = pickAddressFields(rawAddress);
        if (!rawAddress || !isAddressComplete(address)) {
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
                    ...(address.state ? { state: address.state } : {}),
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