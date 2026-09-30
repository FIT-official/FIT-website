import { auth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import { enforceFabricationRate } from '@/lib/fabrication/serverRateLimit'
import { fail, failure, json, readJson } from '@/lib/fabrication/serverHttp'
import { createRepairRequest, recoverRepairRequest, requireRepairOrigin } from '@/lib/printerRepair/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(request) {
  try {
    requireRepairOrigin(request)
    const { userId } = await auth()
    if (!userId) fail('Sign in to send your assessment request.', 401, 'sign_in_required')
    await enforceFabricationRate(request, 'request', userId)
    const body = await readJson(request)
    await connectToDatabase()
    const result = await createRepairRequest(body, userId)
    return json({ request: result.request }, result.created ? 201 : 200)
  } catch (error) { return failure(error) }
}
export async function GET(request) {
  try {
    const { userId } = await auth()
    if (!userId) fail('Sign in to view your request.', 401)
    await enforceFabricationRate(request, 'public', userId)
    await connectToDatabase()
    return json({ request: await recoverRepairRequest(new URL(request.url).searchParams.get('clientRequestId'), userId) })
  } catch (error) { return failure(error) }
}
