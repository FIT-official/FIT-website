import { auth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import FabricationRequest from '@/models/FabricationRequest'
import { shapeFabricationRequest, updateFabricationRequest } from '@/lib/fabrication/serverRequests'
import { enforceFabricationRate } from '@/lib/fabrication/serverRateLimit'
import { checkedId, fail, failure, json, readJson } from '@/lib/fabrication/serverHttp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(_request, props) {
  try {
    const { userId } = await auth()
    if (!userId) fail('Unauthorized.', 401)
    const { requestId } = await props.params
    await connectToDatabase()
    const job = await FabricationRequest.findOne({ requestId: checkedId(requestId, 'request ID'),
      $or: [{ customerUserId: userId }, { creatorUserId: userId }] }).lean()
    if (!job) fail('Request not found.', 404)
    return json({ request: await shapeFabricationRequest(job) })
  } catch (error) { return failure(error) }
}
export async function PATCH(request, props) {
  try {
    const { userId } = await auth()
    if (!userId) fail('Unauthorized.', 401)
    await enforceFabricationRate(request, 'write', userId)
    const { requestId } = await props.params
    const body = await readJson(request, 8192)
    await connectToDatabase()
    return json({ request: await updateFabricationRequest(requestId, body, userId) })
  } catch (error) { return failure(error) }
}
