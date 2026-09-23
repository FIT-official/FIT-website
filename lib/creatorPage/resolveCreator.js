import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";

// Shared creator lookup for the public /creators/[id] page and the public
// creator APIs (print service, directory deep links). Accepts either a Clerk
// userId or a display name (case-insensitive, whitespace-normalised) and
// returns a public-safe shape only: never carts, orders or contact details.
// Connects to the database itself (the connection is cached), so callers
// may call it directly from a route handler.

const PUBLIC_PROJECTION = { "metadata.displayName": 1, "metadata.role": 1, userId: 1, shop: 1, _id: 0 };

export const normalizeDisplayName = (value) => {
    if (typeof value !== "string") return "";
    return value.trim().replace(/\s+/g, " ");
};

export const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const isLikelyClerkUserId = (value) => typeof value === "string" && /^user_[a-zA-Z0-9]+$/.test(value);

export const sanitizeDisplayName = (value, fallback = "Unnamed Store") => {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    if (isLikelyClerkUserId(trimmed)) return fallback;
    return trimmed;
};

const decodeSlug = (slug) => {
    try {
        return decodeURIComponent(String(slug));
    } catch {
        return String(slug);
    }
};

export const normalizeCreatorSlug = (slug) => (slug == null ? "" : normalizeDisplayName(decodeSlug(slug)));

/**
 * Resolve a creator by Clerk userId first, then by display name.
 * @param {string} slug raw route segment (may be URL-encoded)
 * @returns {Promise<{ userId: string, displayName: string, role: string, shop: object } | null>}
 */
export async function resolveCreatorByIdOrName(slug) {
    if (!slug) return null;
    const normalized = normalizeDisplayName(decodeSlug(slug));
    if (!normalized) return null;

    await connectToDatabase();
    let doc = await User.findOne({ userId: normalized }, PUBLIC_PROJECTION).lean();
    if (!doc) {
        doc = await User.findOne(
            { "metadata.displayName": { $regex: `^${escapeRegex(normalized)}$`, $options: "i" } },
            PUBLIC_PROJECTION
        ).lean();
    }
    if (!doc?.userId) return null;

    return {
        userId: doc.userId,
        displayName: sanitizeDisplayName(doc?.metadata?.displayName, "Unnamed Store"),
        role: doc?.metadata?.role || "Customer",
        shop: doc?.shop || {},
    };
}
