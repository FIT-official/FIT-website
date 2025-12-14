import { NextResponse } from "next/server";
import { authenticate } from "@/lib/authenticate";
import { connectToDatabase } from "@/lib/db";
import ChatReadState from "@/models/ChatReadState";

export async function POST(request) {
    try {
        const { userId } = await authenticate(request);
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { channelId } = body || {};
        if (!channelId) {
            return NextResponse.json({ error: "channelId is required" }, { status: 400 });
        }

        await connectToDatabase();

        await ChatReadState.findOneAndUpdate(
            { userId, channelId },
            { $set: { lastReadAt: new Date() } },
            { upsert: true, new: true }
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error marking chat as read:", error);
        return NextResponse.json({ error: "Failed to mark chat as read" }, { status: 500 });
    }
}
