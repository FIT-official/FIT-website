import { communityRequest } from '@/lib/community/server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const GET = request => communityRequest(request, {}, (store, user, body, params) => store.list(params))
export const POST = request => communityRequest(request, { signedIn: true, write: true, rate: 'submit' }, (store, user, body) => store.create(body, user))
