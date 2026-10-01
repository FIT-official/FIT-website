import { auth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import { enforceCommunityPostingRate } from '@/lib/community/rateLimit'
import { fail, failure, json, readJson } from '@/lib/fabrication/serverHttp'
import { reportEntry, requireCommunityOrigin } from '@/lib/community/server'
export const dynamic = 'force-dynamic'
export async function POST(request, context) {
  try {
    requireCommunityOrigin(request)
    const { userId } = await auth()
    if (!userId) fail('Sign in to report content.', 401)
    await enforceCommunityPostingRate(request, userId)
    const body = await readJson(request, 2048)
    await connectToDatabase()
    return json(await reportEntry((await context.params).entryId, body, userId))
  } catch (error) { return failure(error) }
}
