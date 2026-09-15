import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import Product from "@/models/Product";
import { escapeRegex, sanitizeDisplayName } from "@/lib/creatorPage/resolveCreator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public creator directory (/creators). Lists users who have a shop
// subdocument and have not unpublished their page, with a visible-product
// count. Public-safe projection only; never widen it to carts/orders/contact.
const PAGE_SIZE = 20;
const MAX_QUERY = 60;

const PROJECTION = {
    _id: 0,
    userId: 1,
    "metadata.displayName": 1,
    "shop.logoImage": 1,
    "shop.bannerImage": 1,
    "shop.description": 1,
    "shop.accentColor": 1,
};

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const q = String(searchParams.get("q") || "").trim().slice(0, MAX_QUERY);
        const pageRaw = Number(searchParams.get("page") || 1);
        const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;

        await connectToDatabase();

        const filter = {
            shop: { $exists: true, $ne: null },
            "shop.published": { $ne: false },
            "metadata.displayName": { $exists: true, $type: "string", $ne: "" },
        };
        if (q) {
            filter["metadata.displayName"] = {
                ...filter["metadata.displayName"],
                $regex: escapeRegex(q),
                $options: "i",
            };
        }

        const users = await User.find(filter, PROJECTION).lean();
        const ids = users.map((u) => u.userId).filter(Boolean);

        const counts = new Map();
        if (ids.length > 0) {
            const rows = await Product.aggregate([
                {
                    $match: {
                        creatorUserId: { $in: ids },
                        hidden: { $ne: true },
                        flaggedForModeration: { $ne: true },
                    },
                },
                { $group: { _id: "$creatorUserId", count: { $sum: 1 } } },
            ]);
            for (const row of rows || []) counts.set(row._id, row.count);
        }

        const creators = users
            .map((u) => {
                const displayName = sanitizeDisplayName(u?.metadata?.displayName, "Unnamed Store");
                const shop = u.shop || {};
                return {
                    userId: u.userId,
                    displayName,
                    // Display names are unique per the display-name route, so
                    // they double as the pretty slug; userId is the fallback.
                    slug: displayName !== "Unnamed Store" ? displayName : u.userId,
                    logoImage: typeof shop.logoImage === "string" ? shop.logoImage : "",
                    bannerImage: typeof shop.bannerImage === "string" ? shop.bannerImage : "",
                    description: typeof shop.description === "string" ? shop.description.slice(0, 160) : "",
                    accentColor:
                        typeof shop.accentColor === "string" && /^#[0-9a-fA-F]{6}$/.test(shop.accentColor)
                            ? shop.accentColor
                            : "",
                    productCount: counts.get(u.userId) || 0,
                };
            })
            .sort((a, b) => b.productCount - a.productCount || a.displayName.localeCompare(b.displayName));

        const total = creators.length;
        const start = (page - 1) * PAGE_SIZE;
        const pageItems = creators.slice(start, start + PAGE_SIZE);

        return NextResponse.json({
            creators: pageItems,
            page,
            pageSize: PAGE_SIZE,
            total,
            hasMore: start + PAGE_SIZE < total,
        });
    } catch (error) {
        console.error("Error listing creators:", error);
        return NextResponse.json({ error: "Failed to list creators" }, { status: 500 });
    }
}
