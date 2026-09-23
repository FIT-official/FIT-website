import { auth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import { estimateFabrication } from '@/lib/fabrication/serverRequests'
import { enforceFabricationRate } from '@/lib/fabrication/serverRateLimit'
import { failure, json, readJson } from '@/lib/fabrication/serverHttp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(request) {
  try {
    const { userId } = await auth()
    await enforceFabricationRate(request, 'estimate', userId)
    const body = await readJson(request)
    await connectToDatabase()
    return json({ estimate: await estimateFabrication(body, userId) })
  } catch (error) { return failure(error) }
}
