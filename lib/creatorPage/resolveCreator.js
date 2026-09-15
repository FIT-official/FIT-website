/**
 * Resolve a /creators/[id] slug to a creator: the slug is either a Clerk
 * userId or (case-insensitively) the creator's `metadata.displayName`. Same
 * rules as app/creators/[id]/page.jsx. Public-safe projection only — never
 * widen it to carts/orders/contact details.
 *
 * Shared between the creator page and /api/creators/[id]/* routes.
 */
import { connectToDatabase } from '@/lib/db'
import User from '@/models/User'

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const isLikelyClerkUserId = (value) => typeof value === 'string' && /^user_[a-zA-Z0-9]+$/.test(value)

export function normalizeCreatorSlug(slug) {
    if (slug == null) return ''
    let decoded = String(slug)
    try {
        decoded = decodeURIComponent(decoded)
    } catch {
        // keep the raw slug
    }
    return decoded.trim().replace(/\s+/g, ' ')
}

export function sanitizeDisplayName(value, fallback = 'Unnamed Store') {
    if (typeof value !== 'string') return fallback
    const trimmed = value.trim()
    if (!trimmed) return fallback
    if (isLikelyClerkUserId(trimmed)) return fallback
    return trimmed
}

/**
 * @param {string} slug - userId or displayName (URL-encoded allowed)
 * @returns {Promise<{ userId: string, displayName: string, shop: object } | null>}
 */
export async function resolveCreatorByIdOrName(slug) {
    const normalized = normalizeCreatorSlug(slug)
    if (!normalized) return null

    await connectToDatabase()
    const projection = { 'metadata.displayName': 1, 'metadata.role': 1, userId: 1, shop: 1, _id: 0 }
    const byUserId = await User.findOne({ userId: normalized }, projection).lean()
    const doc =
        byUserId ||
        (await User.findOne(
            { 'metadata.displayName': { $regex: `^${escapeRegex(normalized)}$`, $options: 'i' } },
            projection,
        ).lean())
    if (!doc?.userId) return null

    return {
        userId: doc.userId,
        displayName: sanitizeDisplayName(doc.metadata?.displayName),
        shop: doc.shop || {},
    }
}
