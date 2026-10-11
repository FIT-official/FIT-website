import { notificationConfiguration } from '@/lib/business/server'
import { captureChat } from '@/lib/business/server'
import { NextResponse } from "next/server";
import { getStreamServerClient } from "@/lib/streamChat";
import { connectToDatabase } from "@/lib/db";
import ChannelSummary from "@/models/ChannelSummary";
import { clerkClient } from "@clerk/nextjs/server";
import { sendEmail } from "@/lib/email";
import { buildNewChatMessageEmail } from "@/lib/email/templates/chat";

/**
 * Best-effort: email every channel member except the sender that they have a
 * new chat message. Resolves emails/names via Clerk. Never throws — chat
 * delivery already succeeded; the email is a courtesy.
 */
async function emailRecipientsOfNewMessage({ members, message }) {
    try {
        const senderId = message?.user?.id || message?.user_id || null;
        const recipientIds = (members || [])
            .map((m) => m.user_id)
            .filter((id) => id && id !== senderId);
        if (recipientIds.length === 0) return;

        const clerk = await clerkClient();

        // Sender display name (fall back to the webhook's embedded user).
        let senderName =
            message?.user?.name || message?.user?.username || null;

        const sendOne = async (id) => {
            try {
                const u = await clerk.users.getUser(id);
                const to = u?.emailAddresses?.[0]?.emailAddress;
                if (!to) return;
                if (notificationConfiguration().enabled && to.toLowerCase() === notificationConfiguration().ownerEmail) return;
                if (!senderName && senderId) {
                    try {
                        const s = await clerk.users.getUser(senderId);
                        senderName = s?.firstName || s?.username || "someone";
                    } catch {
                        senderName = "someone";
                    }
                }
                const { subject, html } = buildNewChatMessageEmail({
                    senderName: senderName || "someone",
                    messageText: message?.text,
                });
                await sendEmail({ to, subject, html });
            } catch (e) {
                console.error("[stream webhook] failed to email recipient", id, e);
            }
        };

        await Promise.all(recipientIds.map(sendOne));
    } catch (e) {
        console.error("[stream webhook] new-message email notification failed", e);
    }
}

export async function POST(req) {
    try {
        const signature = req.headers.get("x-signature");
        const body = await req.text();

        const client = getStreamServerClient();

        try {
            // Verify webhook using Stream server client; this will throw if invalid
            if (!signature || client.verifyWebhook(body, signature) !== true) throw new Error('Invalid signature');
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
                console.warn("Stream webhook missing channel id");
                return NextResponse.json({ received: true });
            }

            const kind = channel?.data?.kind || "support";

            // Build participant list from channel members. Fall back through
            // several possible locations to be resilient to webhook config.
            const rawMembers =
                (channel.state && channel.state.members) ||
                channel.members ||
                event.members ||
                {};

            const members = Array.isArray(rawMembers)
                ? rawMembers
                : Object.values(rawMembers || {});
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

            // Capture after verified provider acceptance. A failed durable capture returns
            // 500 so Stream can retry; owner queue keys prevent duplicate alerts.
            await captureChat(event);

            // Email the other participant(s) on a brand-new message so personal
            // messages aren't missed. Updates don't re-notify.
            if (type === "message.new" && last) {
                await emailRecipientsOfNewMessage({ members, message: last });
            }
        }

        return NextResponse.json({ received: true });
    } catch (err) {
        console.error("Error handling Stream webhook", err?.name);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
