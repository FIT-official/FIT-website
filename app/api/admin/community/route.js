import { communityRequest } from '@/lib/community/server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const GET = request => communityRequest(request, { admin: true, rate: 'admin' }, (store, user, body, params) => store.queue(params))
export const POST = request => communityRequest(request, { admin: true, write: true, rate: 'admin' }, (store, user, body) => store.moderate(body, user))
