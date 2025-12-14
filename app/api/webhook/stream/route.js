import { NextResponse } from "next/server";
import { getStreamServerClient } from "@/lib/streamChat";
import { connectToDatabase } from "@/lib/db";
import ChannelSummary from "@/models/ChannelSummary";

export async function POST(req) {
    try {
        const signature = req.headers.get("x-signature");
        const body = await req.text();

        const client = getStreamServerClient();

        try {
            // Verify webhook using Stream server client; this will throw if invalid
            client.verifyWebhook(body, signature);
        } catch (err) {
            console.error("Invalid Stream webhook signature", err);
            return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
        }

        const event = JSON.parse(body || "{}");

        // Only process messaging channel events we care about
        const type = event.type;

        if (type === "message.new" || type === "message.updated") {
            await connectToDatabase();

            const channel = event.channel || {};
            const channelId = channel.id || event.cid?.split(":")[1];
            if (!channelId) {
                console.warn("Stream webhook missing channel id", event);
                return NextResponse.json({ received: true });
            }

            const kind = channel?.data?.kind || "support";

            // Build participant list from channel members
            const members = Object.values(channel.state?.members || {});
            const participants = members.map((m) => ({
                id: m.user_id,
                name:
                    m.user?.name ||
                    m.user?.id ||
                    m.user?.username ||
                    m.user?.email ||
                    m.user_id,
                imageUrl: m.user?.image || null,
            }));

            const memberIds = members.map((m) => m.user_id).filter(Boolean);

            const last = event.message || null;

            const lastMessage = last
                ? {
                      id: last.id,
                      text: last.text,
                      createdAt: last.created_at ? new Date(last.created_at) : new Date(),
                      userId: last.user?.id || last.user_id || null,
                  }
                : undefined;

            await ChannelSummary.findOneAndUpdate(
                { channelId },
                {
                    channelId,
                    kind,
                    participants,
                    memberIds,
                    ...(lastMessage ? { lastMessage } : {}),
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
        }

        return NextResponse.json({ received: true });
    } catch (err) {
        console.error("Error handling Stream webhook", err);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
