import { requireGuestTeacher } from '@/lib/workshopGuestAccess'
import { guestDb, classJson, classFailure, sameOrigin, jsonBody } from '@/lib/workshopGuestHttp'
import { inspectTinkercadImport, importTinkercadPool } from '@/lib/workshopTinkercadStore'
export const runtime = 'nodejs'
export async function POST(request) {
    try {
        sameOrigin(request); const access = await requireGuestTeacher(request), input = await jsonBody(request, 50000)
        if (!input || !['preview','import'].includes(input.mode) || Object.keys(input).some(key => !['mode','pool','expectedFingerprint'].includes(key))) throw Object.assign(Error('Choose a private pool file to preview.'), { status: 400 })
        const db = await guestDb()
        return classJson(input.mode === 'preview' ? (await inspectTinkercadImport(db, access, input.pool)).summary : await importTinkercadPool(db, access, input.pool, input.expectedFingerprint))
    } catch (error) { return classFailure(error) }
}
