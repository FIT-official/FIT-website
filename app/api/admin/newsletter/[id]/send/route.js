import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db'
import NewsletterCampaign from '@/models/NewsletterCampaign'
import { authenticate, unauthorizedResponse } from '@/lib/authenticate'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'
import { dispatchDueCampaigns } from '@/lib/newsletter/dispatch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST — send now: mark due and run the dispatcher inline. The cron is the
// safety net for anything a serverless timeout interrupts (resume via
// sentTokens), so a partial run never double-sends.
export async function POST(req, { params }) {
    let userId
    try {
        ({ userId } = await authenticate(req))
    } catch {
        return unauthorizedResponse()
    }
    if (!(await checkAdminPrivileges(userId))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { id } = await params
    await connectToDatabase()
    const campaign = await NewsletterCampaign.findOneAndUpdate(
        { _id: id, status: { $in: ['draft', 'scheduled'] } },
        { status: 'scheduled', scheduledFor: new Date() },
        { new: true },
    )
    if (!campaign) return NextResponse.json({ error: 'Not found or already sent' }, { status: 409 })
    const summary = await dispatchDueCampaigns()
    return NextResponse.json({ ok: true, summary })
}
