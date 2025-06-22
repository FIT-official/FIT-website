import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { auth } from "@clerk/nextjs/server";

export async function GET(req) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        await connectToDatabase();
        const user = await User.findOne({ userId });
        if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
        return NextResponse.json({ phone: user.contact?.phone || null }, { status: 200 });
    } catch (err) {
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const { phone } = await req.json();
        if (
            !phone ||
            !phone.number ||
            !phone.countryCode
        ) {
            return NextResponse.json({ error: "Missing phone fields" }, { status: 400 });
        }
        await connectToDatabase();
        const user = await User.findOneAndUpdate(
            { userId },
            { $set: { "contact.phone": phone } },
            { new: true, upsert: true }
        );
        return NextResponse.json({ success: true, phone: user.contact.phone }, { status: 200 });
    } catch (err) {
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}