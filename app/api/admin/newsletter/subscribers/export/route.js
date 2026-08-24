import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { connectToDatabase } from '@/lib/db'
import Subscriber from '@/models/Subscriber'
import Interest from '@/models/Interest'
import { authenticate, unauthorizedResponse } from '@/lib/authenticate'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET — xlsx export of the subscriber list (optionally ?interestId=).
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
    const interestId = url.searchParams.get('interestId')
    const query = interestId ? { interestIds: interestId } : {}

    const [subscribers, interests] = await Promise.all([
        Subscriber.find(query).select('email fullName interestIds status createdAt').sort({ createdAt: -1 }).lean(),
        Interest.find({}).select('name').lean(),
    ])
    const interestName = Object.fromEntries(interests.map((i) => [String(i._id), i.name]))

    const rows = subscribers.map((s) => ({
        Email: s.email,
        Name: s.fullName || '',
        Interests: (s.interestIds || []).map((id) => interestName[id] || id).join(', '),
        Status: s.status,
        Joined: s.createdAt ? new Date(s.createdAt).toISOString().slice(0, 10) : '',
    }))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Subscribers')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    return new NextResponse(buf, {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': 'attachment; filename="subscribers.xlsx"',
        },
    })
}
