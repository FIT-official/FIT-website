import { getCreatorEntitlements } from '@/lib/creatorEntitlements'
import { resolveCreatorByIdOrName } from '@/lib/creatorPage/resolveCreator'
import { publicFabricationCatalog } from './catalog'
import { fabricationCatalogPage } from './serverCatalog'
import { checkedCreatorId, fail } from './serverHttp'

export async function fabricationEntitlements(userId) {
  const result = await getCreatorEntitlements(userId)
  if (result.status === 'unavailable') fail('The creator subscription could not be verified. Please try again.', 503, 'subscription_unavailable')
  return { ...result, canManage: result.planId === 'pro' }
}

export async function requireFabricationPro(userId) {
  const result = await fabricationEntitlements(userId)
  if (!result.canManage) fail('An active Pro plan is required to manage fabrication services.', 403, 'pro_required')
  return result
}

export async function loadPublicFabrication(creatorId, options = {}) {
  const creator = await resolveCreatorByIdOrName(checkedCreatorId(creatorId))
  if (!creator) return null
  const entitlements = await fabricationEntitlements(creator.userId)
  if (!entitlements.canManage) return null
  const page = await fabricationCatalogPage(creator.userId, { ...options, publicOnly: true })
  const catalog = publicFabricationCatalog(page.catalog)
  if (!catalog?.enabled) return null
  return {
    catalog, nextCursor: page.nextCursor, total: page.total,
    creator: { id: creator.userId, userId: creator.userId, name: creator.displayName },
  }
}
