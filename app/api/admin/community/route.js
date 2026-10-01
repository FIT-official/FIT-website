import { auth } from '@clerk/nextjs/server'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'
import { connectToDatabase } from '@/lib/db'
import { enforceFabricationRate } from '@/lib/fabrication/serverRateLimit'
import { fail, failure, json } from '@/lib/fabrication/serverHttp'
import { adminEntries } from '@/lib/community/server'
export const dynamic = 'force-dynamic'
export async function GET(request) {
  try {
    const { userId } = await auth()
    if (!userId) fail('Sign in as a FIT platform admin.', 401)
    if (!await checkAdminPrivileges(userId)) fail('Only FIT platform admins can moderate content.', 403)
    await enforceFabricationRate(request, 'public', userId)
    await connectToDatabase()
    const params = new URL(request.url).searchParams
    return json(await adminEntries(params.get('view') || 'flagged', params.get('cursor')))
  } catch (error) { return failure(error) }
}
