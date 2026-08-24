import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db'
import { dispatchDueCampaigns, dispatchWelcomeDrip } from '@/lib/newsletter/dispatch'
import { verifyCronSecret } from '@/lib/verifyCronSecret'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/newsletters — dispatch due campaigns + advance the welcome
 * drip. Auth: `Authorization: Bearer $CRON_SECRET` (GitHub Actions scheduler,
 * same pattern as the other crons).
 */
export async function GET(req) {
    const secret = process.env.CRON_SECRET
    if (!secret) {
        console.error('[cron:newsletters] CRON_SECRET unset — refusing to run')
        return NextResponse.json({ error: 'Not configured' }, { status: 503 })
    }
    const auth = req.headers.get('authorization') || ''
    if (!verifyCronSecret(auth, `Bearer ${secret}`)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectToDatabase()
    const campaigns = await dispatchDueCampaigns()
    const welcome = await dispatchWelcomeDrip()
    return NextResponse.json({ ok: true, campaigns, welcome })
}
