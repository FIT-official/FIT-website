import { auth, clerkClient } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import CustomPrintRequest from '@/models/CustomPrintRequest'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'
import { createGuidedRequest } from '@/lib/customPrint/guidedServer'
import { privateFabricationBucket, findOwnedAsset, shapeFabricationAsset } from '@/lib/fabrication/serverAssets'
import { enforceFabricationRate } from '@/lib/fabrication/serverRateLimit'
import { readJson, json, failure, fail, checkedId } from '@/lib/fabrication/serverHttp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(request) {
  try {
    const { userId } = await auth()
    if (!userId) fail('Sign in to send your print enquiry.', 401)
    if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') fail('Open the print form on this website and try again.', 403)
    await enforceFabricationRate(request, 'request', userId)
    const body = await readJson(request)
    await connectToDatabase()
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const result = await createGuidedRequest(body, { userId, userEmail: user.emailAddresses?.find(item => item.id === user.primaryEmailAddressId)?.emailAddress || user.emailAddresses?.[0]?.emailAddress || '', userName: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'Customer' })
    // This is a saved enquiry in the existing admin queue, never an order.
    // Do not send customer messages or invoke the legacy auto-quote notifier.
    return json(result, result.created ? 201 : 200)
  } catch (error) { return failure(error) }
}
export async function GET(request) {
  try {
    const id = new URL(request.url).searchParams.get('requestId')
    if (!id) {
      await enforceFabricationRate(request, 'public', null)
      let uploadsAvailable = false
      try { await privateFabricationBucket(); uploadsAvailable = true } catch { /* link/text enquiries remain available */ }
      return json({ uploadsAvailable, maxBytes: 3 * 1024 * 1024, formats: ['stl', 'obj', '3mf'] })
    }
    const { userId } = await auth()
    if (!userId) fail('Sign in to view this request.', 401)
    await enforceFabricationRate(request, 'public', userId)
    await connectToDatabase()
    const doc = await CustomPrintRequest.findOne({ requestId: checkedId(id) }).lean()
    if (!doc || (doc.userId !== userId && !(await checkAdminPrivileges(userId)))) fail('Request not found.', 404)
    if (!doc.guidedAssetId) fail('No model is attached to this enquiry.', 404)
    return json(await shapeFabricationAsset(await findOwnedAsset(doc.guidedAssetId, doc.userId, 'reference')))
  } catch (error) { return failure(error) }
}
