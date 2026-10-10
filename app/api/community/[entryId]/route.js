import { communityRequest } from '@/lib/community/server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request, context) {
  return communityRequest(request, {}, async (store, user, body, params) => store.detail((await context.params).entryId, params))
}
export async function PATCH(request, context) {
  return communityRequest(request, { signedIn: true, write: true, rate: 'edit' }, async (store, user, body) => store.edit((await context.params).entryId, body, user))
}
