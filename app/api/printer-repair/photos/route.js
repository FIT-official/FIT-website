import { auth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import { enforceFabricationRate } from '@/lib/fabrication/serverRateLimit'
import { fail, failure, json } from '@/lib/fabrication/serverHttp'
import { requireRepairOrigin } from '@/lib/printerRepair/server'
import { createRepairPhoto } from '@/lib/printerRepair/photos'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30
export async function POST(request) {
  try {
    requireRepairOrigin(request)
    const { userId } = await auth()
    if (!userId) fail('Sign in to upload a photo.', 401)
    await enforceFabricationRate(request, 'asset', userId)
    await connectToDatabase()
    return json(await createRepairPhoto(request, userId), 201)
  } catch (error) { return failure(error) }
}
