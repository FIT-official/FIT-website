import { Readable } from 'node:stream'
import { authenticate } from '@/lib/authenticate'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'
import { classFailure, privateHeaders } from '@/lib/workshopHttp'
import { openWorkshopBackupSnapshot } from '@/lib/workshopBackupSnapshot'
import { createBackupArchive } from '@/lib/workshopBackupWorkbook'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
    let snapshot
    try {
        const { userId } = await authenticate(request)
        if (!await checkAdminPrivileges(userId)) throw Object.assign(Error('Teacher access required.'), { status: 403 })
        if (new URL(request.url).search) throw Object.assign(Error('Use the complete workshop backup link.'), { status: 400 })
        snapshot = await openWorkshopBackupSnapshot(request.signal)
        const backup = createBackupArchive(snapshot, { signal: request.signal })
        backup.done.finally(() => snapshot.close()).catch(() => {})
        const stamp = new Date(Date.parse(snapshot.metadata.capturedAt) + 8 * 3600000).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '')
        return new Response(Readable.toWeb(backup.stream), { headers: { ...privateHeaders,
            'Content-Type': 'application/zip',
            'Content-Disposition': 'attachment; filename="FIT-workshop-backup-' + stamp + '-SGT.zip"',
            'X-Content-Type-Options': 'nosniff',
        } })
    } catch (error) { await snapshot?.close(); return classFailure(error) }
}
