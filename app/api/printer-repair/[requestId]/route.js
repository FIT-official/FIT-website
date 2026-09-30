import { auth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import { enforceFabricationRate } from '@/lib/fabrication/serverRateLimit'
import { fail, failure, json, readJson } from '@/lib/fabrication/serverHttp'
import { ownedRepairRequest, requireRepairOrigin, shapeRepairRequest, withdrawRepairRequest } from '@/lib/printerRepair/server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request, context) {
  try {
    const { userId } = await auth()
    if (!userId) fail('Sign in to view your request.', 401)
    await enforceFabricationRate(request, 'public', userId)
    await connectToDatabase()
    return json({ request: shapeRepairRequest(await ownedRepairRequest((await context.params).requestId, userId)) })
  } catch (error) { return failure(error) }
}
export async function PATCH(request, context) {
  try {
    requireRepairOrigin(request)
    const { userId } = await auth()
    if (!userId) fail('Sign in to withdraw your request.', 401)
    await enforceFabricationRate(request, 'write', userId)
    const body = await readJson(request, 1024)
    if (Object.keys(body).length !== 1 || body.action !== 'withdraw') fail('Choose withdraw to close this assessment request.')
    await connectToDatabase()
    return json({ request: await withdrawRepairRequest((await context.params).requestId, userId) })
  } catch (error) { return failure(error) }
}
