import { auth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import { enforceFabricationRate } from '@/lib/fabrication/serverRateLimit'
import { enforceCommunityPostingRate } from '@/lib/community/rateLimit'
import { fail, failure, json, readJson } from '@/lib/fabrication/serverHttp'
import { createEntry, publicEntries, requireCommunityOrigin } from '@/lib/community/server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request) {
  try {
    const { userId } = await auth()
    await enforceFabricationRate(request, 'public', userId)
    const params = new URL(request.url).searchParams
    await connectToDatabase()
    return json(await publicEntries(params.get('kind'), params.get('subject'), params.get('cursor')))
  } catch (error) { return failure(error) }
}
export async function POST(request) {
  try {
    requireCommunityOrigin(request)
    const { userId } = await auth()
    if (!userId) fail('Sign in to post a comment or review.', 401)
    await enforceCommunityPostingRate(request, userId)
    const body = await readJson(request, 8192)
    await connectToDatabase()
    const result = await createEntry(body, userId)
    return json(result, result.replayed ? 200 : 201)
  } catch (error) { return failure(error) }
}
