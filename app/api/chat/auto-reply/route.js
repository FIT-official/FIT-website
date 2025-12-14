import { NextResponse } from "next/server";
import { authenticate } from "@/lib/authenticate";
import { getStreamServerClient } from "@/lib/streamChat";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import ChannelSummary from "@/models/ChannelSummary";

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

        const serverClient = getStreamServerClient();

        // Look up the messaging channel for this id
        const channels = await serverClient.queryChannels(
            { type: "messaging", id: channelId },
            {},
            { limit: 1 }
        );

        if (!channels || channels.length === 0) {
            return NextResponse.json({ error: "Channel not found" }, { status: 404 });
        }

        const channel = channels[0];

        // Determine the other member in this DM
        const rawMembers =
            (channel.state && channel.state.members) ||
            channel.members ||
            {};

        const membersArray = Array.isArray(rawMembers)
            ? rawMembers
            : Object.values(rawMembers || {});

        const otherMember = membersArray.find(
            (m) => m && m.user_id && m.user_id !== userId
        );

        if (!otherMember) {
            return NextResponse.json({ success: true });
        }

        const otherUserId = otherMember.user_id;

        await connectToDatabase();

        // Upsert a ChannelSummary so both participants see this DM in their inbox
        // even if webhooks are not configured.
        try {
            const members = membersArray.filter(Boolean);
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

            const msgs = channel.state?.messages || [];
            const last = msgs.length ? msgs[msgs.length - 1] : null;

            const kind = channel.data?.kind || "support";

            const lastMessage = last
                ? {
                      id: last.id,
                      text: last.text,
                      createdAt: last.created_at ? new Date(last.created_at) : new Date(),
                      userId: last.user?.id || last.user_id || null,
                  }
                : undefined;

            await ChannelSummary.findOneAndUpdate(
                { channelId: channel.id },
                {
                    channelId: channel.id,
                    kind,
                    participants,
                    memberIds,
                    ...(lastMessage ? { lastMessage } : {}),
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
        } catch (err) {
            console.error("Failed to upsert ChannelSummary from /api/chat/auto-reply", err);
        }

        // Now check whether this creator has an auto-reply configured.
        const creator = await User.findOne({ userId: otherUserId }).lean();
        const autoReply = creator?.metadata?.autoReplyMessage;

        if (!autoReply || !autoReply.trim()) {
            return NextResponse.json({ success: true });
        }

        // Send the auto-reply from the creator account into this channel.
        await channel.sendMessage({
            text: autoReply,
            user_id: otherUserId,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error sending chat auto-reply:", error);
        return NextResponse.json({ error: "Failed to send auto-reply" }, { status: 500 });
    }
}
