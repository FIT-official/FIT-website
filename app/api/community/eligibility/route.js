import { auth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import { enforceFabricationRate } from '@/lib/fabrication/serverRateLimit'
import { fail, failure, json } from '@/lib/fabrication/serverHttp'
import { eligibleRequests } from '@/lib/community/server'
export const dynamic = 'force-dynamic'
export async function GET(request) {
  try {
    const { userId } = await auth()
    if (!userId) fail('Sign in to see your completed requests.', 401)
    await enforceFabricationRate(request, 'public', userId)
    await connectToDatabase()
    return json({ eligible: await eligibleRequests(userId, new URL(request.url).searchParams.get('subject')) })
  } catch (error) { return failure(error) }
}
