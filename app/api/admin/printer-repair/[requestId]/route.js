import { auth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'
import PrinterRepairRequest from '@/models/PrinterRepairRequest'
import { enforceFabricationRate } from '@/lib/fabrication/serverRateLimit'
import { checkedId, fail, json } from '@/lib/fabrication/serverHttp'
import { repairFailure } from '@/lib/printerRepair/diagnostics'
import { repairTriageDraft } from '@/lib/printerRepair/server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request, context) {
  try {
    const { userId } = await auth()
    if (!userId) fail('Sign in to review this request.', 401)
    if (!(await checkAdminPrivileges(userId))) fail('Forbidden.', 403)
    await enforceFabricationRate(request, 'public', userId)
    await connectToDatabase()
    const row = await PrinterRepairRequest.findOne({ requestId: checkedId((await context.params).requestId, 'request ID') }).lean()
    if (!row) fail('Request not found.', 404)
    return json({ triage: await repairTriageDraft(row) })
  } catch (error) { return repairFailure(error, 'staff_detail') }
}
