import { createHash } from 'node:crypto'
import { connectToDatabase } from './db'
const collections = new Set(['workshopAccounts', 'workshopSessions', 'workshopLessons', 'workshopRateLimits', 'workshopClassDetails', 'workshopDrafts', 'workshopGuestSessions', 'workshopGuestLessons', 'workshopGuestRateLimits', 'workshopGuestDrafts', 'workshopTinkercadPools'])
// Only Vercel's server-owned preview environment selects isolation. Production,
// local development, cookies, and request parameters cannot select a namespace.
export function workshopCollectionPrefix(env = process.env) {
    if (env.VERCEL_ENV !== 'preview') return ''
    if (!/^[a-z0-9][a-z0-9.-]*\.vercel\.app$/i.test(env.VERCEL_URL || '')) throw Error('Preview deployment identity is unavailable.')
    return 'workshopPreview_' + createHash('sha256').update(env.VERCEL_URL.toLowerCase()).digest('hex').slice(0, 16) + '_'
}
export function scopedWorkshopDatabase(db, env = process.env) {
    const prefix = workshopCollectionPrefix(env)
    return { collection(name, options) {
        if (!collections.has(name)) throw Error('Unknown workshop collection.')
        return db.collection(prefix + name, options)
    } }
}
export async function workshopDatabase() { return scopedWorkshopDatabase((await connectToDatabase()).connection.db) }
