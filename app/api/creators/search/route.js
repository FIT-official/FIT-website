import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";

// Search creators by simple text query. We treat users with metadata.role === "Creator"
// or non-empty creatorProducts as creators. This avoids checking Stripe/Clerk on each request.
export async function GET(request) {
    try {
        await connectToDatabase();

        const { searchParams } = new URL(request.url);
        const q = (searchParams.get("q") || "").trim();
        const limit = Math.min(Number(searchParams.get("limit")) || 3, 20);

        const baseFilter = {
            $or: [
                { "metadata.role": "Creator" },
                { creatorProducts: { $exists: true, $not: { $size: 0 } } },
            ],
        };

        let filter = { ...baseFilter };

        if (q) {
            const nameOrId = {
                $or: [
                    { userId: { $regex: q, $options: "i" } },
                    { "metadata.displayName": { $regex: q, $options: "i" } },
                ],
            };
            filter = { $and: [baseFilter, nameOrId] };
        }

        const creators = await User.find(filter)
            .sort({ "creatorProducts.length": -1 })
            .limit(limit)
            .lean();

        const result = creators.map((u) => ({
            id: u.userId,
            // Fallbacks until you add richer profile fields
            displayName: u.metadata?.displayName || u.metadata?.role || "Creator",
            role: u.metadata?.role || "Creator",
            hasProducts: Array.isArray(u.creatorProducts) && u.creatorProducts.length > 0,
        }));

        return NextResponse.json({ creators: result });
    } catch (error) {
        console.error("Error searching creators:", error);
        return NextResponse.json({ error: "Failed to search creators" }, { status: 500 });
    }
}
