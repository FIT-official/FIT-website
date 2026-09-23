import { auth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import FabricationRequest from '@/models/FabricationRequest'
import { createFabricationRequest, shapeFabricationRequest } from '@/lib/fabrication/serverRequests'
import { requestPageOptions, nextRequestCursor } from '@/lib/fabrication/serverRequestPages'
import { enforceFabricationRate } from '@/lib/fabrication/serverRateLimit'
import { fail, failure, json, readJson } from '@/lib/fabrication/serverHttp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(request) {
  try {
    const { userId } = await auth()
    if (!userId) fail('Sign in to submit your request.', 401)
    await enforceFabricationRate(request, 'request', userId)
    const body = await readJson(request)
    await connectToDatabase()
    const result = await createFabricationRequest(body, userId)
    return json({ request: result.request }, result.created ? 201 : 200)
  } catch (error) { return failure(error) }
}

export async function GET(request) {
  try {
    const { userId } = await auth()
    if (!userId) fail('Unauthorized.', 401)
    const { role, limit, olderThan } = requestPageOptions(request.url)
    await connectToDatabase()
    // Job history is intentionally available without a current Pro subscription.
    const jobs = await FabricationRequest.find({ [role === 'provider' ? 'creatorUserId' : 'customerUserId']: userId, ...olderThan })
      .sort({ createdAt: -1, requestId: -1 }).limit(limit + 1).lean()
    const page = jobs.slice(0, limit)
    return json({ requests: await Promise.all(page.map(shapeFabricationRequest)),
      nextCursor: jobs.length > limit ? nextRequestCursor(page[page.length - 1]) : null })
  } catch (error) { return failure(error) }
}
