import { communityRequest } from '@/lib/community/server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(request, context) {
  return communityRequest(request, { signedIn: true, write: true, rate: 'report' }, async (store, user, body) => store.report((await context.params).entryId, body, user))
}
