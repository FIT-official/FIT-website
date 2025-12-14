#!/usr/bin/env node

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment from .env.local so Mongo/Stream config match Next.js
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

async function run() {
    console.log("Starting ChannelSummary backfill from Stream...");

    const { connectToDatabase } = await import("../lib/db.js");
    const { default: ChannelSummary } = await import("../models/ChannelSummary.js");
    const { getStreamServerClient } = await import("../lib/streamChat.js");

    await connectToDatabase();
    const client = getStreamServerClient();

    const limit = 50;
    let offset = 0;
    let processed = 0;

    // Page through all messaging channels and upsert ChannelSummary docs
    // This is intended as a one-off helper after enabling the webhook.
    // You can re-run it safely; it uses upserts.
    // eslint-disable-next-line no-constant-condition
    while (true) {
        console.log(`Querying channels with offset=${offset}, limit=${limit}...`);
        const channels = await client.queryChannels(
            { type: "messaging" },
            { last_message_at: -1 },
            { limit, offset }
        );

        if (!channels.length) {
            break;
        }

        for (const ch of channels) {
            const channelId = ch.id;
            const kind = ch.data?.kind || "support";

            const members = Object.values(ch.state.members || {});
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

            const msgs = ch.state.messages || [];
            const last = msgs.length ? msgs[msgs.length - 1] : null;

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

            processed += 1;
        }

        offset += channels.length;
    }

    console.log(`Backfill complete. Upserted summaries for ${processed} channels.`);
    process.exit(0);
}

run().catch((err) => {
    console.error("ChannelSummary backfill failed:", err);
    process.exit(1);
});
