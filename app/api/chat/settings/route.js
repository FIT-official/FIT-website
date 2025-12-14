import { NextResponse } from "next/server";
import { authenticate } from "@/lib/authenticate";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";

export async function GET(request) {
    try {
        const { userId } = await authenticate(request);
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectToDatabase();
        const user = await User.findOne({ userId }).lean();
        const autoReplyMessage = user?.metadata?.autoReplyMessage || "";

        return NextResponse.json({ autoReplyMessage });
    } catch (error) {
        console.error("Error loading chat settings:", error);
        return NextResponse.json({ error: "Failed to load chat settings" }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const { userId } = await authenticate(request);
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { autoReplyMessage } = body || {};

        await connectToDatabase();

        await User.findOneAndUpdate(
            { userId },
            { $set: { "metadata.autoReplyMessage": autoReplyMessage || "" } },
            { upsert: true }
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error saving chat settings:", error);
        return NextResponse.json({ error: "Failed to save chat settings" }, { status: 500 });
    }
}
