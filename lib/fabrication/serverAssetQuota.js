import CreatorQuota from '@/models/CreatorQuota'
import FabricationAsset from '@/models/FabricationAsset'
import { FabricationError } from './serverHttp'

export const DAILY_FABRICATION_ASSET_LIMIT = 50

/** Reserve before storing an attachment; all concurrent uploads share one UTC day. */
export async function reserveDailyFabricationAsset(userId, now = new Date()) {
  if (typeof userId !== 'string' || !userId) throw new FabricationError('Sign in to upload an attachment.', 401)
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('A valid reservation date is required')
  const day = now.toISOString().slice(0, 10)
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const end = new Date(start.getTime() + 86400000)
  const key = `fabrication-assets:${userId}:${day}`
  const existing = await CreatorQuota.findById(key).lean()
  if (!existing) {
    const used = await FabricationAsset.countDocuments({ ownerUserId: userId, createdAt: { $gte: start, $lt: end } })
    if (!Number.isSafeInteger(used) || used < 0) throw new FabricationError('Attachment usage could not be verified.', 503, 'quota_unavailable')
    try {
      await CreatorQuota.updateOne({ _id: key }, { $setOnInsert: { used } }, { upsert: true })
    } catch (error) {
      // Another first upload can win initialization of the same unique counter.
      if (error?.code !== 11000) throw error
    }
  }
  const reserved = await CreatorQuota.findOneAndUpdate({ _id: key, used: { $lt: DAILY_FABRICATION_ASSET_LIMIT } },
    { $inc: { used: 1 } }, { new: true })
  if (!reserved) throw new FabricationError('Daily attachment limit reached. Please try again tomorrow.', 429, 'daily_asset_limit')
  let releasePromise
  return {
    release() {
      // Reuse the outcome even after a network error: retrying an uncertain
      // decrement could release another upload's reservation.
      if (!releasePromise) releasePromise = Promise.resolve().then(() => CreatorQuota.updateOne(
        { _id: key, used: { $gt: 0 } }, { $inc: { used: -1 } },
      )).then(() => undefined)
      return releasePromise
    },
  }
}
