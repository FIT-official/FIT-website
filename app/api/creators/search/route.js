import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { clerkClient } from "@clerk/nextjs/server";

const isLikelyClerkUserId = (value) => typeof value === 'string' && /^user_[a-zA-Z0-9]+$/.test(value);

// Search creators by simple text query. We treat users with metadata.role === "Creator"
// or non-empty creatorProducts as creators. Enriches results with Clerk profile data.
export async function GET(request) {
    try {
        await connectToDatabase();

        const { searchParams } = new URL(request.url);
        const q = (searchParams.get("q") || "").trim();
        const limit = Math.min(Number(searchParams.get("limit")) || 20, 50);

        const baseFilter = {
            // A "creator" is a subscribed/admin user who has set a shop display name,
            // or an existing creator with products/role.
            $or: [
                { "metadata.role": "Creator" },
                { creatorProducts: { $exists: true, $not: { $size: 0 } } },
                { "metadata.displayName": { $exists: true, $type: "string", $ne: "" } },
            ],
        };

        let filter = { ...baseFilter };

        if (q) {
            const nameOnly = {
                $or: [
                    { "metadata.displayName": { $regex: q, $options: "i" } },
                ],
            };
            filter = { $and: [baseFilter, nameOnly] };
        }

        const creators = await User.find(filter)
            .sort({ "creatorProducts.length": -1 })
            .limit(limit)
            .lean();

        // Fetch Clerk profiles for all creator user IDs
        const client = await clerkClient();
        const profileCache = {};

        for (const u of creators) {
            if (u.userId && !profileCache[u.userId]) {
                try {
                    profileCache[u.userId] = await client.users.getUser(u.userId);
                } catch (e) {
                    profileCache[u.userId] = null;
                }
            }
        }

        const result = creators.map((u) => {
            const profile = profileCache[u.userId];
            const raw = (typeof u.metadata?.displayName === 'string') ? u.metadata.displayName.trim() : '';
            const displayName = raw && !isLikelyClerkUserId(raw) ? raw : 'Unnamed Store';
            const imageUrl = profile?.imageUrl || null;

            return {
                id: u.userId,
                displayName,
                imageUrl,
                role: u.metadata?.role || "Creator",
                hasProducts: Array.isArray(u.creatorProducts) && u.creatorProducts.length > 0,
            };
        });

        return NextResponse.json({ creators: result });
    } catch (error) {
        console.error("Error searching creators:", error);
        return NextResponse.json({ error: "Failed to search creators" }, { status: 500 });
    }
}
