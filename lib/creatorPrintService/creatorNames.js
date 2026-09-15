/**
 * Batch lookup of creator display names for a set of creatorUserIds, used to
 * label "Handled by <creator>" on customer and admin print-request lists.
 * Missing/blank names fall back to 'Creator' so callers never render a userId.
 */
import { connectToDatabase } from '@/lib/db'
import User from '@/models/User'
import { sanitizeDisplayName } from '@/lib/creatorPage/resolveCreator'

/**
 * @param {Iterable<string|null|undefined>} userIds
 * @returns {Promise<Record<string, string>>} userId -> display name
 */
export async function creatorDisplayNames(userIds) {
    const ids = Array.from(new Set(Array.from(userIds || []).filter((id) => typeof id === 'string' && id)))
    if (ids.length === 0) return {}
    await connectToDatabase()
    const docs = await User.find({ userId: { $in: ids } }, { userId: 1, 'metadata.displayName': 1, _id: 0 }).lean()
    const out = {}
    for (const id of ids) out[id] = 'Creator'
    for (const doc of docs || []) {
        if (doc?.userId) out[doc.userId] = sanitizeDisplayName(doc.metadata?.displayName, 'Creator')
    }
    return out
}

/** Attach `creatorDisplayName` to every request that has a creatorUserId. */
export async function withCreatorDisplayNames(requests) {
    const list = Array.isArray(requests) ? requests : []
    const names = await creatorDisplayNames(list.map((r) => r?.creatorUserId))
    return list.map((r) =>
        r?.creatorUserId ? { ...r, creatorDisplayName: names[r.creatorUserId] || 'Creator' } : r,
    )
}
