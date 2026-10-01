import { auth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'
import PrinterRepairRequest from '@/models/PrinterRepairRequest'
import { enforceFabricationRate } from '@/lib/fabrication/serverRateLimit'
import { fail, json } from '@/lib/fabrication/serverHttp'
import { repairFailure } from '@/lib/printerRepair/diagnostics'
import { shapeRepairRequest } from '@/lib/printerRepair/server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request) {
  try {
    const { userId } = await auth()
    if (!userId) fail('Sign in to view assessment requests.', 401)
    if (!(await checkAdminPrivileges(userId))) fail('Forbidden.', 403)
    await enforceFabricationRate(request, 'public', userId)
    const params = new URL(request.url).searchParams
    const status = params.get('status') || 'assessment_requested'
    if (!['assessment_requested', 'withdrawn', 'all'].includes(status)) fail('Choose a valid request status.')
    const query = status === 'all' ? {} : { status }
    const cursor = params.get('cursor')
    if (cursor) {
      const parts = cursor.split('|')
      if (parts.length !== 2 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(parts[0]) || !Number.isFinite(Date.parse(parts[0])) || !/^[0-9a-f-]{36}$/i.test(parts[1])) fail('Invalid request page.')
      query.$or = [{ createdAt: { $lt: new Date(parts[0]) } }, { createdAt: new Date(parts[0]), requestId: { $lt: parts[1] } }]
    }
    await connectToDatabase()
    const rows = await PrinterRepairRequest.find(query).sort({ createdAt: -1, requestId: -1 }).limit(21).lean()
    const page = rows.slice(0, 20), last = page.at(-1)
    return json({ requests: page.map(shapeRepairRequest), nextCursor: rows.length > 20 ? `${new Date(last.createdAt).toISOString()}|${last.requestId}` : null })
  } catch (error) { return repairFailure(error, 'staff_queue') }
}
