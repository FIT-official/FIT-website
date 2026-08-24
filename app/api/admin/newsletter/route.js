import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db'
import NewsletterCampaign from '@/models/NewsletterCampaign'
import NewsletterEvent from '@/models/NewsletterEvent'
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

// GET — campaigns with per-campaign event stats.
export async function GET(req) {
    if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    await connectToDatabase()
    const campaigns = await NewsletterCampaign.find({})
        .select('-sentTokens')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean()
    const stats = await NewsletterEvent.aggregate([
        { $group: { _id: { campaignId: '$campaignId', type: '$type' }, count: { $sum: 1 } } },
    ])
    const byCampaign = {}
    for (const s of stats) {
        const id = String(s._id.campaignId)
        byCampaign[id] = byCampaign[id] || {}
        byCampaign[id][s._id.type] = s.count
    }
    for (const c of campaigns) c.stats = byCampaign[String(c._id)] || {}
    return NextResponse.json({ ok: true, campaigns })
}

// POST — create or update a campaign (draft/scheduled only; sent is immutable).
export async function POST(req) {
    if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const body = await req.json().catch(() => null)
    if (!body?.subject) return NextResponse.json({ error: 'Subject required' }, { status: 400 })
    await connectToDatabase()

    const data = {
        subject: String(body.subject).slice(0, 300),
        intro: String(body.intro || '').slice(0, 2000),
        articleIds: Array.isArray(body.articleIds) ? body.articleIds.slice(0, 20) : [],
        audience: {
            type: body.audience?.type === 'interests' ? 'interests' : 'all',
            interestIds: Array.isArray(body.audience?.interestIds) ? body.audience.interestIds : [],
        },
        scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
        status: body.scheduledFor ? 'scheduled' : 'draft',
    }

    let campaign
    if (body._id) {
        const existing = await NewsletterCampaign.findById(body._id)
        if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
        if (['sending', 'sent'].includes(existing.status)) {
            return NextResponse.json({ error: 'Campaign already sent' }, { status: 409 })
        }
        Object.assign(existing, data)
        campaign = await existing.save()
    } else {
        campaign = await NewsletterCampaign.create(data)
    }
    return NextResponse.json({ ok: true, campaign })
}

export async function DELETE(req) {
    if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const body = await req.json().catch(() => null)
    if (!body?._id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    await connectToDatabase()
    await NewsletterCampaign.deleteOne({ _id: body._id, status: { $nin: ['sending'] } })
    return NextResponse.json({ ok: true })
}
