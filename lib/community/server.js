import { auth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'
import CommunityEntry from '@/models/CommunityEntry'
import CommunityReport from '@/models/CommunityReport'
import { FabricationError, fail, json, readJson } from '@/lib/fabrication/serverHttp'
import { communityRate } from './rateLimit'
import { communityStore } from './store'

let indexesReady
async function store(write) {
  await connectToDatabase()
  if (write) {
    if (!indexesReady) indexesReady = Promise.all([CommunityEntry.createIndexes(), CommunityReport.createIndexes()]).catch(error => { indexesReady = null; throw error })
    await indexesReady
  }
  return communityStore(CommunityEntry.collection, CommunityReport.collection)
}
export async function communityRequest(request, { signedIn = false, admin = false, write = false, rate = 'read' } = {}, action) {
  try {
    if (write && (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site')) fail('Open the community form on this website and try again.', 403, 'invalid_origin')
    let userId = null
    if (signedIn || admin) {
      userId = (await auth()).userId
      if (!userId) fail('Sign in to continue.', 401)
      if (admin && !await checkAdminPrivileges(userId)) fail('Forbidden.', 403)
    }
    await communityRate(request, rate, userId)
    const body = write ? await readJson(request, 32768) : null
    const result = await action(await store(write), userId, body, new URL(request.url).searchParams)
    return json(result, result.created === true ? 201 : 200)
  } catch (error) {
    if (error instanceof FabricationError) return json({ error: error.message, code: error.code }, error.status)
    // Never include content, user identifiers, connection strings or provider errors.
    console.warn('Community request unavailable')
    return json({ error: 'Community is temporarily unavailable. Your draft is still here; check My submissions before retrying.', code: 'service_unavailable' }, 503)
  }
}
