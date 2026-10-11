import { auth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'
import { enforceFabricationRate } from '@/lib/fabrication/serverRateLimit'
import { fail, failure } from '@/lib/fabrication/serverHttp'
import { authorizedRepairPhoto } from '@/lib/printerRepair/photos'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request, { params }) {
  try {
    const { userId } = await auth()
    if (!userId) fail('Sign in to view this photo.', 401)
    await enforceFabricationRate(request, 'public', userId)
    await connectToDatabase()
    const photo = await authorizedRepairPhoto((await params).assetId, userId, await checkAdminPrivileges(userId))
    const bytes = Buffer.isBuffer(photo.bytes) ? photo.bytes : Buffer.from(photo.bytes.value())
    return new Response(bytes, { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(bytes.length), 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline; filename="repair-photo.jpg"', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' } })
  } catch (error) { return failure(error) }
}
