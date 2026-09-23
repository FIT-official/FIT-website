import { auth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import { authorizedFabricationAsset, createFabricationAsset, shapeFabricationAsset } from '@/lib/fabrication/serverAssets'
import { enforceFabricationRate } from '@/lib/fabrication/serverRateLimit'
import { fail, failure, json } from '@/lib/fabrication/serverHttp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30
export async function POST(request) {
  try {
    const { userId } = await auth()
    if (!userId) fail('Sign in to upload an attachment.', 401)
    await enforceFabricationRate(request, 'asset', userId)
    await connectToDatabase()
    return json(await createFabricationAsset(request, userId), 201)
  } catch (error) { return failure(error) }
}
export async function GET(request) {
  try {
    const { userId } = await auth()
    await enforceFabricationRate(request, 'public', userId)
    await connectToDatabase()
    const asset = await authorizedFabricationAsset(new URL(request.url).searchParams.get('assetId'), userId)
    return json(await shapeFabricationAsset(asset))
  } catch (error) { return failure(error) }
}
