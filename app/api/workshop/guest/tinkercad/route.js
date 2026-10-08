import { requireGuestAccess, verifyGuestHome } from '@/lib/workshopGuestAccess'
import { guestDb, classJson, classFailure, sameOrigin, jsonBody, limitGuestOperation } from '@/lib/workshopGuestHttp'
import { readTinkercadAssignment, claimTinkercadAssignment } from '@/lib/workshopTinkercadStore'
export const runtime = 'nodejs'
export async function GET(request) {
    try { const access = await requireGuestAccess(request); verifyGuestHome(request, access); return classJson(await readTinkercadAssignment(await guestDb(), access)) }
    catch (error) { return classFailure(error) }
}
export async function POST(request) {
    try {
        sameOrigin(request); const access = await requireGuestAccess(request); verifyGuestHome(request, access)
        const input = await jsonBody(request, 300)
        if (!input || Object.keys(input).length !== 1 || input.expectedSeat !== access.seat) throw Object.assign(Error('Your session changed. Open your own Tinkercad tab.'), { status: 403 })
        const db = await guestDb(); await limitGuestOperation(db, 'tinkercad-' + access.seat, 15)
        await claimTinkercadAssignment(db, access)
        // Recheck expiry/revocation after the write and return a fresh approval view.
        const current = await requireGuestAccess(request)
        if (current.seat !== access.seat) throw Object.assign(Error('Your class session changed.'), { status: 401 })
        return classJson(await readTinkercadAssignment(db, current))
    } catch (error) { return classFailure(error) }
}
