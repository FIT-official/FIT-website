import { enforceFabricationRate } from '@/lib/fabrication/serverRateLimit'

export async function enforceCommunityPostingRate(request, actor) {
  // Bound both one account and a source creating/using multiple accounts.
  // The shared limiter hashes identifiers and fails closed in production.
  await enforceFabricationRate(request, 'community_post', actor)
  await enforceFabricationRate(request, 'community_post_ip')
}
