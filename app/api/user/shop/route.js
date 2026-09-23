import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { requireCreator } from "@/lib/requireCreator";
import { validateBlocks, THEME_MODES, THEME_FONTS, DEFAULT_THEME } from "@/lib/creatorPage/blocks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 12 blocks * (2000-char text body + 8 gallery keys) plus links/description
// fits comfortably in 64KB.
const MAX_BODY_BYTES = 64 * 1024;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
// S3 keys produced by /api/user/shop/upload: shops/<userId>/<file>. Ownership
// of the prefix is enforced in PUT so a caller can never point their shop at
// another object in the bucket.
const S3_KEY_CHARSET = /^[a-zA-Z0-9_\-/.]+$/;

const emptyShop = () => ({
    bannerImage: "",
    logoImage: "",
    description: "",
    links: [],
    featuredProductIds: [],
    accentColor: "",
    theme: { ...DEFAULT_THEME },
    blocks: [],
    published: true,
});

const imageKeySchema = z
    .string()
    .max(300)
    .refine((v) => v === "" || (S3_KEY_CHARSET.test(v) && !v.includes("..")), {
        message: "Invalid image key",
    });

const linkSchema = z
    .object({
        label: z.string().trim().min(1).max(40),
        url: z
            .string()
            .trim()
            .max(300)
            .url()
            .refine((u) => /^https?:\/\//i.test(u), { message: "Links must be http(s)" }),
    })
    .strict();

const shopUpdateSchema = z
    .object({
        bannerImage: imageKeySchema.optional(),
        logoImage: imageKeySchema.optional(),
        description: z.string().max(600).optional(),
        links: z.array(linkSchema).max(6).optional(),
        featuredProductIds: z.array(z.string().min(1).max(64)).max(8).optional(),
        accentColor: z
            .string()
            .max(7)
            .refine((v) => v === "" || HEX_COLOR.test(v), { message: "accentColor must be #rrggbb" })
            .optional(),
        theme: z
            .object({
                mode: z.enum(THEME_MODES),
                font: z.enum(THEME_FONTS),
            })
            .strict()
            .optional(),
        // Shape-checked by validateBlocks below (400 on failure), so the zod
        // layer only needs to know it is an array.
        blocks: z.array(z.unknown()).max(12).optional(),
        published: z.boolean().optional(),
    })
    .strict();

const shopResponse = (shop) => ({ ...emptyShop(), ...(shop || {}) });

export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        await connectToDatabase();
        const user = await User.findOne({ userId }, { shop: 1, _id: 0 }).lean();
        return NextResponse.json({ shop: shopResponse(user?.shop) });
    } catch (error) {
        console.error("Error reading shop settings:", error);
        return NextResponse.json({ error: "Failed to read shop settings" }, { status: 500 });
    }
}

export async function PUT(req) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!(await requireCreator(userId))) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const contentLength = Number(req.headers.get("content-length") || 0);
        if (contentLength > MAX_BODY_BYTES) {
            return NextResponse.json({ error: "Payload too large" }, { status: 413 });
        }

        let body;
        try {
            body = await req.json();
        } catch {
            return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const parsed = shopUpdateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: "Invalid input", issues: parsed.error.issues },
                { status: 422 }
            );
        }

        // Image keys must live under the caller's own upload prefix.
        const ownPrefix = `shops/${userId}/`;
        for (const field of ["bannerImage", "logoImage"]) {
            const key = parsed.data[field];
            if (key && !key.startsWith(ownPrefix)) {
                return NextResponse.json({ error: "Invalid input" }, { status: 422 });
            }
        }

        if (parsed.data.blocks !== undefined) {
            const result = validateBlocks(parsed.data.blocks);
            if (!result.ok) {
                return NextResponse.json({ error: `Invalid blocks: ${result.error}` }, { status: 400 });
            }
            for (const block of result.blocks) {
                if (block.type !== "gallery") continue;
                if (block.settings.images.some((key) => !key.startsWith(ownPrefix))) {
                    return NextResponse.json({ error: "Invalid blocks: gallery image outside your uploads" }, { status: 400 });
                }
            }
            parsed.data.blocks = result.blocks;
        }

        const $set = {};
        for (const [field, value] of Object.entries(parsed.data)) {
            $set[`shop.${field}`] = value;
        }
        if (Object.keys($set).length === 0) {
            return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
        }

        await connectToDatabase();
        const updated = await User.findOneAndUpdate(
            { userId },
            { $set, $setOnInsert: { userId } },
            { upsert: true, new: true, runValidators: true }
        ).lean();

        return NextResponse.json({ success: true, shop: shopResponse(updated?.shop) });
    } catch (error) {
        console.error("Error updating shop settings:", error);
        return NextResponse.json({ error: "Failed to update shop settings" }, { status: 500 });
    }
}
