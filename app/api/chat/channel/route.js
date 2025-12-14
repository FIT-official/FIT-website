import { NextResponse } from "next/server";
import { authenticate } from "@/lib/authenticate";
import { getStreamServerClient } from "@/lib/streamChat";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";


export async function POST(request) {
    try {
        const { userId } = await authenticate(request);

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { targetUserId, kind = "support" } = body || {};

        if (!targetUserId && kind !== "support") {
            return NextResponse.json({ error: "targetUserId is required for non-support chats" }, { status: 400 });
        }

        const serverClient = getStreamServerClient();

        const supportUserId = process.env.STREAM_SUPPORT_USER_ID || "support";
        const otherUserId = kind === "support" ? supportUserId : targetUserId;

        // Prevent creating a creator chat with yourself
        if (kind === "creator" && otherUserId === userId) {
            return NextResponse.json({ error: "You cannot create a chat with yourself" }, { status: 400 });
        }

        // Ensure the counterpart user exists in Stream before creating the channel
        if (kind === "support") {
            await serverClient.upsertUsers([
                {
                    id: otherUserId,
                    name: "Support",
                },
            ]);
        } else if (otherUserId) {
            // Minimal upsert for creator or other target users; you can
            // enrich this later with display names or avatars.
            await serverClient.upsertUsers([
                {
                    id: otherUserId,
                },
            ]);
        }

        // Deduplicate members in case of misconfiguration and let Stream
        // create a deterministic channel for this member set.
        // When using server-side auth, we must provide created_by/created_by_id.
        const members = Array.from(new Set([userId, otherUserId].filter(Boolean)));

        const channel = serverClient.channel("messaging", undefined, {
            members,
            kind,
            created_by_id: userId,
        });

        await channel.create();

        // If this is a creator DM initiated by a customer, send creator auto-reply if configured
        if (kind === "creator" && otherUserId && otherUserId !== userId) {
            try {
                await connectToDatabase();
                const creator = await User.findOne({ userId: otherUserId }).lean();
                const autoReply = creator?.metadata?.autoReplyMessage;
                if (autoReply && autoReply.trim().length > 0) {
                    await channel.sendMessage({
                        text: autoReply,
                        user_id: otherUserId,
                    });
                }
            } catch (e) {
                console.error("Failed to send creator auto-reply", e);
            }
        }

        return NextResponse.json({
            channelId: channel.id,
            type: channel.type,
            kind,
            targetUserId: otherUserId,
        });
    } catch (error) {
        console.error("Error creating chat channel:", error);
        return NextResponse.json({ error: "Failed to create chat channel" }, { status: 500 });
    }
}
