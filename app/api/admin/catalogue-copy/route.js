import { NextResponse } from 'next/server'
import { authenticate, UnauthorizedError } from '@/lib/authenticate'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'
import { catalogueCopyCleanup } from '@/lib/catalogueCopyCleanup'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const response = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })

async function handle(req, apply) {
    let userId
    try {
        userId = (await authenticate(req)).userId
        if (!await checkAdminPrivileges(userId)) return response({ error: 'Admin access is required.' }, 403)
    } catch (error) {
        return response({ error: 'Admin access could not be verified.' }, error instanceof UnauthorizedError ? 401 : 503)
    }
    if (apply) {
        const origin = req.headers.get('origin')
        if (origin && origin !== new URL(req.url).origin) return response({ error: 'Invalid request origin.' }, 403)
        const body = await req.json().catch(() => null)
        if (body?.action !== 'clean-catalogue-copy') return response({ error: 'Invalid cleanup action.' }, 400)
    }
    try { return response(await catalogueCopyCleanup({ apply, userId })) }
    catch { return response({ error: 'Catalogue cleanup could not finish. Review the catalogue before trying again.' }, 503) }
}
export const GET = req => handle(req, false)
export const POST = req => handle(req, true)
