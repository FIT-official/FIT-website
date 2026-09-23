import CreatorQuota from '@/models/CreatorQuota'
import Product from '@/models/Product'
import CustomPrintRequest from '@/models/CustomPrintRequest'
import FabricationRequest from '@/models/FabricationRequest'
import { connectToDatabase } from '@/lib/db'
import { getCreatorEntitlements } from '@/lib/creatorEntitlements'

export class CreatorQuotaError extends Error {
  constructor(kind, limit) {
    super(kind === 'products'
      ? `Your plan allows ${limit} products. Remove a product or change your plan to add another.`
      : `This store has reached its ${limit} print requests for this month. Please contact the store directly.`)
    this.name = 'CreatorQuotaError'
    this.status = 409
  }
}

export function quotaPeriod(now = new Date()) {
  return {
    key: now.toISOString().slice(0, 7),
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  }
}

export async function releaseProductQuota(userId) {
  await CreatorQuota.updateOne({ _id: `${userId}:products`, used: { $gt: 0 } }, { $inc: { used: -1 } })
}

export async function reserveCreatorQuota(userId, kind, now = new Date()) {
  if (!['products', 'monthlyPrintRequests'].includes(kind)) throw new Error('Unknown creator quota')
  const entitlements = await getCreatorEntitlements(userId)
  if (entitlements.isAdmin || (entitlements.plan.id === 'legacy' && entitlements.plan.legacy === true)) {
    return { release: async () => {} }
  }
  const limit = entitlements.plan.limits[kind]
  await connectToDatabase()
  const period = quotaPeriod(now)
  const key = `${userId}:${kind === 'products' ? 'products' : `requests:${period.key}`}`
  const existing = await CreatorQuota.findById(key).lean()
  if (!existing) {
    const initial = kind === 'products'
      ? await Product.countDocuments({ creatorUserId: userId })
      : (await Promise.all([
        CustomPrintRequest.countDocuments({ creatorUserId: userId, createdAt: { $gte: period.start, $lt: period.end } }),
        FabricationRequest.countDocuments({ creatorUserId: userId, createdAt: { $gte: period.start, $lt: period.end } }),
      ])).reduce((sum, count) => sum + count, 0)
    try {
      await CreatorQuota.updateOne({ _id: key }, { $setOnInsert: { used: initial } }, { upsert: true })
    } catch (error) {
      // A simultaneous first request may win initialization. It owns the same
      // unique document; continue with the shared atomic reservation below.
      if (error?.code !== 11000) throw error
    }
  }
  const reserved = await CreatorQuota.findOneAndUpdate(
    { _id: key, used: { $lt: limit } },
    { $inc: { used: 1 } },
    { new: true },
  )
  if (!reserved) throw new CreatorQuotaError(kind, limit)
  let released = false
  return {
    async release() {
      if (released) return
      released = true
      await CreatorQuota.updateOne({ _id: key, used: { $gt: 0 } }, { $inc: { used: -1 } })
    },
  }
}
