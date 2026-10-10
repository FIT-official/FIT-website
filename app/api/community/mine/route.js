import { communityRequest } from '@/lib/community/server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const GET = request => communityRequest(request, { signedIn: true }, (store, user, body, params) => store.list(params, user))
