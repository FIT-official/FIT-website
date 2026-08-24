import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db'
import WelcomeSequence from '@/models/WelcomeSequence'
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
    const sequence = await WelcomeSequence.findById('welcome-sequence').lean()
    return NextResponse.json({ ok: true, sequence: sequence || { isActive: false, steps: [] } })
}

export async function PUT(req) {
    if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    const steps = (Array.isArray(body.steps) ? body.steps : [])
        .slice(0, 10)
        .filter((s) => s?.subject)
        .map((s) => ({
            delayDays: Math.max(0, Number(s.delayDays) || 0),
            subject: String(s.subject).slice(0, 300),
            body: String(s.body || '').slice(0, 10000),
        }))
    await connectToDatabase()
    const sequence = await WelcomeSequence.findByIdAndUpdate(
        'welcome-sequence',
        { isActive: !!body.isActive, steps },
        { new: true, upsert: true },
    )
    return NextResponse.json({ ok: true, sequence })
}
