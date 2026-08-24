import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db'
import Interest from '@/models/Interest'
import { authenticate, UnauthorizedError } from '@/lib/authenticate'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function requireAdmin(req) {
    let userId
    try {
        ({ userId } = await authenticate(req))
    } catch (e) {
        if (e instanceof UnauthorizedError) return null
        throw e
    }
    return (await checkAdminPrivileges(userId)) ? userId : null
}

export async function GET(req) {
    if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    await connectToDatabase()
    const interests = await Interest.find({}).sort({ name: 1 }).lean()
    return NextResponse.json({ ok: true, interests })
}

export async function POST(req) {
    if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const body = await req.json().catch(() => null)
    if (!body?.name) return NextResponse.json({ error: 'Name required' }, { status: 400 })
    await connectToDatabase()
    let interest
    if (body._id) {
        interest = await Interest.findByIdAndUpdate(
            body._id,
            { name: body.name, description: body.description || '', isActive: body.isActive !== false },
            { new: true },
        )
    } else {
        interest = await Interest.create({ name: body.name, description: body.description || '' })
    }
    return NextResponse.json({ ok: true, interest })
}

export async function DELETE(req) {
    if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const body = await req.json().catch(() => null)
    if (!body?._id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    await connectToDatabase()
    await Interest.deleteOne({ _id: body._id })
    return NextResponse.json({ ok: true })
}
