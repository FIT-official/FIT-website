import { auth } from '@clerk/nextjs/server'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'
import { connectToDatabase } from '@/lib/db'
import { enforceFabricationRate } from '@/lib/fabrication/serverRateLimit'
import { fail, failure, json, readJson } from '@/lib/fabrication/serverHttp'
import { moderateEntry, requireCommunityOrigin } from '@/lib/community/server'
export const dynamic = 'force-dynamic'
export async function PATCH(request, context) {
  try {
    requireCommunityOrigin(request)
    const { userId } = await auth()
    if (!userId) fail('Sign in as a FIT platform admin.', 401)
    if (!await checkAdminPrivileges(userId)) fail('Only FIT platform admins can hide or restore content.', 403)
    await enforceFabricationRate(request, 'write', userId)
    const body = await readJson(request, 2048)
    await connectToDatabase()
    return json(await moderateEntry((await context.params).entryId, body, userId))
  } catch (error) { return failure(error) }
}
