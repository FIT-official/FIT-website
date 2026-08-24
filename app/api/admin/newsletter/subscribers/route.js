import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db'
import Subscriber from '@/models/Subscriber'
import { authenticate, unauthorizedResponse } from '@/lib/authenticate'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET — subscriber list; ?interestId= filters; ?status= filters.
export async function GET(req) {
    let userId
    try {
        ({ userId } = await authenticate(req))
    } catch {
        return unauthorizedResponse()
    }
    if (!(await checkAdminPrivileges(userId))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    await connectToDatabase()
    const url = new URL(req.url)
    const query = {}
    const interestId = url.searchParams.get('interestId')
    const status = url.searchParams.get('status')
    if (interestId) query.interestIds = interestId
    if (status) query.status = status
    const subscribers = await Subscriber.find(query)
        .select('email fullName interestIds status preferences createdAt')
        .sort({ createdAt: -1 })
        .limit(1000)
        .lean()
    return NextResponse.json({ ok: true, subscribers })
}
