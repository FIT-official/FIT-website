import { communityRequest } from '@/lib/community/server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(request, context) {
  return communityRequest(request, { signedIn: true, write: true, rate: 'submit' }, async (store, user, body) => store.create(body, user, (await context.params).entryId))
}
