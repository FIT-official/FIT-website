import { NextResponse } from "next/server";
import { authenticate } from "@/lib/authenticate";
import { getStreamServerClient } from "@/lib/streamChat";
import { connectToDatabase } from "@/lib/db";
import ChannelSummary from "@/models/ChannelSummary";


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
        // create or re-use a deterministic channel for this member set.
        const members = Array.from(new Set([userId, otherUserId].filter(Boolean)));
        const sortedMembers = [...members].sort();

        // First, try to find an existing channel for this member set and kind
        let existingChannels = [];
        try {
            existingChannels = await serverClient.queryChannels(
                {
                    type: "messaging",
                    members: { $eq: sortedMembers },
                    kind,
                },
                { last_message_at: -1 },
                { limit: 1 }
            );
        } catch (e) {
            console.error("Error querying existing chat channel", e);
        }

        let channel;
        const isNewChannel = existingChannels.length === 0;

        if (!isNewChannel) {
            channel = existingChannels[0];
        } else {
            channel = serverClient.channel("messaging", undefined, {
                members,
                kind,
                created_by_id: userId,
            });

            await channel.create();
        }

        // Ensure a ChannelSummary exists so both participants see this
        // conversation in their inbox/launcher even before webhooks run.
        try {
            await connectToDatabase();

            const memberIds = sortedMembers;

            // Store all channel members in participants. The inbox API will
            // filter out the current user and enrich the remaining entries
            // with Clerk profiles (name, avatar, etc.).
            const participants = sortedMembers.map((id) => ({
                id,
                name: undefined,
                imageUrl: undefined,
            }));

            await ChannelSummary.findOneAndUpdate(
                { channelId: channel.id },
                {
                    channelId: channel.id,
                    kind,
                    participants,
                    memberIds,
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
        } catch (e) {
            console.error("Failed to upsert ChannelSummary from /api/chat/channel", e);
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
