import { NextResponse } from "next/server";
import { authenticate } from "@/lib/authenticate";
import { connectToDatabase } from "@/lib/db";
import ChatReadState from "@/models/ChatReadState";
import ChannelSummary from "@/models/ChannelSummary";
import { clerkClient } from "@clerk/nextjs/server";

export async function GET(request) {
    try {
        const { userId } = await authenticate(request);

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectToDatabase();

        // Load cached channel summaries for channels this user is a member of
        const summaries = await ChannelSummary.find({ memberIds: userId })
            .sort({ updatedAt: -1 })
            .limit(20)
            .lean();

        const channels = [];
        const client = await clerkClient();
        const profileCache = {};

        for (const summary of summaries) {
            const baseParticipants = (summary.participants || []).filter((p) => p.id !== userId);

            const participants = [];
            for (const p of baseParticipants) {
                const memberId = p.id;
                let profile = null;
                if (memberId) {
                    if (!profileCache[memberId]) {
                        try {
                            profileCache[memberId] = await client.users.getUser(memberId);
                        } catch (e) {
                            profileCache[memberId] = null;
                        }
                    }
                    profile = profileCache[memberId];
                }

                participants.push({
                    id: memberId,
                    name:
                        profile?.firstName ||
                        profile?.username ||
                        profile?.emailAddresses?.[0]?.emailAddress ||
                        p.name ||
                        memberId,
                    imageUrl: profile?.imageUrl || p.imageUrl || null,
                });
            }

            // Skip legacy/system support channels so they don't show in inbox
            const kind = summary.kind || "support";
            const isSupportSystemChannel =
                kind === "support" &&
                participants.length === 1 &&
                (participants[0].id === "support" ||
                    participants[0].name?.toLowerCase() === "support");

            if (isSupportSystemChannel) {
                continue;
            }

            // Compute unread count based on lastReadAt and lastMessage timestamp
            let unreadCount = 0;
            const readState = await ChatReadState.findOne({ userId, channelId: summary.channelId }).lean();
            const cutoff = readState?.lastReadAt ? new Date(readState.lastReadAt) : null;

            if (summary.lastMessage && summary.lastMessage.createdAt) {
                const fromOther = summary.lastMessage.userId !== userId;
                if (fromOther) {
                    if (!cutoff) {
                        unreadCount = 1;
                    } else {
                        const created = new Date(summary.lastMessage.createdAt);
                        if (created > cutoff) {
                            unreadCount = 1;
                        }
                    }
                }
            }

            channels.push({
                channelId: summary.channelId,
                kind,
                participants,
                lastMessage: summary.lastMessage || null,
                unreadCount,
            });
        }

        return NextResponse.json({ channels });
    } catch (error) {
        console.error("Error loading chat inbox:", error);
        return NextResponse.json({ error: "Failed to load chat inbox" }, { status: 500 });
    }
}
